#!/usr/bin/env bash
# Uji koneksi + trigger ESP32 BunnyBin lewat REST API lokalnya.
#
# Kontrak yang diuji ada di BunnyBin_ESP32.ino (firmware DIBEKUKAN):
#   GET  /api/ping   -> { success, device, ip }
#   GET  /api/status -> { organik_*, anorganik_*, servo_angle, uptime_ms }
#   POST /api/sort   <- { "jenis": "organik" | "anorganik" }
#
# Pakai:
#   ./scripts/test-hardware.sh                 # default bunnybin.local
#   ./scripts/test-hardware.sh 192.168.1.50    # IP dari Serial Monitor saat boot
#   SKIP_SERVO=1 ./scripts/test-hardware.sh    # cek koneksi saja, servo tidak digerakkan
#
# Catatan: mDNS "bunnybin.local" hanya bekerja bila mesin ini menjalankan
# resolver mDNS (avahi). Kalau host tidak ketemu, pakai IP langsung.

set -u

HOST="${1:-${ESP32_HOST:-bunnybin.local}}"
BASE="http://${HOST#http://}"
SKIP_SERVO="${SKIP_SERVO:-0}"

# /api/sort menahan respons sampai servo selesai (900ms + 450ms) — timeout
# harus longgar, kalau tidak alat yang bekerja normal terbaca "gagal".
TIMEOUT_FAST=5
TIMEOUT_SORT=15

pass=0
fail=0

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mGAGAL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
head1() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Jalankan curl, pisahkan body dan status code.
call() {
  local method="$1" path="$2" body="${3:-}" timeout="${4:-$TIMEOUT_FAST}"
  if [ "$method" = "POST" ]; then
    curl -sS -m "$timeout" -w '\n%{http_code}' \
      -X POST "$BASE$path" \
      -H 'Content-Type: application/json' \
      -d "$body" 2>&1
  else
    curl -sS -m "$timeout" -w '\n%{http_code}' "$BASE$path" 2>&1
  fi
}

status_of() { printf '%s' "$1" | tail -n1; }
body_of()   { printf '%s' "$1" | sed '$d'; }

show() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq . 2>/dev/null || printf '%s\n' "$1"
  else
    printf '%s\n' "$1"
  fi
}

printf '\033[1mTarget:\033[0m %s\n' "$BASE"

# ---------------------------------------------------------------------------
head1 '1. Ping — apakah ESP32 menjawab sama sekali?'
res=$(call GET /api/ping)
code=$(status_of "$res")
if [ "$code" = "200" ]; then
  ok "GET /api/ping -> 200"
  show "$(body_of "$res")"
else
  bad "GET /api/ping -> ${code:-tak ada respons}"
  show "$(body_of "$res")"
  printf '\n  Cek: ESP32 menyala? satu WiFi dengan mesin ini? IP masih sama\n'
  printf '  dengan yang dicetak Serial Monitor saat boot (DHCP bisa berubah)?\n'
  exit 1
fi

# ---------------------------------------------------------------------------
head1 '2. Status — sensor ultrasonik terbaca?'
res=$(call GET /api/status)
code=$(status_of "$res")
body=$(body_of "$res")
if [ "$code" = "200" ]; then
  ok "GET /api/status -> 200"
  show "$body"

  # -1 berarti pulseIn timeout: sensor tidak terpasang / kabel echo lepas.
  # Firmware menahan nilai lama saat gagal baca, jadi jarak yang mentok di
  # 55.0 (BIN_HEIGHT_CM) untuk kedua tray juga patut dicurigai.
  case "$body" in
    *'"organik_distance_cm":-1'*)   bad 'sensor ORGANIK tidak terbaca (-1) — cek TRIG 25 / ECHO 33' ;;
    *) ok 'sensor organik mengembalikan jarak' ;;
  esac
  case "$body" in
    *'"anorganik_distance_cm":-1'*) bad 'sensor ANORGANIK tidak terbaca (-1) — cek TRIG 27 / ECHO 26' ;;
    *) ok 'sensor anorganik mengembalikan jarak' ;;
  esac
else
  bad "GET /api/status -> ${code:-tak ada respons}"
  show "$body"
fi

# ---------------------------------------------------------------------------
head1 '3. Validasi input — jenis yang salah harus ditolak 400'
res=$(call POST /api/sort '{"jenis":"plastik"}')
code=$(status_of "$res")
if [ "$code" = "400" ]; then
  ok "POST /api/sort {jenis:plastik} -> 400 (ditolak, servo tidak bergerak)"
else
  bad "POST /api/sort {jenis:plastik} -> $code (harusnya 400)"
  show "$(body_of "$res")"
fi

# ---------------------------------------------------------------------------
if [ "$SKIP_SERVO" = "1" ]; then
  head1 '4. Trigger servo — DILEWATI (SKIP_SERVO=1)'
else
  head1 '4. Trigger servo — perhatikan alatnya, servo harus benar-benar bergerak'

  for jenis in organik anorganik; do
    printf '  -> mengirim {"jenis":"%s"} ...\n' "$jenis"
    res=$(call POST /api/sort "{\"jenis\":\"$jenis\"}" "$TIMEOUT_SORT")
    code=$(status_of "$res")
    body=$(body_of "$res")

    if [ "$code" = "200" ]; then
      case "$body" in
        *'"success":true'*) ok "servo $jenis bergerak lalu kembali ke 90 (netral)" ;;
        *)                  bad "servo $jenis: HTTP 200 tapi success=false" ;;
      esac
      show "$body"
    else
      bad "POST /api/sort {jenis:$jenis} -> ${code:-timeout}"
      show "$body"
      printf '  Timeout di sini biasanya servo tersangkut, bukan jaringan:\n'
      printf '  firmware baru menjawab SETELAH servo selesai (~1,4 dtk).\n'
    fi
  done
fi

# ---------------------------------------------------------------------------
printf '\n\033[1mRingkasan:\033[0m %d lolos, %d gagal\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
