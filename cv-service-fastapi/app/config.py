from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# ── LABEL MAPS (per model source) ──────────────────────────────────────────────
# Each map converts model-specific labels → API contract category
# ("organic"|"inorganic"). Labels NOT in any map → category None (safe default).

# Model kustom 2-kelas (produksi) — identity mapping
LABEL_MAP_CUSTOM: dict[str, str] = {
    "organic": "organic",
    "inorganic": "inorganic",
}

# Demo COCO (yolov8n pretrained, 80 kelas)
LABEL_MAP_COCO: dict[str, str] = {
    # Makanan/organik
    "banana": "organic",
    "apple": "organic",
    "orange": "organic",
    "broccoli": "organic",
    "carrot": "organic",
    "sandwich": "organic",
    "hot dog": "organic",
    "pizza": "organic",
    "donut": "organic",
    "cake": "organic",
    # Wadah/perkakas/anorganik
    "bottle": "inorganic",
    "wine glass": "inorganic",
    "cup": "inorganic",
    "fork": "inorganic",
    "knife": "inorganic",
    "spoon": "inorganic",
    "bowl": "inorganic",
    "cell phone": "inorganic",
    "scissors": "inorganic",
    "toothbrush": "inorganic",
    "book": "inorganic",
}

# Dataset Kaggle garbage-classification-v2 (10 kelas, model yolov8-cls)
LABEL_MAP_KAGGLE10: dict[str, str] = {
    "biological": "organic",
    "battery": "inorganic",
    "cardboard": "inorganic",
    "clothes": "inorganic",
    "glass": "inorganic",
    "metal": "inorganic",
    "paper": "inorganic",
    "plastic": "inorganic",
    "shoes": "inorganic",
    "trash": "inorganic",
}

# Roboflow organic/inorganic model (cloud API).
# Model `deteksi-sampah-organik-anorganik/3` punya 3 kelas: "Sampah Organik",
# "Sampah Anorganik", dan varian ber-tanda-hubung "Sampah-Anorganik" (label lama
# dataset). Ketiganya WAJIB terpetakan — bila tidak, kelas yang tak terpetakan
# menghasilkan category=None (objek dianggap tak terdeteksi).
LABEL_MAP_ROBOFLOW: dict[str, str] = {
    "organic": "organic",
    "Sampah Organik": "organic",
    "inorganic": "inorganic",
    "Sampah Anorganik": "inorganic",
    "Sampah-Anorganik": "inorganic",
}

# Model deteksi objek BERNAMA — hasil training kustom Binexa. Model mengeluarkan
# nama objek spesifik; peta ini yang menjaga sorting tetap AKURAT (nama objek →
# kategori bin).
#
# Peta ini sengaja LEBIH LUAS daripada satu bobot mana pun. Ada dua konfigurasi
# yang hidup berdampingan — data_named.yaml (10 kelas) dan data_combined.yaml
# (9 kelas, inilah yang jadi models/best.pt) — dan nama seperti `daun_kering`
# atau `sedotan_plastik` muncul di dataset pihak ketiga tanpa pernah masuk
# keduanya. Menyempitkan peta ke satu bobot berarti kelas dari bobot lain
# menghasilkan category=None, yang di endpoint tampak persis seperti "tidak ada
# objek di frame".
#
# Yang PENTING: kelebihan kunci di sini tidak berbahaya, tapi juga bukan bukti
# model bisa mengeluarkannya. YoloClassifier mencatat kelas nyata tiap bobot saat
# start (_warn_unmapped_classes) — di situlah, bukan di sini, kesenjangan antara
# yang dijanjikan peta dan yang sanggup dijawab model bisa dilihat.
LABEL_MAP_NAMED: dict[str, str] = {
    # organik
    "sisa_makanan": "organic",
    "kayu": "organic",
    "kulit_buah": "organic",   # kelas tambahan (data sendiri) — sudah dipetakan
    "daun": "organic",
    "daun_hijau": "organic",
    "daun_kering": "organic",
    "rumput": "organic",
    # anorganik
    "botol_plastik": "inorganic",
    "gelas_plastik": "inorganic",
    "sedotan": "inorganic",
    "sedotan_plastik": "inorganic",
    "wadah_plastik": "inorganic",
    "bungkus_plastik": "inorganic",
    "bungkus_snack": "inorganic",
    "masker": "inorganic",
    "kertas": "inorganic",
    "kaleng": "inorganic",
    "kaca": "inorganic",
}

# DISPLAY_NAMES DIHAPUS (Agu 2026). Isinya cuma versi Title Case dari kunci di
# atas, tidak pernah diimpor siapa pun, dan komentarnya sendiri mengakui bahwa
# frontend sudah mempercantik label lewat prettyLabel(). Tabel kedua yang harus
# ikut diperbarui tiap menambah kelas, tanpa satu pun pembaca — persis bentuk
# yang menyimpan bug: menambah kelas di LABEL_MAP_NAMED tapi lupa di sini tidak
# menghasilkan gejala apa pun, sampai seseorang mengira tabel ini hidup.

# Aggregate: all maps combined (used by YOLO classifier which may load any model)
LABEL_MAP: dict[str, str] = {
    **LABEL_MAP_CUSTOM,
    **LABEL_MAP_COCO,
    **LABEL_MAP_KAGGLE10,
    **LABEL_MAP_ROBOFLOW,
    **LABEL_MAP_NAMED,
}


def resolve_category(label: str | None) -> str | None:
    """Petakan label model apa pun → "organic"|"inorganic"|None.

    Strategi dua lapis supaya tahan variasi penamaan (spasi/tanda-hubung/kapital)
    dan model baru tanpa perlu update peta manual:
      1. Cocokkan persis ke LABEL_MAP (cepat, meliputi label spesifik COCO/Kaggle).
      2. Fallback kata-kunci Indonesia/Inggris. "anorganik"/"inorganic" DICEK
         LEBIH DULU karena string-nya memuat substring "organik"/"organic".
    Label tak dikenal → None (default aman: objek dianggap tak terdeteksi).
    """
    if not label:
        return None
    if label in LABEL_MAP:
        return LABEL_MAP[label]
    low = label.strip().lower()
    if "anorganik" in low or "inorganic" in low or "non-organic" in low:
        return "inorganic"
    if "organik" in low or "organic" in low:
        return "organic"
    return None


class Settings(BaseSettings):
    # Baca .env saat dijalankan langsung di host (uvicorn app.main:app).
    #
    # Tanpa ini, .env DIABAIKAN sepenuhnya dan seluruh nilai jatuh ke default —
    # artinya cv_mode menjadi "dummy", yang mengklasifikasi berdasarkan KECERAHAN
    # gambar. Berkas .env yang isinya benar tetap terlihat benar, layanan start
    # tanpa keluhan, dan satu-satunya petunjuk ada di /health. Itu persis bentuk
    # kegagalan yang paling mahal saat demo.
    #
    # Di Docker tidak ada yang berubah: environment variable dari compose selalu
    # menang atas isi .env.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cv_mode: Literal["dummy", "real", "roboflow", "vlm", "gemini", "openai"] = "dummy"
    cv_confidence_threshold: float = 0.6
    cv_max_image_mb: int = 5
    # Batas DIMENSI, pelengkap cv_max_image_mb yang hanya membatasi byte
    # terkompresi. 40 juta piksel ≈ 6000x6667 — jauh di atas frame kiosk (640 px)
    # tapi cukup rendah untuk menolak decompression bomb sebelum dialokasikan.
    cv_max_pixels: int = 40_000_000
    cv_model_path: str = "/model/best.pt"
    # Folder penampung frame lapangan. KOSONG = mati (default), karena menyimpan
    # gambar anak-anak harus keputusan sadar, bukan perilaku bawaan.
    #
    # Nyalakan saat sesi pengumpulan data, matikan sesudahnya. Isinya adalah
    # bahan baku set evaluasi lapangan — satu-satunya cara mengetahui akurasi
    # sebenarnya, karena metrik training diukur pada dataset publik yang sama.
    cv_capture_dir: str = ""
    # Shared secret yang harus dikirim Laravel di header X-Internal-Token.
    # WAJIB diisi — layanan menolak start bila kosong (lihat app/main.py).
    # Tidak ada nilai default: default apa pun akan jadi kunci yang diketahui
    # publik, dan itu sama saja dengan tidak ada autentikasi.
    cv_internal_token: str = ""
    # Roboflow Cloud API (hosted inference)
    roboflow_api_url: str = "https://detect.roboflow.com"
    roboflow_model_id: str = ""
    roboflow_api_key: str = ""
    # VLM cloud (CV_MODE=vlm) — klasifikasi lewat model bahasa-visual.
    #
    # cv_model_path tetap dipakai di mode ini: bobot lokal jadi CADANGAN yang
    # dipanggil otomatis saat API tak terjangkau, sehingga kiosk tidak pernah
    # melihat kegagalan jaringan. Lihat app/inference/vlm.py.
    #
    # Timeout sengaja lebih kecil daripada timeout Laravel (30 dtk): lapisan
    # terdalam harus menyerah lebih dulu, supaya yang terjadi adalah jatuh ke
    # model lokal — bukan Laravel memutus sambungan saat cadangan belum sempat
    # dicoba.
    anthropic_api_key: str = ""
    vlm_model: str = "claude-haiku-4-5"
    vlm_timeout_s: float = 12.0
    # Batas laju yang KITA tegakkan sendiri, disetel di bawah batas penyedia.
    #
    # Free tier Gemini memberi 10 permintaan/menit. Loop kiosk memanggil tiap 2
    # detik dan, pada latensi nyata ~2,6 dtk, menghasilkan ~13 panggilan/menit —
    # satu kiosk saja sudah melewatinya, sebelum menghitung anak kedua. Tanpa
    # rem di sisi kita, kelebihannya dibayar sebagai 429: perjalanan bolak-balik
    # yang membuang waktu di dalam jendela pindai anak, berulang sepanjang hari.
    #
    # Menahan diri lebih murah daripada ditolak. Kelebihan permintaan dilayani
    # model lokal dan ditandai degraded, sama seperti jalur kuota habis.
    # 0 = matikan rem (mis. saat billing aktif dan batasnya jauh lebih tinggi).
    vlm_max_rpm: int = 10
    # Plafon TOKEN per menit. Untuk beban GAMBAR, inilah batas yang benar-benar
    # habis lebih dulu — bukan jumlah permintaan.
    #
    # Terukur di Groq free tier: 30 permintaan/menit diizinkan, tapi TPM cuma
    # 8.000. Satu frame 640px bernilai ~1.400 token, jadi jatah sesungguhnya ±5
    # permintaan/menit. Rem berbasis permintaan yang disetel 25 tidak pernah
    # aktif sekali pun; ia menghitung satuan yang tak pernah jadi batasnya.
    #
    # 0 = BELUM DIKETAHUI, dan itu default yang disengaja: nilainya dipelajari
    # otomatis dari pesan 429 pertama, yang menyebutkan plafonnya sendiri
    # ("...tokens per minute (TPM): Limit 8000"). Angka dari penyedia selalu
    # lebih dipercaya daripada angka yang ditulis manusia lalu usang diam-diam.
    # Isi manual hanya bila ingin menahan diri SEBELUM 429 pertama terjadi.
    vlm_max_tpm: int = 0
    # Sisi terpanjang gambar yang dikirim ke penyedia. Biaya token naik seiring
    # luas piksel, jadi resolusi berlebih dibayar langsung sebagai lebih sedikit
    # deteksi yang muat dalam satu menit. 512 px lebih dari cukup untuk
    # membedakan botol dari kulit pisang. 0 = kirim apa adanya.
    #
    # Hanya salinan yang dikirim yang dikecilkan; model cadangan tetap menerima
    # gambar asli, karena YOLO harus dijalankan pada resolusi latihnya.
    vlm_max_image_px: int = 512
    # Umur cache frame. Selama satu pemindaian anak memegang benda yang sama, dan
    # kiosk mengirim 2-3 frame yang secara persepsi identik. Nilai ini kira-kira
    # sepanjang SCAN_TIMEOUT_MS kiosk (15 dtk), sehingga satu sortiran normal
    # berbiaya SATU panggilan, bukan tiga. 0 = matikan cache.
    vlm_cache_ttl_s: float = 15.0
    # Gemini (CV_MODE=gemini) — jalur yang sama, penyedia berbeda. Nama modelnya
    # ambil dari daftar di aistudio.google.com; Google cukup sering menggantinya,
    # jadi nilai default di sini bisa saja sudah usang saat kamu memakainya.
    gemini_api_key: str = ""
    # Diverifikasi hidup terhadap API pada 12 Agu 2026. Jangan asumsikan nama ini
    # awet: gemini-2.5-flash masih MUNCUL di models.list() tapi ditolak 404 untuk
    # kunci baru ("no longer available to new users"), jadi daftar model saja tidak
    # membuktikan apa pun — yang membuktikan hanya satu panggilan sungguhan.
    gemini_model: str = "gemini-3.5-flash"
    # LOW memangkas latensi ~40% (4390 ms -> 2627 ms terukur) tanpa mengubah
    # jawaban untuk klasifikasi dua kelas. Dukungannya bergantung model:
    # thinking_budget=0 ditolak 400 oleh gemini-3.5-flash. Kosongkan nilai ini
    # bila mengganti model dan panggilan mulai gagal.
    gemini_thinking_level: str = "LOW"
    # OpenAI-compatible (CV_MODE=openai) — SATU mode untuk semua penyedia yang
    # bicara protokol /chat/completions: Groq (cloud gratis, model open-weight),
    # Ollama (lokal, open-source penuh, tanpa kuota), OpenRouter, LM Studio,
    # llama.cpp. Ganti penyedia = ganti dua nilai ini, tanpa menyentuh kode.
    #
    # Rujukan per Agu 2026 — free tier Groq: 30 permintaan/menit, 14.400/hari
    # (bandingkan Gemini: 10/menit, 1.500/hari). Model vision open-weight yang
    # dihosting Groq: qwen/qwen3.6-27b. Seperti nama model Gemini, ini BISA
    # usang — daftar model di console.groq.com yang jadi sumber kebenaran.
    openai_base_url: str = ""
    # OPSIONAL, beda dari kunci penyedia lain: Ollama/llama.cpp lokal tidak
    # punya konsep API key. Header Authorization hanya dikirim bila terisi.
    openai_api_key: str = ""
    openai_model: str = ""
    # "schema" = kirim response_format json_schema (Groq/OpenRouter/Ollama baru).
    # "off"    = jangan kirim; andalkan instruksi JSON di prompt saja. Pakai ini
    #            bila server menolak response_format dengan 400 — tandanya SEMUA
    #            panggilan tiba-tiba dilayani model cadangan.
    openai_json_mode: Literal["schema", "off"] = "schema"
    # Kendali "thinking" untuk model penalar (Qwen, gpt-oss). TERUKUR terhadap
    # Groq + qwen3.6-27b: bawaan model menulis 677 token penalaran demi jawaban
    # JSON yang isinya ~40 token — 1,44 dtk. Dengan "none": 46 token, 0,22 dtk.
    #
    # Untuk klasifikasi dua kelas, penalaran panjang tidak membeli akurasi apa
    # pun; ia hanya membakar TPM (batas yang sungguh habis lebih dulu) dan
    # memakan jendela pindai anak.
    #
    # KOSONG = jangan kirim parameternya sama sekali. Itu default yang disengaja:
    # server yang tidak mengenalinya membalas 400, dan penolakan itu berakhir
    # sebagai kegagalan SENYAP — layanan tetap hidup, tiap panggilan gagal, lalu
    # semuanya dilayani model cadangan. Isi hanya untuk penyedia yang sudah
    # terbukti menerimanya (Groq: "none").
    openai_reasoning_effort: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
