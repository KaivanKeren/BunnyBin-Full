# Kamera HP untuk Kiosk Binexa

Kiosk memindai sampah dengan **kamera HP**, bukan kamera bawaan laptop/tablet.

Alasannya bukan preferensi: kamera bawaan menghadap ke arah anak yang berdiri di
depan layar, bukan ke sampah yang sedang dimasukkan. Selama kiosk memakai
`getUserMedia({ facingMode: 'environment' })`, laptop mengabaikan constraint itu
(tidak ada kamera "belakang" di laptop) dan memberi kamera depan — kiosk tetap
memindai, tetap menjawab, hanya saja yang diklasifikasi bukan sampahnya.

## Dua jalur yang didukung

| | `device` | `mjpeg` |
|---|---|---|
| Cara kerja | `droidcam-cli` menarik feed HP → kamera virtual `/dev/video2` | Kiosk membaca `http://HP:4747/mjpegfeed` lewat proxy sendiri |
| Butuh di host | `droidcam` + modul `v4l2loopback` | tidak ada |
| Sistem operasi | Linux (modul kernel) | apa saja |
| Latensi | lebih rendah | sedikit lebih tinggi (satu hop proxy) |
| Elemen di browser | `<video>` + MediaStream | `<img>` |

`VITE_CAMERA_SOURCE=auto` (bawaan) mencoba `device` dulu, lalu `mjpeg`.

> **Satu slot.** DroidCam versi gratis hanya melayani **satu** pembaca HTTP.
> Selama `droidcam-cli` berjalan, jalur `mjpeg` dan
> `realtime_detect.py --url http://…` akan ditolak dengan "Busy". Pilih satu.
> Untuk menguji model saat `droidcam-cli` aktif, baca kamera virtualnya:
> `realtime_detect.py --url 2`.

## Jalur `device` — kamera virtual

```bash
# 1. Buka app DroidCam di HP. Alamat & port tertera di layarnya.
#    App HARUS aktif di depan layar, bukan di latar.
# 2. Di host:
./scripts/setup-droidcam.sh 10.23.3.187

# periksa saja, tanpa mengubah apa pun
./scripts/setup-droidcam.sh --check

# lepaskan HP (membebaskan slot HTTP-nya)
./scripts/setup-droidcam.sh --stop
```

Skrip memuat `v4l2loopback` dengan `card_label="Droidcam"` dan
`exclusive_caps=1`, lalu menjalankan `droidcam-cli` di latar.

Kedua opsi modul itu penting:

- `card_label` menentukan nama yang **dilihat browser**. Kiosk memilih kamera
  dengan mencocokkan nama itu (`VITE_CAMERA_DEVICE_MATCH=droidcam`), jadi label
  ini bagian dari kontrak, bukan hiasan.
- `exclusive_caps=1` wajib. Tanpanya Chrome menganggap device itu output-only
  dan tidak menawarkannya ke `getUserMedia` sama sekali.

`.env` kiosk:

```dotenv
VITE_CAMERA_SOURCE=device
VITE_CAMERA_DEVICE_MATCH=droidcam
```

## Jalur `mjpeg` — stream HTTP

Tidak butuh modul kernel. Pastikan `droidcam-cli` **tidak** berjalan.

```dotenv
VITE_CAMERA_SOURCE=mjpeg
VITE_CAMERA_STREAM_URL=http://10.23.3.187:4747   # target proxy
VITE_CAMERA_STREAM_PATH=/mjpegfeed?640x480       # path feed di HP
```

Path feed per aplikasi:

| App | Path |
|---|---|
| DroidCam | `/mjpegfeed?640x480` |
| IP Webcam (Android) | `/video` |

### Kenapa harus lewat proxy

Browser tidak membuka alamat HP langsung. Ia meminta `/camera-proxy/mjpegfeed…`
dari origin kiosk sendiri, dan yang meneruskan ke HP adalah dev-server Vite
(`vite.config.ts`) atau nginx (`frontend-kiosk/nginx.conf.template`).

Sebabnya bukan kerapian. Kiosk menggambar frame kamera ke `<canvas>` lalu
memanggil `toDataURL()` untuk mengirimnya ke `classify()`. Gambar lintas-origin
tanpa header CORS — dan DroidCam tidak pernah mengirimnya — **menodai** (taint)
canvas, sehingga `toDataURL()` melempar `SecurityError`. Gejalanya menyesatkan:
preview tampil normal di layar, tapi tak satu frame pun sampai ke klasifikasi.

Konfigurasi proxy juga mematikan buffering dan read timeout, karena respons
`multipart/x-mixed-replace` memang tidak pernah selesai: dengan buffering menyala
tak satu frame pun keluar, dan dengan timeout bawaan 60 detik kamera mati sendiri
di tengah jam sekolah.

## Produksi (Docker)

Alamat HP **tidak** di-inline ke bundle. Ia dibaca nginx container kiosk saat
start, jadi mengganti HP tidak menuntut build ulang image:

```bash
# .env di root repo
KIOSK_CAMERA_STREAM_URL=http://10.23.3.187:4747
KIOSK_CAMERA_SOURCE=mjpeg

docker compose -f docker-compose.prod.yml up -d kiosk
```

`KIOSK_CAMERA_ALLOW_BUILTIN_FALLBACK` default **false** di produksi: kiosk yang
tidak menemukan kamera HP lebih baik menolak memindai daripada diam-diam
memindai dengan kamera yang menghadap arah salah.

## Saat bermasalah

Buka Debug Panel (5× tap pojok kanan atas, `VITE_DEBUG_PANEL=true`) → bagian
**Kamera**. Di sana ada status, sumber yang terpakai, label device, dan tombol
**Daftar** yang menampilkan semua videoinput yang dilihat browser.

| Gejala | Sebab tersering |
|---|---|
| Badge kuning "Kamera HP tidak ditemukan" | `droidcam-cli` mati, atau label device tak cocok dengan `VITE_CAMERA_DEVICE_MATCH` |
| "kamera tidak mengirim gambar dalam 8 detik" | `/dev/video2` ada tapi tak ada produsen — app DroidCam di HP tidak aktif di depan layar |
| "stream MJPEG tidak bisa dibuka" | alamat/port salah, HP beda jaringan, atau slot tunggal dipegang `droidcam-cli` |
| Preview tampil tapi deteksi tak pernah jalan | canvas ternoda — stream tidak lewat `/camera-proxy` (cek console) |
| Daftar device berlabel kosong | izin kamera belum diberikan; label baru terisi setelah izin pertama |

## Berkas terkait

| Berkas | Peran |
|---|---|
| [`frontend-kiosk/src/camera/`](../frontend-kiosk/src/camera/) | lapisan sumber kamera (device / mjpeg) |
| [`frontend-kiosk/src/hooks/useCamera.ts`](../frontend-kiosk/src/hooks/useCamera.ts) | siklus hidup React + `captureFrame()` |
| [`scripts/setup-droidcam.sh`](../scripts/setup-droidcam.sh) | penyiapan kamera virtual di host |
| [`cv-service-fastapi/realtime_detect.py`](../cv-service-fastapi/realtime_detect.py) | uji model tanpa kiosk |
