#!/usr/bin/env bash
# Uji cepat layanan CV yang sedang jalan — tanpa menyusun curl sendiri.
#
#   ./smoke_endpoint.sh                       # port 8000, gambar sampel dataset
#   ./smoke_endpoint.sh 8811                  # port lain
#   ./smoke_endpoint.sh 8000 /path/foto.jpg   # foto sendiri
#
# Yang dibuktikan, berurutan:
#   1. /health hidup dan melaporkan mode + keadaan jalur cloud
#   2. satu klasifikasi nyata — perhatikan `label` (nama benda) dan `degraded`
#   3. frame yang SAMA dikirim ulang -> harus dilayani cache, `calls` tidak naik
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-8000}"
IMAGE="${2:-}"
BASE="http://localhost:${PORT}"

if [[ -z "$IMAGE" ]]; then
  # Sampel dari dataset repo — dipilih yang jelas isinya supaya jawabannya
  # bisa dinilai benar/salah oleh mata sendiri.
  IMAGE=$(ls training/dataset_combined/images/val/aquabotol-*.jpg 2>/dev/null | head -1 || true)
fi
if [[ -z "$IMAGE" || ! -f "$IMAGE" ]]; then
  echo "Gambar uji tidak ditemukan. Beri path: ./smoke_endpoint.sh $PORT /path/foto.jpg" >&2
  exit 1
fi

TOKEN=$(grep '^CV_INTERNAL_TOKEN=' .env | cut -d= -f2-)
if [[ -z "$TOKEN" ]]; then
  echo "CV_INTERNAL_TOKEN kosong di .env — layanan menolak start tanpa itu." >&2
  exit 1
fi

BODY=$(mktemp); trap 'rm -f "$BODY"' EXIT
printf '{"image_base64":"%s"}' "$(base64 -w0 "$IMAGE")" > "$BODY"

echo
echo "  Layanan : $BASE"
echo "  Gambar  : $(basename "$IMAGE")"
echo
echo "── 1. /health ──────────────────────────────────────────────"
curl -sf "$BASE/health" | jq || { echo "  ✗ layanan tidak menjawab di $BASE"; exit 1; }

echo
echo "── 2. /classify ────────────────────────────────────────────"
curl -sf "$BASE/classify" \
  -H "X-Internal-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d @"$BODY" | jq

echo
echo "── 3. frame sama lagi (harus dari cache) ───────────────────"
curl -sf "$BASE/classify" \
  -H "X-Internal-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d @"$BODY" | jq -c

echo
echo "── Statistik ───────────────────────────────────────────────"
curl -sf "$BASE/health" | jq '.vlm // "mode non-cloud: tidak ada statistik VLM"'
echo
echo "  Yang dibaca:"
echo "    label            -> harus NAMA BENDA (\"Botol Plastik\"), bukan kategori"
echo "    degraded=false   -> jalur utama melayani"
echo "    degraded=true    -> lihat degraded_reason; jawaban dari best.pt"
echo "    cache_hits naik sementara calls TETAP -> cache bekerja"
echo
