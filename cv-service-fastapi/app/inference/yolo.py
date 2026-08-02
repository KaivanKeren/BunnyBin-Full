from pathlib import Path

from PIL import Image

from app.config import resolve_category
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
        self._is_cls = self._model.task == "classify"

        # Inferensi WAJIB pakai resolusi yang sama dengan saat training — kalau
        # tidak, akurasi turun (mis. model dilatih 320 tapi diinfer 640). Baca
        # imgsz dari checkpoint; fallback 224 (cls) / 640 (detect).
        self._imgsz = 224 if self._is_cls else 640
        try:
            train_imgsz = self._model.overrides.get("imgsz") or (
                (self._model.ckpt or {}).get("train_args", {}).get("imgsz")
            )
            if train_imgsz:
                self._imgsz = int(train_imgsz[0] if isinstance(train_imgsz, (list, tuple)) else train_imgsz)
        except Exception:
            pass

    @property
    def model_loaded(self) -> bool:
        return True

    def classify(self, image: Image.Image) -> Detection:
        # Pakai resolusi training model (di-set saat __init__) agar akurat.
        results = self._model(image, imgsz=self._imgsz, verbose=False)
        result = results[0]

        # Model klasifikasi (train_cls.py) — satu label seluruh-frame
        if result.probs is not None:
            top1 = int(result.probs.top1)
            conf = float(result.probs.top1conf)
            label = result.names[top1]
            return Detection(
                category=resolve_category(label),
                confidence=conf,
                bbox=None,
                model_version=self._version,
                label=label,
            )

        # Model deteksi (train.py) — bounding box per objek
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return Detection(None, 0.0, None, self._version)

        best = max(range(len(boxes)), key=lambda i: float(boxes.conf[i]))
        label = result.names[int(boxes.cls[best])]
        x1, y1, x2, y2 = (float(v) for v in boxes.xyxy[best].tolist())

        # Normalize bbox to 0-1 range using the original image dimensions.
        img_w, img_h = image.size
        if img_w > 0 and img_h > 0:
            x1 /= img_w
            y1 /= img_h
            x2 /= img_w
            y2 /= img_h

        return Detection(
            category=resolve_category(label),
            confidence=float(boxes.conf[best]),
            bbox=(x1, y1, x2, y2),
            model_version=self._version,
            label=label,
        )
