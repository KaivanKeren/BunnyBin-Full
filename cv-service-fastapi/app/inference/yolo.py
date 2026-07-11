from pathlib import Path

from PIL import Image

from app.config import LABEL_MAP
from app.inference.base import Classifier, Detection


class YoloClassifier(Classifier):
    """Real mode: load weight sekali saat startup. Weight tidak ditemukan
    -> fail fast (jangan silent fallback ke dummy)."""

    def __init__(self, model_path: str):
        path = Path(model_path)

        if not path.is_file():
            raise FileNotFoundError(
                f"CV_MODE=real tetapi weight tidak ditemukan di {model_path}"
            )

        try:
            from ultralytics import YOLO
        except ImportError as e:
            raise RuntimeError(
                "CV_MODE=real membutuhkan package ultralytics "
                "(uncomment di requirements.txt)"
            ) from e

        self._model = YOLO(str(path))
        self._version = path.stem

    @property
    def model_loaded(self) -> bool:
        return True

    def classify(self, image: Image.Image) -> Detection:
        results = self._model(image, verbose=False)
        boxes = results[0].boxes

        if boxes is None or len(boxes) == 0:
            return Detection(None, 0.0, None, self._version)

        best = max(range(len(boxes)), key=lambda i: float(boxes.conf[i]))
        label = results[0].names[int(boxes.cls[best])]
        x1, y1, x2, y2 = (int(v) for v in boxes.xyxy[best].tolist())

        return Detection(
            category=LABEL_MAP.get(label),
            confidence=float(boxes.conf[best]),
            bbox=(x1, y1, x2, y2),
            model_version=self._version,
        )
