"""Roboflow Cloud API classifier.

Memanggil Roboflow hosted inference API (detect.roboflow.com) untuk deteksi
objek organik/anorganik. Perlu env: ROBOFLOW_API_URL, ROBOFLOW_MODEL_ID,
ROBOFLOW_API_KEY.
"""

import logging
from io import BytesIO

import httpx
from PIL import Image

from app.config import resolve_category
from app.inference.base import Classifier, Detection

log = logging.getLogger("cv.roboflow")

MODEL_VERSION = "roboflow-cloud"

# Ambang confidence sisi-server (persen). Sengaja rendah supaya objek borderline
# tetap dikembalikan; keputusan terima/tolak akhir dipegang satu sumber tunggal:
# CV_CONFIDENCE_THRESHOLD di app/main.py. overlap = ambang NMS antar-box.
API_CONFIDENCE = 20
API_OVERLAP = 45


class RoboflowClassifier(Classifier):
    """Memanggil Roboflow Cloud API untuk deteksi objek per-frame."""

    def __init__(self, api_url: str, model_id: str, api_key: str):
        self._api_url = api_url.rstrip("/")
        self._model_id = model_id
        self._api_key = api_key
        self._client = httpx.Client(timeout=30.0)
        self._endpoint = f"{self._api_url}/{self._model_id}"
        self._params = {
            "api_key": api_key,
            "confidence": API_CONFIDENCE,
            "overlap": API_OVERLAP,
        }
        log.info("Roboflow Cloud API: model=%s, endpoint=%s", model_id, self._endpoint)

    @property
    def model_loaded(self) -> bool:
        return True

    def classify(self, image: Image.Image) -> Detection:
        buf = BytesIO()
        image.save(buf, format="JPEG", quality=90)
        files = {"file": ("frame.jpg", buf.getvalue(), "image/jpeg")}

        try:
            resp = self._client.post(self._endpoint, params=self._params, files=files)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            log.warning("Roboflow API error %s: %s", e.response.status_code, e.response.text[:200])
            return Detection(None, 0.0, None, MODEL_VERSION)
        except httpx.HTTPError as e:
            log.warning("Roboflow API gagal: %s", e)
            return Detection(None, 0.0, None, MODEL_VERSION)

        predictions = data.get("predictions", [])
        if not predictions:
            return Detection(None, 0.0, None, MODEL_VERSION)

        # Ambil prediksi paling percaya-diri (objek "paling jelas" di frame) —
        # jangan bergantung pada urutan yang dikembalikan API.
        top = max(predictions, key=lambda p: float(p.get("confidence", 0.0)))
        label = top.get("class", "")
        conf = float(top.get("confidence", 0.0))

        bbox = None
        if all(k in top for k in ("x", "y", "width", "height")):
            cx, cy = float(top["x"]), float(top["y"])
            w, h = float(top["width"]), float(top["height"])
            img_w, img_h = image.size
            if img_w > 0 and img_h > 0:
                bbox = (
                    max(0.0, (cx - w / 2) / img_w),
                    max(0.0, (cy - h / 2) / img_h),
                    min(1.0, (cx + w / 2) / img_w),
                    min(1.0, (cy + h / 2) / img_h),
                )

        category = resolve_category(label)
        if category is None:
            log.warning("Roboflow label tak terpetakan: %r (conf=%.3f)", label, conf)

        return Detection(
            category=category,
            confidence=conf,
            bbox=bbox,
            model_version=MODEL_VERSION,
            label=label,
        )
