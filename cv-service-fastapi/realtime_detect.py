"""Uji coba deteksi objek real-time dari kamera (mis. DroidCam di HP Android)
memakai model YOLO BunnyBin.

Menampilkan window live dengan bounding box + label mentah (COCO/kustom) dan
kategori kontrak BunnyBin ("organik"/"anorganik") hasil pemetaan LABEL_MAP,
plus confidence dan FPS. Tekan `q` untuk keluar, `s` untuk simpan snapshot.

Pakai:
    # DroidCam (default port 4747). Beri host:port lewat --url atau env.
    CV_STREAM_URL=http://10.23.3.187:4747 \\
        .venv-real/bin/python realtime_detect.py

    # atau eksplisit
    .venv-real/bin/python realtime_detect.py --url http://10.23.3.187:4747 \\
        --model models/best-demo.pt --conf 0.5

    # webcam lokal
    .venv-real/bin/python realtime_detect.py --url 0

Mode headless (tanpa window, untuk uji pipa / server tanpa GUI):
    .venv-real/bin/python realtime_detect.py --headless --frames 30 --save-dir out/
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import threading
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # agar `import app` jalan
from app.config import LABEL_MAP  # noqa: E402

# Kategori -> warna BGR untuk box (organik hijau, anorganik biru, lain abu).
CAT_COLOR = {"organic": (60, 200, 60), "inorganic": (230, 140, 40), None: (150, 150, 150)}
CAT_ID = {"organic": "ORGANIK", "inorganic": "ANORGANIK", None: "?"}


# --------------------------------------------------------------------------- #
# Sumber frame                                                                #
# --------------------------------------------------------------------------- #
class MjpegReader:
    """Pembaca MJPEG multipart HTTP di thread latar. Lebih andal untuk DroidCam
    daripada cv2.VideoCapture (yang lewat FFMPEG sering gagal decode)."""

    def __init__(self, url: str, timeout: float = 8.0):
        self.url = url
        self.timeout = timeout
        self._latest: np.ndarray | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._err: str | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> "MjpegReader":
        self._thread.start()
        # tunggu frame pertama (atau error) maksimal `timeout` detik
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            if self._err or self._latest is not None:
                break
            time.sleep(0.05)
        return self

    def _run(self) -> None:
        try:
            req = urllib.request.Request(self.url, headers={"User-Agent": "BunnyBin-RT/1.0"})
            stream = urllib.request.urlopen(req, timeout=self.timeout)
        except Exception as e:  # noqa: BLE001
            self._err = f"tidak bisa buka stream: {e}"
            return

        buf = bytearray()
        while not self._stop.is_set():
            try:
                chunk = stream.read(8192)
            except Exception as e:  # noqa: BLE001
                self._err = f"stream terputus: {e}"
                return
            if not chunk:
                self._err = "stream berakhir (EOF)"
                return
            buf.extend(chunk)
            # cari pasangan penanda JPEG SOI(FFD8) ... EOI(FFD9)
            while True:
                soi = buf.find(b"\xff\xd8")
                eoi = buf.find(b"\xff\xd9", soi + 2) if soi != -1 else -1
                if soi == -1 or eoi == -1:
                    break
                jpg = bytes(buf[soi : eoi + 2])
                del buf[: eoi + 2]
                img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
                if img is not None:
                    with self._lock:
                        self._latest = img

    def read(self) -> tuple[bool, np.ndarray | None]:
        with self._lock:
            if self._latest is None:
                return False, None
            return True, self._latest.copy()

    @property
    def error(self) -> str | None:
        return self._err

    def release(self) -> None:
        self._stop.set()


def _is_streamable(url: str, timeout: float = 5.0) -> str | None:
    """Kembalikan content-type bila URL menyajikan gambar/stream, else None."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BunnyBin-RT/1.0"})
        resp = urllib.request.urlopen(req, timeout=timeout)
        ct = (resp.headers.get("Content-Type") or "").lower()
        resp.close()
        if "multipart" in ct or "image/jpeg" in ct or "mjpeg" in ct:
            return ct
    except Exception:  # noqa: BLE001
        return None
    return None


def _discover_droidcam(base: str) -> list[str]:
    """Susun daftar kandidat URL stream MJPEG untuk sebuah host DroidCam."""
    base = base.rstrip("/")
    cands = [
        f"{base}/mjpegfeed",
        f"{base}/mjpegfeed?1280x720",
        f"{base}/mjpegfeed?640x480",
        f"{base}/video",
        f"{base}/videofeed",
    ]
    # coba baca halaman viewer & tarik <img src=...> / referensi mjpeg
    for page in (f"{base}/video", f"{base}/"):
        try:
            req = urllib.request.Request(page, headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=5).read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            continue
        for m in re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', html, re.I):
            if any(k in m.lower() for k in ("mjpeg", "feed", "stream", ".jpg", "video")):
                url = m if m.startswith("http") else f"{base}/{m.lstrip('/')}"
                if url not in cands:
                    cands.append(url)
    return cands


def open_source(url: str):
    """Kembalikan objek dengan .read()->(ok,frame) dan .release().
    Auto-deteksi: webcam index, MJPEG (reader manual), atau VideoCapture umum."""
    # webcam lokal: index angka
    if url.isdigit():
        cap = cv2.VideoCapture(int(url))
        if not cap.isOpened():
            raise RuntimeError(f"tidak bisa buka webcam index {url}")
        return cap

    is_bare_host = bool(re.fullmatch(r"https?://[^/]+/?", url))
    candidates = _discover_droidcam(url) if is_bare_host else [url]

    # 1) coba MJPEG reader untuk kandidat yang content-type-nya stream
    for cand in candidates:
        if _is_streamable(cand):
            reader = MjpegReader(cand).start()
            if reader.error is None:
                print(f"✓ stream MJPEG: {cand}")
                return reader
            reader.release()

    # 2) fallback: MjpegReader paksa (server kadang tak set content-type benar)
    for cand in candidates:
        reader = MjpegReader(cand).start()
        if reader.error is None:
            print(f"✓ stream MJPEG (paksa): {cand}")
            return reader
        reader.release()

    # 3) fallback terakhir: cv2.VideoCapture / FFMPEG
    for cand in candidates:
        cap = cv2.VideoCapture(cand, cv2.CAP_FFMPEG)
        if cap.isOpened():
            for _ in range(5):
                ok, fr = cap.read()
                if ok and fr is not None:
                    print(f"✓ stream via VideoCapture: {cand}")
                    return cap
                time.sleep(0.2)
        cap.release()

    raise RuntimeError(
        "gagal buka stream. Dicoba:\n  " + "\n  ".join(candidates) +
        "\n\nPastikan app DroidCam di HP AKTIF di depan (bukan background) dan "
        "menampilkan preview kamera, lalu ulangi."
    )


# --------------------------------------------------------------------------- #
# Gambar overlay                                                              #
# --------------------------------------------------------------------------- #
def draw(frame, names, boxes, conf_thr: float) -> tuple[np.ndarray, list[str]]:
    hits: list[str] = []
    if boxes is not None:
        for i in range(len(boxes)):
            conf = float(boxes.conf[i])
            if conf < conf_thr:
                continue
            label = names[int(boxes.cls[i])]
            cat = LABEL_MAP.get(label)
            color = CAT_COLOR[cat]
            x1, y1, x2, y2 = (int(v) for v in boxes.xyxy[i].tolist())
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            txt = f"{label} [{CAT_ID[cat]}] {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
            cv2.putText(frame, txt, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 0, 0), 1, cv2.LINE_AA)
            hits.append(f"{label}->{cat} {conf:.0%}")
    return frame, hits


def draw_cls(frame, probs, names, conf_thr: float) -> tuple[np.ndarray, list[str]]:
    """Overlay untuk model klasifikasi: satu label seluruh-frame + kategori.
    Menampilkan top-1 sebagai banner + top-3 kecil di bawahnya."""
    top1 = int(probs.top1)
    conf = float(probs.top1conf)
    label = names[top1]
    cat = LABEL_MAP.get(label) if conf >= conf_thr else None
    color = CAT_COLOR[cat]

    h, w = frame.shape[:2]
    banner = f"{label.upper()}  [{CAT_ID[cat]}]  {conf:.0%}" if conf >= conf_thr else "..."
    cv2.rectangle(frame, (0, h - 70), (w, h), (0, 0, 0), -1)
    cv2.rectangle(frame, (0, h - 70), (12, h), color, -1)
    cv2.putText(frame, banner, (24, h - 40), cv2.FONT_HERSHEY_SIMPLEX,
                0.9, color, 2, cv2.LINE_AA)

    # top-3 rincian
    top5 = [int(i) for i in probs.top5][:3]
    conf5 = [float(c) for c in probs.top5conf][:3]
    detail = "  ".join(f"{names[i]}:{c:.0%}" for i, c in zip(top5, conf5))
    cv2.putText(frame, detail, (24, h - 14), cv2.FONT_HERSHEY_SIMPLEX,
                0.5, (200, 200, 200), 1, cv2.LINE_AA)

    hits = [f"{label}->{cat} {conf:.0%}"] if conf >= conf_thr else []
    return frame, hits


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="Deteksi objek real-time BunnyBin (YOLO)")
    ap.add_argument("--url", default=os.getenv("CV_STREAM_URL", "http://10.23.3.187:4747"),
                    help="URL DroidCam (host:port), URL stream MJPEG, atau index webcam (mis. 0)")
    ap.add_argument("--model", default=os.getenv("CV_MODEL_PATH", str(HERE / "models/best-demo.pt")))
    ap.add_argument("--conf", type=float, default=float(os.getenv("CV_CONFIDENCE_THRESHOLD", "0.5")))
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--headless", action="store_true", help="tanpa window (untuk server tanpa GUI)")
    ap.add_argument("--frames", type=int, default=0, help="berhenti setelah N frame (0=tak terbatas)")
    ap.add_argument("--save-dir", default=None, help="simpan frame beranotasi ke folder ini")
    args = ap.parse_args()

    if not Path(args.model).is_file():
        sys.exit(f"model tidak ditemukan: {args.model}")

    from ultralytics import YOLO
    print(f"memuat model: {args.model}")
    model = YOLO(args.model)
    is_cls = model.task == "classify"
    print(f"tipe model: {'KLASIFIKASI (1 label/frame)' if is_cls else 'DETEKSI (bounding box)'}")
    if is_cls and args.imgsz == 640:  # default cls jauh lebih kecil
        args.imgsz = 224

    print(f"membuka sumber: {args.url}")
    src = open_source(args.url)

    save_dir = Path(args.save_dir) if args.save_dir else None
    if save_dir:
        save_dir.mkdir(parents=True, exist_ok=True)

    win = "BunnyBin - Deteksi Real-time (q=keluar, s=snapshot)"
    n, t0, fps = 0, time.time(), 0.0
    snap = 0
    try:
        while True:
            ok, frame = src.read()
            if not ok or frame is None:
                time.sleep(0.02)
                if getattr(src, "error", None):
                    sys.exit(f"stream error: {src.error}")
                continue

            res = model(frame, imgsz=args.imgsz, verbose=False)[0]
            if is_cls:
                frame, hits = draw_cls(frame, res.probs, res.names, args.conf)
            else:
                frame, hits = draw(frame, res.names, res.boxes, args.conf)

            n += 1
            if n % 5 == 0:
                now = time.time()
                fps = 5.0 / (now - t0)
                t0 = now
            cv2.putText(frame, f"FPS {fps:4.1f}", (8, 22), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (0, 255, 255), 2, cv2.LINE_AA)

            if save_dir:
                cv2.imwrite(str(save_dir / f"frame_{n:04d}.jpg"), frame)
            if hits and (args.headless or n % 10 == 0):
                print(f"[{n:4d}] fps={fps:4.1f}  " + " | ".join(hits))

            if not args.headless:
                cv2.imshow(win, frame)
                k = cv2.waitKey(1) & 0xFF
                if k == ord("q"):
                    break
                if k == ord("s"):
                    p = f"snapshot_{snap}.jpg"; cv2.imwrite(p, frame)
                    print(f"  snapshot -> {p}"); snap += 1

            if args.frames and n >= args.frames:
                break
    except KeyboardInterrupt:
        pass
    finally:
        src.release()
        if not args.headless:
            cv2.destroyAllWindows()
    print(f"selesai. total frame diproses: {n}")


if __name__ == "__main__":
    main()
