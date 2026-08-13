from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class Detection:
    category: str | None
    confidence: float
    bbox: tuple[float, float, float, float] | None  # normalized 0-1
    model_version: str
    label: str | None = None
    # True bila jawaban ini TIDAK datang dari jalur utama — mis. API cloud kena
    # kuota dan yang menjawab adalah bobot lokal.
    #
    # Dulu satu-satunya jejaknya adalah sisipan "-cadangan-" di dalam
    # model_version, yaitu tanda yang harus diurai dari string dan yang memang
    # tidak pernah diurai siapa pun. Akibatnya kegagalan kuota terlihat persis
    # seperti keberhasilan sepanjang jalur: kiosk menampilkan hasil model
    # cadangan dengan penuh percaya diri, dan tak ada satu pun layar yang
    # menunjukkan bahwa mode cloud sudah berhenti melayani berjam-jam lalu.
    #
    # Sebagai boolean eksplisit, tanda ini ikut sampai ke Laravel dan kiosk,
    # dan bisa dipakai untuk memutuskan sesuatu — bukan cuma dibaca manusia.
    degraded: bool = False
    # Alasan singkat, untuk log dan tooltip kiosk: "kuota", "jaringan",
    # "diblokir", "skema", "tanpa-cadangan". Sengaja pendek dan terbatas supaya
    # bisa diagregasi, bukan pesan exception mentah yang tiap kali berbeda.
    degraded_reason: str | None = None


class Classifier(ABC):
    @abstractmethod
    def classify(self, image: Image.Image) -> Detection: ...

    @property
    def model_loaded(self) -> bool:
        return False
