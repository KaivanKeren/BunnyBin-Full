// src/camera/proxy.ts
// Titik pasang proxy kamera — satu-satunya sumber kebenaran untuk nilai ini.
//
// Diimpor dari DUA sisi yang harus selalu sepakat:
//   - vite.config.ts / nginx.conf : yang meneruskan path ini ke HP
//   - src/camera/mjpegSource.ts   : yang memintanya dari browser
//
// Kalau keduanya menyimpan string-nya sendiri, suatu saat salah satu berubah
// dan gejalanya cuma "kamera tidak muncul" tanpa petunjuk apa pun.
export const CAMERA_PROXY_PATH = '/camera-proxy'
