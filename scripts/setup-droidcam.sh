#!/usr/bin/env bash
# Siapkan kamera HP sebagai sumber pindai kiosk Binexa.
#
# Kiosk memindai sampah dengan kamera HP, bukan kamera bawaan laptop. Ada dua
# jalur, dan skrip ini mengurus jalur pertama sekaligus memeriksa yang kedua:
#
#   device (disiapkan skrip ini)
#     droidcam-cli menarik feed dari HP dan menuliskannya ke kamera virtual
#     v4l2loopback (/dev/videoN). Browser melihatnya sebagai webcam biasa
#     bernama "Droidcam", dan kiosk memilihnya lewat VITE_CAMERA_DEVICE_MATCH.
#
#   mjpeg (tidak butuh skrip ini)
#     Kiosk membaca http://HP:4747/mjpegfeed lewat proxy /camera-proxy miliknya.
#     Tanpa modul kernel, tapi lihat peringatan "satu slot" di bawah.
#
# PENTING — DroidCam versi gratis hanya melayani SATU pembaca HTTP. Selama
# droidcam-cli berjalan, jalur mjpeg dan realtime_detect.py --url http://...
# akan ditolak dengan "Busy". Pilih salah satu jalur, jangan keduanya.
#
# Pakai:
#   ./scripts/setup-droidcam.sh 10.23.3.187        # sambungkan (port 4747)
#   ./scripts/setup-droidcam.sh 10.23.3.187 4747
#   ./scripts/setup-droidcam.sh adb                # lewat kabel USB (adb)
#   ./scripts/setup-droidcam.sh --check            # periksa saja, tanpa mengubah apa pun
#   ./scripts/setup-droidcam.sh --stop             # hentikan droidcam-cli
#
# Env:
#   DROIDCAM_HOST, DROIDCAM_PORT   alamat HP (bisa juga lewat argumen)
#   VIDEO_NR                       nomor /dev/video untuk kamera virtual (default 2)
#   VIDEO_SIZE                     resolusi feed (default 640x480)

set -u

PORT_DEFAULT=4747
VIDEO_NR="${VIDEO_NR:-2}"
VIDEO_SIZE="${VIDEO_SIZE:-640x480}"
CARD_LABEL="Droidcam"
DEV="/dev/video${VIDEO_NR}"

BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; OFF=$'\e[0m'
ok()   { printf '%s✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$OFF" "$1"; }
bad()  { printf '%s✗%s %s\n' "$RED" "$OFF" "$1"; }
step() { printf '\n%s%s%s\n' "$BOLD" "$1" "$OFF"; }
hint() { printf '  %s%s%s\n' "$DIM" "$1" "$OFF"; }

# --------------------------------------------------------------------------- #
# Argumen
# --------------------------------------------------------------------------- #
MODE=connect
case "${1:-}" in
  --check) MODE=check; shift ;;
  --stop)  MODE=stop; shift ;;
  -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

HOST="${1:-${DROIDCAM_HOST:-}}"
PORT="${2:-${DROIDCAM_PORT:-$PORT_DEFAULT}}"

# --------------------------------------------------------------------------- #
# --stop
# --------------------------------------------------------------------------- #
if [ "$MODE" = stop ]; then
  if pkill -x droidcam-cli 2>/dev/null; then
    ok "droidcam-cli dihentikan — slot HTTP HP bebas lagi"
  else
    warn "droidcam-cli memang tidak berjalan"
  fi
  exit 0
fi

# --------------------------------------------------------------------------- #
# 1. Prasyarat
# --------------------------------------------------------------------------- #
step "1. Prasyarat"

if command -v droidcam-cli >/dev/null 2>&1; then
  ok "droidcam-cli terpasang"
else
  bad "droidcam-cli tidak ditemukan"
  hint "Arch: yay -S droidcam    Debian/Ubuntu: lihat dev47apps.com/droidcam/linux/"
  hint "Tanpa ini, pakai jalur mjpeg: VITE_CAMERA_SOURCE=mjpeg"
  exit 1
fi

if modinfo v4l2loopback >/dev/null 2>&1; then
  ok "modul v4l2loopback tersedia ($(modinfo -F version v4l2loopback 2>/dev/null))"
else
  bad "modul v4l2loopback tidak terpasang"
  hint "Arch: sudo pacman -S v4l2loopback-dkms    Debian: sudo apt install v4l2loopback-dkms"
  exit 1
fi

# --------------------------------------------------------------------------- #
# 2. Kamera virtual
# --------------------------------------------------------------------------- #
step "2. Kamera virtual ($DEV)"

if lsmod 2>/dev/null | grep -q '^v4l2loopback'; then
  ok "modul sudah dimuat"
elif [ "$MODE" = check ]; then
  warn "modul belum dimuat (jalankan skrip ini tanpa --check untuk memuatnya)"
else
  # card_label yang menentukan nama yang DILIHAT BROWSER. Kiosk memilih kamera
  # dengan mencocokkan nama itu (VITE_CAMERA_DEVICE_MATCH=droidcam), jadi label
  # ini bukan hiasan — ia bagian dari kontrak.
  #
  # exclusive_caps=1 wajib: tanpanya Chrome melihat device sebagai output-only
  # dan tidak menawarkannya di getUserMedia sama sekali.
  echo "  memuat modul (butuh sudo)..."
  if sudo modprobe v4l2loopback video_nr="$VIDEO_NR" card_label="$CARD_LABEL" exclusive_caps=1; then
    ok "modul dimuat — $DEV dibuat sebagai \"$CARD_LABEL\""
  else
    bad "gagal memuat v4l2loopback"
    exit 1
  fi
fi

if [ -e "$DEV" ]; then
  ok "$DEV ada"
  if command -v v4l2-ctl >/dev/null 2>&1; then
    hint "$(v4l2-ctl -d "$DEV" --info 2>/dev/null | grep -i 'card type' | sed 's/^\s*//')"
  fi
else
  warn "$DEV belum ada — modul mungkin memakai nomor lain"
  hint "cek: v4l2-ctl --list-devices"
fi

# --------------------------------------------------------------------------- #
# 3. Sambungan ke HP
# --------------------------------------------------------------------------- #
step "3. Sambungan ke HP"

if pgrep -x droidcam-cli >/dev/null 2>&1; then
  ok "droidcam-cli sudah berjalan (pid $(pgrep -x droidcam-cli | tr '\n' ' '))"
  hint "hentikan dulu bila ingin ganti HP: ./scripts/setup-droidcam.sh --stop"
elif [ "$MODE" = check ]; then
  warn "droidcam-cli tidak berjalan"
elif [ -z "$HOST" ]; then
  bad "alamat HP belum diberikan"
  hint "buka app DroidCam di HP — alamat & port tertera di layarnya"
  hint "lalu: ./scripts/setup-droidcam.sh <ip> [port]"
  exit 1
else
  echo "  menyambung ke ${HOST}:${PORT} → ${DEV} (${VIDEO_SIZE})..."
  # -nocontrols wajib untuk mode latar: tanpanya droidcam-cli membaca stdin dan
  # langsung berhenti begitu dilepas dari terminal.
  droidcam-cli -v -nocontrols -dev="$DEV" -size="$VIDEO_SIZE" "$HOST" "$PORT" \
    >/tmp/droidcam-cli.log 2>&1 &
  sleep 3

  if pgrep -x droidcam-cli >/dev/null 2>&1; then
    ok "tersambung — feed HP mengalir ke $DEV"
  else
    bad "droidcam-cli langsung berhenti"
    hint "log: /tmp/droidcam-cli.log"
    sed 's/^/  /' /tmp/droidcam-cli.log 2>/dev/null | tail -5
    hint "sebab tersering: app DroidCam di HP tidak aktif DI DEPAN LAYAR,"
    hint "HP di jaringan WiFi berbeda, atau slot tunggal sudah dipakai proses lain."
    exit 1
  fi
fi

# --------------------------------------------------------------------------- #
# 4. Jalur mjpeg (alternatif)
# --------------------------------------------------------------------------- #
step "4. Jalur mjpeg (alternatif, tanpa modul kernel)"

if [ "$HOST" = adb ] || [ "$HOST" = ios ]; then
  # Sambungan lewat kabel tidak menyajikan HTTP di jaringan sama sekali —
  # memeriksanya hanya akan memunculkan peringatan yang menyesatkan.
  hint "lewati — sambungan lewat kabel, HP tidak menyajikan HTTP di jaringan"
elif [ -n "$HOST" ]; then
  # Sengaja diperiksa SETELAH droidcam-cli hidup: hasil "Busy"/gagal di sini
  # justru bukti bahwa slot tunggal itu nyata, bukan tanda ada yang rusak.
  if curl -sS -m 3 -o /dev/null -I "http://${HOST}:${PORT}/mjpegfeed" 2>/dev/null; then
    ok "http://${HOST}:${PORT}/mjpegfeed menjawab — jalur mjpeg bisa dipakai"
  else
    warn "http://${HOST}:${PORT}/mjpegfeed tidak menjawab"
    hint "wajar bila droidcam-cli sedang memegang satu-satunya slot HTTP HP"
  fi
else
  hint "lewati — alamat HP tidak diberikan"
fi

# --------------------------------------------------------------------------- #
# 5. Setelan kiosk
# --------------------------------------------------------------------------- #
step "5. Setelan kiosk (frontend-kiosk/.env)"

cat <<EOF
  # jalur device — feed HP lewat kamera virtual (yang baru saja disiapkan)
  VITE_CAMERA_SOURCE=device
  VITE_CAMERA_DEVICE_MATCH=droidcam

  # jalur mjpeg — kiosk membaca HTTP HP langsung, hentikan droidcam-cli dulu
  # VITE_CAMERA_SOURCE=mjpeg
  # VITE_CAMERA_STREAM_URL=http://${HOST:-IP_HP}:${PORT}
  # VITE_CAMERA_STREAM_PATH=/mjpegfeed?640x480
EOF

hint "uji cepat model tanpa kiosk:"
hint "  cd cv-service-fastapi && .venv-real/bin/python realtime_detect.py --url ${VIDEO_NR}"
echo
