import base64
import binascii
import json
import logging
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import anyio
from fastapi import Depends, FastAPI, Header, HTTPException
from PIL import Image, UnidentifiedImageError

from app.config import Settings, get_settings
from app.inference.base import Classifier
from app.inference.dummy import DummyClassifier
from app.schemas import ClassifyRequest, ClassifyResponse, HealthResponse

log = logging.getLogger("cv")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def build_classifier(settings: Settings) -> Classifier:
    if settings.cv_mode == "real":
        from app.inference.yolo import YoloClassifier

        return YoloClassifier(settings.cv_model_path)

    if settings.cv_mode == "roboflow":
        from app.inference.roboflow import RoboflowClassifier

        if not settings.roboflow_model_id:
            raise RuntimeError("CV_MODE=roboflow membutuhkan ROBOFLOW_MODEL_ID")
        if not settings.roboflow_api_key:
            raise RuntimeError("CV_MODE=roboflow membutuhkan ROBOFLOW_API_KEY")
        return RoboflowClassifier(
            api_url=settings.roboflow_api_url,
            model_id=settings.roboflow_model_id,
            api_key=settings.roboflow_api_key,
        )

    if settings.cv_mode == "vlm":
        from app.inference.vlm import AnthropicVlm

        if not settings.anthropic_api_key:
            raise RuntimeError("CV_MODE=vlm membutuhkan ANTHROPIC_API_KEY")

        return AnthropicVlm(
            api_key=settings.anthropic_api_key,
            model=settings.vlm_model,
            timeout=settings.vlm_timeout_s,
            fallback=build_local_fallback(settings),
            max_rpm=settings.vlm_max_rpm,
            cache_ttl_s=settings.vlm_cache_ttl_s,
        )

    if settings.cv_mode == "openai":
        from app.inference.openai_compat import OpenAiCompatVlm

        if not settings.openai_base_url:
            raise RuntimeError(
                "CV_MODE=openai membutuhkan OPENAI_BASE_URL "
                "(mis. https://api.groq.com/openai/v1 atau http://localhost:11434/v1)"
            )
        if not settings.openai_model:
            raise RuntimeError("CV_MODE=openai membutuhkan OPENAI_MODEL")
        # OPENAI_API_KEY sengaja TIDAK diwajibkan: Ollama/llama.cpp lokal tidak
        # memakai kunci. Salah konfigurasi terhadap penyedia cloud tetap ketahuan
        # cepat — 401 pada panggilan pertama, tercatat sebagai degraded=jaringan.

        return OpenAiCompatVlm(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            timeout=settings.vlm_timeout_s,
            fallback=build_local_fallback(settings),
            max_rpm=settings.vlm_max_rpm,
            cache_ttl_s=settings.vlm_cache_ttl_s,
            json_mode=settings.openai_json_mode,
        )

    if settings.cv_mode == "gemini":
        from app.inference.gemini import GeminiVlm

        if not settings.gemini_api_key:
            raise RuntimeError("CV_MODE=gemini membutuhkan GEMINI_API_KEY")

        return GeminiVlm(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout=settings.vlm_timeout_s,
            fallback=build_local_fallback(settings),
            thinking_level=settings.gemini_thinking_level,
            max_rpm=settings.vlm_max_rpm,
            cache_ttl_s=settings.vlm_cache_ttl_s,
        )

    return DummyClassifier()


def build_local_fallback(settings: Settings) -> Classifier | None:
    """Bobot lokal yang dipakai saat API cloud tak terjangkau.

    Kegagalan memuatnya BUKAN alasan menolak start: mode cloud tetap berguna tanpa
    cadangan, dan menggagalkan seluruh layanan karena torch tidak terpasang akan
    mengubah penurunan kualitas menjadi pemadaman total.
    """
    try:
        from app.inference.yolo import YoloClassifier

        return YoloClassifier(settings.cv_model_path)
    except Exception as e:  # noqa: BLE001
        log.warning(
            "Cadangan lokal tidak tersedia (%s) — mode cloud jalan TANPA jaring "
            "pengaman; bila internet putus, objek dianggap tak terdeteksi",
            e,
        )
        return None


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Layanan ini hanya boleh dipanggil Laravel, bukan dunia luar.

    Sebelumnya perlindungannya murni topologi: compose dev mem-bind ke
    127.0.0.1 dan compose produksi berjanji memakai `expose` internal-only. Itu
    benar, tapi seluruhnya bergantung pada konfigurasi jaringan yang belum ada —
    satu kesalahan port di kemudian hari langsung membuka layanan inferensi ke
    internet, dengan biaya CPU/GPU ditanggung sendiri.

    Perbandingan konstan-waktu dipakai supaya panjang/isi token tidak bisa
    disimpulkan dari selisih waktu balasan.
    """
    expected = get_settings().cv_internal_token

    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="X-Internal-Token tidak valid")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Fail fast, pola yang sama dengan YoloClassifier saat weight tidak ada:
    # lebih baik menolak start daripada berjalan diam-diam tanpa autentikasi.
    # Token kosong = endpoint /classify terbuka untuk siapa pun yang bisa
    # menjangkau portnya, dan itu justru kondisi yang ingin dihilangkan.
    if not settings.cv_internal_token:
        raise RuntimeError(
            "CV_INTERNAL_TOKEN wajib diisi — layanan menolak berjalan tanpa "
            "autentikasi. Generate dengan: python -c "
            "\"import secrets; print(secrets.token_urlsafe(32))\""
        )

    log.info("Starting CV service: mode=%s, model=%s", settings.cv_mode, settings.cv_model_path)
    app.state.classifier = build_classifier(settings)
    log.info("Classifier ready: %s", type(app.state.classifier).__name__)
    yield


app = FastAPI(title="Binexa CV Service", lifespan=lifespan)


def decode_and_validate(image_base64: str, settings: Settings) -> Image.Image:
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="image_base64 bukan base64 valid")

    if len(raw) > settings.cv_max_image_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"Gambar melebihi {settings.cv_max_image_mb} MB",
        )

    try:
        image = Image.open(BytesIO(raw))
    except Image.DecompressionBombError:
        # Pillow punya penjaganya sendiri (~178 juta piksel) dan MELEMPAR saat
        # open. Tanpa ditangkap di sini, decompression bomb yang cukup besar
        # justru menghasilkan HTTP 500 — kegagalan server untuk payload yang
        # sebenarnya sudah berhasil ditolak dengan benar.
        raise HTTPException(status_code=422, detail="Dimensi gambar tidak wajar")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Payload bukan gambar valid")

    # Batas BYTE di atas tidak melindungi dari decompression bomb: PNG 5 MB bisa
    # mekar jadi puluhan gigabyte piksel saat di-decode. Pemeriksaan ini terjadi
    # SEBELUM load(), memakai header gambar — jadi bom ditolak tanpa pernah
    # dialokasikan memorinya.
    #
    # Pillow punya MAX_IMAGE_PIXELS bawaan (~178 juta), tapi ambangnya jauh di
    # atas apa pun yang layanan ini butuhkan: kiosk hanya mengirim frame 640 px.
    width, height = image.size
    if width * height > settings.cv_max_pixels:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Dimensi gambar {width}x{height} melebihi batas "
                f"{settings.cv_max_pixels} piksel"
            ),
        )

    try:
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Payload bukan gambar valid")

    return image.convert("RGB")


def capture_frame(image: Image.Image, response: ClassifyResponse, directory: str) -> None:
    """Simpan frame + prediksinya untuk membangun set evaluasi LAPANGAN.

    Kenapa ini ada. Model dilatih dari dataset publik dan diukur pada split dari
    dataset publik yang sama — angkanya menjawab "bisakah ia mengenali foto dari
    fotografer yang sama", bukan "bisakah ia mengenali botol di tangan anak di
    bawah lampu neon kelas". Tanpa gambar dari kamera kiosk sungguhan, tidak ada
    satu pun angka yang bisa dipakai untuk menilai perubahan apa pun.

    Frame ditulis apa adanya, TANPA label kebenaran: yang disimpan adalah tebakan
    model. Melabelinya kerja manusia (lihat training/eval_field.py), dan justru
    tebakan yang tersimpan itu yang membuat pelabelan cepat — sebagian besar
    tinggal dibenarkan, bukan diketik dari nol.

    Kegagalan menulis TIDAK PERNAH menggagalkan klasifikasi. Disk penuh saat demo
    harus berakhir sebagai satu baris warning, bukan sebagai kiosk yang mati.
    """
    try:
        # Satu subfolder per hari — supaya sesi bisa dibedakan tanpa membaca
        # setiap sidecar, dan supaya satu folder tak pernah berisi puluhan ribu
        # berkas setelah beberapa minggu dipakai.
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        target = Path(directory) / day
        target.mkdir(parents=True, exist_ok=True)

        stem = f"{datetime.now(timezone.utc).strftime('%H%M%S')}-{uuid.uuid4().hex[:8]}"
        image.save(target / f"{stem}.jpg", format="JPEG", quality=90)
        (target / f"{stem}.json").write_text(
            json.dumps(
                {
                    "predicted": response.model_dump(),
                    # Diisi manusia saat pelabelan. Dibiarkan null, bukan
                    # dihilangkan, supaya berkas yang belum dilabeli bisa
                    # dihitung — "berapa yang tersisa" adalah pertanyaan pertama
                    # siapa pun yang membuka folder ini.
                    "truth_label": None,
                    "truth_category": None,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    except OSError as e:
        log.warning("Gagal menyimpan frame tangkapan ke %s: %s", directory, e)


@app.post("/classify", response_model=ClassifyResponse, dependencies=[Depends(require_internal_token)])
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    settings = get_settings()
    t0 = time.monotonic()
    image = decode_and_validate(req.image_base64, settings)
    log.info(
        "classify: image %dx%d, mode=%s, model=%s",
        image.width, image.height, settings.cv_mode, settings.cv_model_path,
    )

    # Inference bisa berat (real mode) — jangan blokir event loop.
    detection = await anyio.to_thread.run_sync(app.state.classifier.classify, image)
    elapsed_ms = (time.monotonic() - t0) * 1000

    below_threshold = detection.confidence < settings.cv_confidence_threshold
    log.info(
        "classify: label=%s cat=%s conf=%.3f bbox=%s below_thr=%s degraded=%s%s (%.0fms)",
        detection.label, detection.category, detection.confidence,
        detection.bbox, below_threshold, detection.degraded,
        f" [{detection.degraded_reason}]" if detection.degraded_reason else "",
        elapsed_ms,
    )

    response = ClassifyResponse(
        category=None if below_threshold else detection.category,
        label=detection.label,
        confidence=detection.confidence,
        bbox=detection.bbox,
        model_version=detection.model_version,
        degraded=detection.degraded,
        degraded_reason=detection.degraded_reason,
    )

    # Simpan frame lapangan bila diminta. Ini sumber data satu-satunya yang benar
    # untuk mengukur akurasi NYATA — lihat training/eval_field.py.
    if settings.cv_capture_dir:
        capture_frame(image, response, settings.cv_capture_dir)

    return response


# SENGAJA tanpa autentikasi: HEALTHCHECK di Dockerfile memanggilnya tanpa
# kredensial, dan balasannya tidak memuat apa pun yang sensitif — hanya status,
# mode, apakah model termuat, dan penghitung agregat jalur cloud. Tidak ada nama
# model, kunci, atau isi gambar di sini.
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    classifier = app.state.classifier
    vlm_health = classifier.health() if hasattr(classifier, "health") else None

    return HealthResponse(
        status="ok",
        mode=get_settings().cv_mode,
        model_loaded=classifier.model_loaded,
        vlm=vlm_health,
    )
