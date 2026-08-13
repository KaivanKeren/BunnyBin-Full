"""Klasifikasi lewat VLM cloud, dengan model lokal sebagai cadangan.

Dipakai saat CV_MODE=vlm (Claude) atau CV_MODE=gemini. Berbeda dari YoloClassifier
yang mengenali 9 kelas hasil latihan, model bahasa-visual membaca gambar dan menalar
dengan bahasa — jadi ia bisa menyebut objek di luar 9 kelas itu, menjawab dalam Bahasa
Indonesia, dan yang paling penting untuk kiosk: mengatakan bahwa TIDAK ADA sampah di
frame.

Kemampuan terakhir itu menutup lubang nyata. Dataset yang melatih best.pt tidak memuat
satu pun gambar latar (`645 images, 0 backgrounds`), sehingga model lokal tidak pernah
belajar wujud "tidak ada apa-apa" dan memaksakan salah satu kelasnya pada tangan anak
atau tepi tong sampah.

PEMBAGIAN TANGGUNG JAWAB
------------------------
`VlmClassifier` memegang semua yang tidak bergantung penyedia: skema jawaban, pemetaan
keyakinan, prompt, penguraian JSON, dan jalur cadangan. Subclass hanya mengisi `_ask()`
— satu panggilan API yang mengembalikan teks JSON atau melempar exception.

Pembagian ini bukan hiasan: ia membuat pergantian penyedia menyentuh ~30 baris, dan
membuat test perilaku (kapan jatuh ke cadangan, kapan "none" bukan kegagalan) berlaku
untuk semua penyedia tanpa ditulis ulang.

CADANGAN OTOMATIS
-----------------
Setiap kegagalan `_ask()` — timeout, koneksi putus, status non-2xx, pemblokiran
keamanan, JSON tak sesuai skema — jatuh ke classifier lokal, bukan melempar exception
ke atas. Kiosk dan Laravel tidak perlu tahu apa pun soal ini; keduanya tetap menerima
`Detection` yang sama bentuknya.

`model_version` selalu menandai jalur mana yang benar-benar melayani, sehingga
kegagalan senyap terlihat di log dan di respons — bukan tersamar sebagai keberhasilan.
"""

import base64
import json
import logging
import re
import time
from abc import abstractmethod
from dataclasses import asdict, dataclass
from io import BytesIO

from PIL import Image

from app.inference.base import Classifier, Detection

log = logging.getLogger("cv.vlm")

# ── KUOTA ─────────────────────────────────────────────────────────────────────
# Kena batas laju BUKAN kegagalan biasa, dan memperlakukannya begitu adalah bug
# yang paling mahal di layanan ini.
#
# Free tier Gemini memberi 10 permintaan/menit. Loop kiosk memanggil tiap 2 dtk
# (~13/menit pada latensi nyata), jadi SATU kiosk saja sudah melewatinya. Begitu
# 429 pertama datang, tiap panggilan berikutnya juga 429 — dan karena semuanya
# ditangkap sebagai "gagal, pakai cadangan", kiosk berjalan penuh di bobot lokal
# tanpa satu pun tanda di layar.
#
# Dua akibat yang harus dipisahkan:
#   1. Kualitas. Jawaban datang dari model lain. Itu urusan `degraded` di
#      Detection — kiosk harus TAHU, bukan menebak.
#   2. Biaya. Menembak 429 tiga puluh kali per menit memakan jatah harian yang
#      sudah habis dan menambah satu round-trip gagal ke tiap pemindaian.
#      Itu urusan pemutus di bawah.
#
# Pemutus memakai backoff berlipat, bukan jeda tetap, karena satu kode 429 tidak
# memberi tahu batas MANA yang tersentuh. Habis per-menit pulih sendiri dalam 60
# dtk; habis per-hari tidak pulih sampai besok. Melipatgandakan jeda menangani
# keduanya tanpa perlu membedakan: yang per-menit sembuh di percobaan pertama,
# yang per-hari melandai ke penyelidikan tiap 15 menit alih-alih tiap 2 detik.
QUOTA_COOLDOWN_S = 60.0  # jendela RPM free tier
QUOTA_COOLDOWN_MAX_S = 900.0  # atap saat yang habis adalah kuota HARIAN

# "retryDelay": "31s" di dalam google.rpc.RetryInfo. Bila penyedia menyebut
# angkanya sendiri, itu selalu lebih baik daripada tebakan backoff kita.
_RETRY_DELAY_RE = re.compile(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"')


class QuotaExhausted(RuntimeError):
    """Penyedia menolak karena kuota/batas laju (HTTP 429)."""

    def __init__(self, message: str, retry_after_s: float | None = None):
        super().__init__(message)
        self.retry_after_s = retry_after_s


class ProviderBlocked(RuntimeError):
    """Filter keamanan penyedia menolak permintaan atau memotong jawabannya.

    Dipisahkan dari kegagalan jaringan karena obatnya berbeda sama sekali:
    jaringan putus akan pulih sendiri, sedangkan pemblokiran yang berulang berarti
    frame kiosk memicu filter — dan frame kiosk BERISI ANAK-ANAK. Digabung jadi
    satu penghitung "gagal", pola itu tidak akan pernah terlihat.
    """


def is_quota_error(exc: BaseException) -> bool:
    """429 dari penyedia mana pun, tanpa mengimpor SDK-nya.

    Pemeriksaan bebek disengaja. `google.genai` dan `anthropic` adalah dependensi
    OPSIONAL — mengimpor kelas errornya di sini membuat modul ini gagal dimuat di
    lingkungan yang hanya memasang salah satunya (dan di venv test, keduanya tidak
    ada). Keduanya sama-sama memaparkan kode status sebagai atribut, jadi bentuk
    inilah kontrak yang sebenarnya kita andalkan.
    """
    if isinstance(exc, QuotaExhausted):
        return True
    for attr in ("code", "status_code"):
        if getattr(exc, attr, None) == 429:
            return True
    # Gemini memakai status gRPC; Anthropic memakai tipe error bernama.
    status = getattr(exc, "status", None)
    return status in ("RESOURCE_EXHAUSTED", "rate_limit_error")


def retry_after_seconds(exc: BaseException) -> float | None:
    """Jeda yang DIMINTA penyedia, bila ia menyebutkannya."""
    explicit = getattr(exc, "retry_after_s", None)
    if isinstance(explicit, (int, float)) and explicit > 0:
        return float(explicit)
    match = _RETRY_DELAY_RE.search(str(getattr(exc, "details", "")) or str(exc))
    return float(match.group(1)) if match else None


@dataclass
class VlmStats:
    """Penghitung untuk /health — supaya penurunan mutu bisa dilihat, bukan diduga."""

    calls: int = 0
    ok: int = 0
    fallback: int = 0
    quota_hits: int = 0
    skipped_quota: int = 0  # panggilan yang TIDAK dikirim karena pemutus terbuka
    skipped_rate: int = 0  # ...karena batas laju sendiri
    cache_hits: int = 0  # ...karena frame ini sudah pernah dijawab


# ── CACHE FRAME ───────────────────────────────────────────────────────────────
# Selama satu pemindaian, anak memegang benda yang sama di depan kamera selama
# beberapa detik. Loop kiosk mengirim frame tiap 2 detik, jadi satu sortiran
# normal membayar 2-3 panggilan untuk jawaban yang sama persis.
#
# Hash isi gambar biasa tidak menolong: derau sensor membuat tiap frame unik di
# level byte. dHash membandingkan KECERAHAN ANTAR-PIKSEL bersebelahan, sehingga
# tahan derau dan perubahan pencahayaan kecil, tapi tetap berubah banyak bit
# begitu bendanya benar-benar berganti.
DHASH_SIZE = 8  # 8x8 pembandingan -> 64 bit
# Jarak Hamming maksimum yang masih dianggap "frame yang sama". Sengaja ketat:
# ambang longgar berarti anak yang mengganti benda mendapat jawaban benda
# sebelumnya — kesalahan yang jauh lebih buruk daripada satu panggilan ekstra.
DHASH_MAX_DISTANCE = 5


def dhash(image: Image.Image) -> int:
    """Sidik jari persepsi 64-bit: setiap bit = "piksel ini lebih terang dari tetangga kanannya"."""
    small = image.convert("L").resize((DHASH_SIZE + 1, DHASH_SIZE))
    px = small.load()
    bits = 0
    for y in range(DHASH_SIZE):
        for x in range(DHASH_SIZE):
            bits = (bits << 1) | int(px[x, y] > px[x + 1, y])
    return bits


# Keyakinan kategorikal, bukan angka. VLM tidak menghasilkan probabilitas
# terkalibrasi: diminta menyebut angka, ia cenderung menjawab 0.9 untuk apa pun,
# dan CV_CONFIDENCE_THRESHOLD berubah jadi konfigurasi mati yang tak pernah
# menyaring apa-apa. Tiga tingkat yang dipetakan di sini menjaga ambang itu tetap
# bermakna — "rendah" jatuh di bawah 0.6, sehingga endpoint me-null-kan kategorinya
# dan kiosk memperlakukannya sebagai "belum terdeteksi": mencoba lagi, lalu jatuh ke
# mode manual bila waktu pindai habis.
CERTAINTY = {"tinggi": 0.95, "sedang": 0.70, "rendah": 0.40}

SCHEMA = {
    "type": "object",
    "properties": {
        "kategori": {"type": "string", "enum": ["organic", "inorganic", "none"]},
        "nama_objek": {"type": "string"},
        "yakin": {"type": "string", "enum": ["tinggi", "sedang", "rendah"]},
    },
    "required": ["kategori", "nama_objek", "yakin"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Kamu adalah pengenal sampah pada kiosk edukasi di sekolah dasar di Indonesia.

Seorang anak menunjukkan satu benda ke kamera. Tentukan benda itu sampah organik atau
anorganik, lalu sebutkan namanya dalam Bahasa Indonesia sehari-hari yang dimengerti anak
SD — misalnya "Kulit Pisang", "Botol Plastik", "Bungkus Snack", "Masker".

Aturan:
- organic  = bisa membusuk secara alami: sisa makanan, kulit buah, daun, ampas.
- inorganic = tidak bisa membusuk: plastik, kaleng, kaca, styrofoam, masker, kertas.
- none = tidak ada sampah yang jelas di frame. Pakai ini bila yang terlihat hanya
  tangan kosong, wajah, meja, lantai, atau latar ruangan. Jangan menebak-nebak.

Tingkat keyakinan:
- tinggi = benda terlihat jelas dan kamu yakin kategorinya.
- sedang = benda terlihat tapi sebagian tertutup, buram, atau ambigu.
- rendah = kamu ragu. Lebih baik menjawab rendah daripada menebak dengan yakin —
  jawaban rendah membuat kiosk bertanya kepada anak alih-alih menyortir keliru."""

USER_PROMPT = "Benda apa ini?"


class VlmClassifier(Classifier):
    """Basis: menguraikan jawaban dan menjaga jalur cadangan. Subclass mengisi `_ask()`."""

    def __init__(
        self,
        version: str,
        fallback: Classifier | None = None,
        max_rpm: int = 0,
        cache_ttl_s: float = 0.0,
    ):
        self._version = version
        self._fallback = fallback
        self.stats = VlmStats()
        # Pemutus kuota. `_quota_until` = 0.0 berarti tertutup (jalur cloud hidup).
        self._quota_until = 0.0
        self._quota_backoff = 0.0
        # Batas laju SENDIRI, ditetapkan lebih rendah dari batas penyedia.
        #
        # Pemutus di atas bereaksi SETELAH kena 429; ini mencegahnya terjadi.
        # Bedanya bukan kosmetik: tiap 429 adalah satu perjalanan bolak-balik
        # yang membuang waktu di dalam jendela pindai anak, dan pada sebagian
        # penyedia ia tetap tercatat sebagai permintaan. Menahan diri di sisi
        # kita lebih murah daripada ditolak di sisi sana.
        self._max_rpm = max_rpm
        self._call_times: list[float] = []
        # Cache frame — lihat catatan dHash di atas.
        self._cache_ttl = cache_ttl_s
        self._cache: list[tuple[int, float, Detection]] = []

    @property
    def model_loaded(self) -> bool:
        return True

    @property
    def quota_blocked_for(self) -> float:
        """Sisa detik sebelum jalur cloud dicoba lagi. 0 = sedang melayani."""
        return max(0.0, self._quota_until - time.monotonic())

    def health(self) -> dict:
        """Ringkasan untuk /health. Ini yang membuat mode terdegradasi terlihat
        tanpa harus membaca log baris demi baris."""
        return {
            **asdict(self.stats),
            "quota_blocked_for_s": round(self.quota_blocked_for, 1),
            "fallback_available": self._fallback is not None,
            "max_rpm": self._max_rpm,
            "cache_ttl_s": self._cache_ttl,
        }

    def _trip_quota_breaker(self, exc: BaseException) -> None:
        self.stats.quota_hits += 1
        asked = retry_after_seconds(exc)

        if asked:
            cooldown = min(asked, QUOTA_COOLDOWN_MAX_S)
        else:
            cooldown = min(
                max(self._quota_backoff * 2, QUOTA_COOLDOWN_S), QUOTA_COOLDOWN_MAX_S
            )

        self._quota_backoff = cooldown
        self._quota_until = time.monotonic() + cooldown
        log.error(
            "KUOTA %s HABIS — jalur cloud dijeda %.0f dtk (%s). Selama jeda, "
            "SEMUA klasifikasi dilayani model lokal: mutunya berbeda dan "
            "responsnya ditandai degraded=true.",
            self._version, cooldown, "diminta penyedia" if asked else "backoff",
        )

    def _reset_quota_breaker(self) -> None:
        if self._quota_until:
            log.info("Kuota %s pulih — jalur cloud melayani lagi", self._version)
        self._quota_until = 0.0
        self._quota_backoff = 0.0

    def _rate_limited(self) -> bool:
        """True bila panggilan berikutnya akan melewati batas laju kita sendiri.

        Jendela geser, bukan ember token: yang dijaga adalah "berapa panggilan
        dalam 60 detik terakhir", dan itu persis bentuk batas yang ditegakkan
        penyedia. Ember token akan mengizinkan letupan yang tetap ditolak 429.
        """
        if self._max_rpm <= 0:
            return False

        now = time.monotonic()
        self._call_times = [t for t in self._call_times if now - t < 60.0]
        return len(self._call_times) >= self._max_rpm

    def _cache_lookup(self, fingerprint: int) -> Detection | None:
        if self._cache_ttl <= 0:
            return None

        now = time.monotonic()
        self._cache = [e for e in self._cache if now - e[1] < self._cache_ttl]

        for cached_fp, _, detection in reversed(self._cache):
            if (cached_fp ^ fingerprint).bit_count() <= DHASH_MAX_DISTANCE:
                return detection
        return None

    def _cache_store(self, fingerprint: int, detection: Detection) -> None:
        # HANYA jawaban jalur utama yang disimpan. Menyimpan hasil cadangan akan
        # mengunci mutu yang lebih rendah selama TTL, bahkan setelah kuota pulih —
        # kegagalan sesaat berubah jadi kegagalan yang memperpanjang dirinya.
        if self._cache_ttl <= 0 or detection.degraded:
            return

        self._cache.append((fingerprint, time.monotonic(), detection))
        # Satu pemindaian paling banyak menghasilkan segelintir entri; batas ini
        # cuma penjaga agar layanan yang menyala berminggu-minggu tidak tumbuh
        # tanpa henti bila TTL dinaikkan sangat tinggi.
        if len(self._cache) > 64:
            del self._cache[:-64]

    @abstractmethod
    def _ask(self, image_jpeg: bytes) -> str:
        """Kirim gambar ke penyedia, kembalikan teks JSON sesuai SCHEMA.

        Melempar exception apa pun bila jawaban tidak bisa dipakai — termasuk saat
        penyedia menolak atau memblokir. Pemanggil menangkapnya dan jatuh ke cadangan.
        """

    def _fall_back(self, image: Image.Image, reason: str, detail: str) -> Detection:
        self.stats.fallback += 1

        if self._fallback is None:
            log.warning(
                "VLM gagal [%s] (%s) dan tidak ada cadangan — objek dianggap tak terdeteksi",
                reason, detail,
            )
            return Detection(
                None, 0.0, None, f"{self._version}-gagal",
                degraded=True, degraded_reason="tanpa-cadangan",
            )

        log.warning("VLM gagal [%s] (%s) — jatuh ke model lokal", reason, detail)
        result = self._fallback.classify(image)
        # Tandai bahwa yang menjawab adalah cadangan. Tanpa ini, kegagalan jaringan
        # terlihat identik dengan keberhasilan di sisi pemanggil.
        return Detection(
            category=result.category,
            confidence=result.confidence,
            bbox=result.bbox,
            model_version=f"{self._version}-cadangan-{result.model_version}",
            label=result.label,
            degraded=True,
            degraded_reason=reason,
        )

    def classify(self, image: Image.Image) -> Detection:
        # Frame yang sama sudah pernah dijawab? Selama satu pemindaian, anak
        # memegang benda yang sama beberapa detik dan kiosk mengirim 2-3 frame
        # yang secara persepsi identik. Ini yang membuat satu sortiran berbiaya
        # satu panggilan, bukan tiga.
        # Dilewati sepenuhnya saat cache mati: dhash() menskala ulang tiap frame,
        # dan ini berjalan di jalur panas setiap pemindaian.
        fingerprint = dhash(image) if self._cache_ttl > 0 else 0
        if self._cache_ttl > 0:
            cached = self._cache_lookup(fingerprint)
            if cached is not None:
                self.stats.cache_hits += 1
                log.debug("Frame identik dengan yang sudah dijawab — memakai cache")
                return cached

        buf = BytesIO()
        image.save(buf, format="JPEG", quality=85)

        # Pemutus terbuka: jangan kirim permintaan yang sudah pasti ditolak 429.
        # Melewatinya menghemat satu round-trip gagal di TIAP pemindaian, dan
        # berhenti menggerus jatah harian yang justru sedang kita tunggu pulih.
        blocked = self.quota_blocked_for
        if blocked > 0:
            self.stats.skipped_quota += 1
            return self._fall_back(image, "kuota", f"pemutus terbuka, {blocked:.0f} dtk lagi")

        # Batas laju sendiri — mencegah 429, bukan bereaksi terhadapnya.
        if self._rate_limited():
            self.stats.skipped_rate += 1
            return self._fall_back(
                image, "batas-laju", f"{self._max_rpm} panggilan/menit sudah terpakai"
            )

        self.stats.calls += 1
        self._call_times.append(time.monotonic())
        try:
            text = self._ask(buf.getvalue())
        except Exception as e:  # noqa: BLE001 — apa pun yang gagal, kiosk harus tetap jalan
            detail = f"{type(e).__name__}: {e}"
            if is_quota_error(e):
                self._trip_quota_breaker(e)
                return self._fall_back(image, "kuota", detail)
            if isinstance(e, ProviderBlocked):
                return self._fall_back(image, "diblokir", detail)
            return self._fall_back(image, "jaringan", detail)

        # Panggilan berhasil menembus — bila pemutus sempat terbuka, tutup lagi.
        self._reset_quota_breaker()

        try:
            data = json.loads(text)
            kategori = data["kategori"]
            nama = data["nama_objek"]
            yakin = data["yakin"]
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            return self._fall_back(image, "skema", f"JSON tak sesuai skema: {e}")

        self.stats.ok += 1

        # "none" adalah jawaban yang SAH, bukan kegagalan: frame memang tidak berisi
        # sampah. Jangan jatuh ke cadangan di sini — model lokal justru akan
        # memaksakan salah satu dari 9 kelasnya, persis perilaku yang ingin dihindari.
        if kategori == "none":
            log.info("VLM: tidak ada sampah di frame")
            detection = Detection(None, 0.0, None, self._version, label=None)
        else:
            detection = Detection(
                category=kategori,
                confidence=CERTAINTY.get(yakin, 0.40),
                bbox=None,  # VLM tidak mengembalikan kotak; overlay kiosk sudah tahan bbox=None
                model_version=self._version,
                label=nama,
            )

        # "none" ikut disimpan. Kamera yang menyorot meja kosong adalah keadaan
        # PALING sering di kiosk yang menyala seharian, dan itu justru frame yang
        # paling stabil dari satu detik ke detik berikutnya — persis kasus yang
        # paling menguntungkan untuk tidak ditanyakan berulang-ulang.
        self._cache_store(fingerprint, detection)
        return detection


class AnthropicVlm(VlmClassifier):
    """Claude vision (CV_MODE=vlm)."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float,
        fallback: Classifier | None = None,
        max_rpm: int = 0,
        cache_ttl_s: float = 0.0,
    ):
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "CV_MODE=vlm membutuhkan package anthropic (pip install anthropic)"
            ) from e

        super().__init__(
            version=model, fallback=fallback, max_rpm=max_rpm, cache_ttl_s=cache_ttl_s
        )
        self._client = Anthropic(api_key=api_key, timeout=timeout, max_retries=1)
        self._model = model
        log.info(
            "VLM Claude siap: model=%s, timeout=%.1fs, cadangan=%s",
            model, timeout, type(fallback).__name__ if fallback else "TIDAK ADA",
        )

    def _ask(self, image_jpeg: bytes) -> str:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=256,
            system=SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64.b64encode(image_jpeg).decode(),
                            },
                        },
                        {"type": "text", "text": USER_PROMPT},
                    ],
                }
            ],
        )

        # Penolakan pengaman datang sebagai HTTP 200 dengan content kosong, BUKAN
        # exception. Membaca content[0] tanpa memeriksa ini akan melempar IndexError
        # pada respons yang sebenarnya sah.
        if response.stop_reason == "refusal":
            raise ProviderBlocked("stop_reason=refusal")

        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            raise RuntimeError("balasan tanpa blok teks")
        return text
