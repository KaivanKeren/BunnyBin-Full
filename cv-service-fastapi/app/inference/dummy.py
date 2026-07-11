from PIL import Image, ImageStat

from app.inference.base import Classifier, Detection

MODEL_VERSION = "dummy-1"


class DummyClassifier(Classifier):
    """Deterministik supaya test integrasi Laravel reproducible:
    gambar gelap (mean brightness < 128) -> organic, terang -> inorganic.
    Tim FE/BE bisa memancing kedua kategori dengan sengaja.
    """

    def classify(self, image: Image.Image) -> Detection:
        brightness = ImageStat.Stat(image.convert("L")).mean[0]

        return Detection(
            category="organic" if brightness < 128 else "inorganic",
            confidence=0.85,
            bbox=None,
            model_version=MODEL_VERSION,
        )
