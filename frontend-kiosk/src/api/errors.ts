// src/api/errors.ts
// Membedakan dua kegagalan yang perlakuannya berlawanan.
import axios from 'axios'

/**
 * Server menjawab tapi menolak isinya (4xx): payload salah, token salah unit,
 * pembacaan sensor di luar rentang. Mengirim ulang yang sama tidak akan pernah
 * berhasil — pemanggil harus MEMBUANGnya, bukan menumpuknya di retry queue
 * selamanya. Berbeda dari gagal jaringan, yang justru wajib diulang.
 */
export class CloudRejectedError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'CloudRejectedError'
    this.status = status
  }
}

/**
 * Status yang MEMINTA dicoba lagi, bukan menandakan payload cacat:
 *
 *   408 timeout, 429 rate limit — jelas sementara.
 *   401 token ditolak, 419 CSRF/sesi — keduanya soal KREDENSIAL atau
 *       KONFIGURASI server, bukan isi payload. Mengirim ulang data yang sama
 *       akan berhasil begitu tokennya diperbarui atau konfigurasinya dibetulkan.
 *
 * 401/419 sempat diperlakukan permanen, dan akibatnya mahal: saat origin kiosk
 * keliru terdaftar sebagai stateful domain, setiap POST dijawab 419 dan SELURUH
 * log sortir anak dibuang diam-diam — hanya menyisakan console.warn, tanpa
 * banner offline, sementara GET tetap jalan sehingga kiosk tampak sehat.
 * Menahannya di antrean membuat kegagalan konfigurasi terlihat DAN tidak
 * memusnahkan data.
 *
 * 403 tetap permanen: itu token yang bukan pemilik unit di URL — datanya milik
 * unit lain, dan mengulanginya tidak akan pernah benar.
 */
const RETRYABLE_STATUSES = [401, 408, 419, 429]

export function toCloudError(err: unknown): unknown {
  if (!axios.isAxiosError(err) || !err.response) return err

  const { status, data } = err.response
  if (status < 400 || status >= 500 || RETRYABLE_STATUSES.includes(status)) return err

  const message = typeof data?.message === 'string' ? data.message : err.message
  return new CloudRejectedError(status, message)
}
