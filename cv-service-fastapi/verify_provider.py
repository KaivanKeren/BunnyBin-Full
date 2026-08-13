#!/usr/bin/env python3
"""Buktikan sebuah penyedia OpenAI-compatible benar-benar bisa dipakai — SEBELUM
mengubah .env.

KENAPA SKRIP INI ADA
--------------------
Daftar model TIDAK membuktikan apa pun. Proyek ini sudah membayar pelajaran itu:
`gemini-2.5-flash` tetap muncul di `models.list()` tapi ditolak 404 untuk kunci
baru ("no longer available to new users"). Yang membuktikan hanya SATU panggilan
sungguhan yang mengirim gambar dan menerima jawaban.

Dan kegagalannya senyap. Nama model yang salah tidak memunculkan error di layar
kiosk — layanan tetap start, tiap panggilan gagal, lalu jatuh ke best.pt. Tanpa
skrip ini, cara mengetahuinya adalah menyadari bahwa akurasi diam-diam memburuk.

Jadi skrip ini melakukan yang sebenarnya menentukan: mengirim gambar nyata ke
tiap model kandidat, dan melaporkan mana yang menjawab.

PAKAI
-----
    # Groq — kunci gratis dari https://console.groq.com
    python verify_provider.py --api-key gsk_...

    # Ollama lokal (tanpa kunci)
    python verify_provider.py --base-url http://localhost:11434/v1

    # Model tertentu saja, bukan menyisir semua kandidat
    python verify_provider.py --api-key gsk_... --model qwen/qwen3.6-27b

Keluarannya blok .env siap tempel untuk model yang TERBUKTI hidup.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from io import BytesIO
from pathlib import Path

import httpx

# Kata kunci penyaring kandidat. Endpoint /models tidak menyebutkan kemampuan
# vision, jadi kandidat disaring dari namanya lalu DIBUKTIKAN satu per satu —
# menebak dari nama saja persis kekeliruan yang membuat skrip ini perlu ada.
VISION_HINTS = ("vl", "vision", "qwen", "llama-4", "scout", "maverick", "gemma", "pixtral", "gpt-4")
# Model yang jelas bukan vision — disingkirkan lebih dulu supaya tidak membuang
# panggilan (dan kuota) untuk sesuatu yang pasti menolak gambar.
SKIP_HINTS = ("whisper", "tts", "guard", "embed", "rerank", "moderation")

PROMPT = (
    'Benda apa ini? Jawab HANYA JSON: {"kategori":"organic"|"inorganic"|"none",'
    '"nama_objek":"<nama Indonesia>","yakin":"tinggi"|"sedang"|"rendah"}'
)


def load_image(path: Path | None) -> bytes:
    """Foto nyata bila ada; kalau tidak, gambar sintetis yang tetap sah sebagai uji."""
    from PIL import Image

    if path and path.is_file():
        with Image.open(path) as img:
            buf = BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=85)
            return buf.getvalue()

    # Cadangan: ambil sampel dari dataset bila ada di repo ini.
    for candidate in sorted(Path("training/dataset_combined/images/val").glob("*.jpg"))[:1]:
        with Image.open(candidate) as img:
            buf = BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=85)
            print(f"  (memakai sampel dataset: {candidate.name})")
            return buf.getvalue()

    buf = BytesIO()
    Image.new("RGB", (320, 240), (200, 180, 120)).save(buf, format="JPEG")
    print("  (memakai gambar sintetis — jawabannya tidak bermakna, tapi tetap")
    print("   membuktikan model menerima input gambar)")
    return buf.getvalue()


def list_models(client: httpx.Client) -> list[str]:
    try:
        r = client.get("/models")
    except httpx.HTTPError as e:
        print(f"  ✗ tidak bisa menjangkau /models: {e}")
        return []

    if r.status_code != 200:
        print(f"  ✗ /models menjawab HTTP {r.status_code}: {r.text[:160]}")
        return []

    return sorted(m["id"] for m in r.json().get("data", []) if "id" in m)


def try_vision(client: httpx.Client, model: str, image: bytes) -> tuple[bool, str]:
    """Satu panggilan sungguhan. Kembalikan (berhasil, keterangan)."""
    body = {
        "model": model,
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/jpeg;base64," + base64.b64encode(image).decode()
                        },
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    }

    try:
        r = client.post("/chat/completions", json=body, timeout=60.0)
    except httpx.HTTPError as e:
        return False, f"{type(e).__name__}: {e}"

    if r.status_code == 429:
        return False, "429 kuota/batas laju — coba lagi sebentar lagi"
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:120]}"

    try:
        content = r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, json.JSONDecodeError, TypeError) as e:
        return False, f"bentuk balasan tak terduga: {e}"

    if isinstance(content, list):
        content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
    if not content:
        return False, "balasan kosong"

    # Model thinking membungkus jawaban; layanan juga membuangnya (openai_compat.py).
    if "</think>" in content:
        content = content.rsplit("</think>", 1)[-1]

    return True, content.strip().replace("\n", " ")[:160]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="https://api.groq.com/openai/v1")
    ap.add_argument("--api-key", default="", help="kosongkan untuk Ollama/llama.cpp lokal")
    ap.add_argument("--model", default="", help="uji satu model saja, bukan menyisir kandidat")
    ap.add_argument("--image", type=Path, default=None, help="foto uji (opsional)")
    ap.add_argument("--max-candidates", type=int, default=6)
    args = ap.parse_args()

    headers = {"Authorization": f"Bearer {args.api_key}"} if args.api_key else {}
    client = httpx.Client(base_url=args.base_url.rstrip("/"), headers=headers, timeout=30.0)

    print()
    print(f"  Penyedia : {args.base_url}")
    print(f"  Auth     : {'ya' if args.api_key else 'tanpa kunci (lokal)'}")
    print()

    image = load_image(args.image)
    print()

    if args.model:
        candidates = [args.model]
    else:
        print("  Mengambil daftar model…")
        all_models = list_models(client)
        if not all_models:
            print()
            print("  Tidak bisa melanjutkan. Periksa base URL dan API key.")
            return 1
        print(f"  {len(all_models)} model terdaftar.")
        candidates = [
            m for m in all_models
            if any(h in m.lower() for h in VISION_HINTS)
            and not any(s in m.lower() for s in SKIP_HINTS)
        ][: args.max_candidates]
        if not candidates:
            print("  Tidak ada nama yang mirip model vision. Daftar lengkap:")
            for m in all_models:
                print(f"    {m}")
            return 1
        print(f"  {len(candidates)} kandidat vision akan diuji dengan gambar SUNGGUHAN.")

    print()
    working: list[tuple[str, str]] = []
    for model in candidates:
        print(f"  → {model}")
        ok, detail = try_vision(client, model, image)
        if ok:
            print(f"    ✓ HIDUP — jawaban: {detail}")
            working.append((model, detail))
        else:
            print(f"    ✗ {detail}")
    print()

    if not working:
        print("  ═══ TIDAK ADA model yang berhasil ═══")
        print()
        print("  Jangan ubah .env. Kirim keluaran di atas untuk penyesuaian nama model.")
        return 1

    best = working[0][0]
    print("  ═══ TERBUKTI HIDUP ═══")
    for model, _ in working:
        print(f"    {model}")
    print()
    print("  Tempel ke cv-service-fastapi/.env (dan ubah CV_MODE di atasnya):")
    print()
    print("    CV_MODE=openai")
    print(f"    OPENAI_BASE_URL={args.base_url}")
    if args.api_key:
        print("    OPENAI_API_KEY=<kunci kamu>")
    print(f"    OPENAI_MODEL={best}")
    if "groq.com" in args.base_url:
        # Rem kita sendiri, disetel di bawah plafon penyedia — lihat catatan di
        # app/config.py. Groq free tier: 30 RPM.
        print("    VLM_MAX_RPM=25")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
