// src/api/real/RealEsp32Client.ts
// Adapter ke firmware ESP32 nyata (BunnyBin_ESP32.ino, jaringan lokal device kiosk).
//
// Firmware memakai ejaan Indonesia (organik/anorganik, *_percent, jenis) dan
// melayani di bawah prefix /api, sedangkan seluruh sistem lain memakai nama
// kolom Laravel (organic/inorganic, *_pct). FILE INI SATU-SATUNYA PENERJEMAH di
// antara keduanya — begitu kontrak firmware bocor ke KioskProvider atau ke
// payload relay, nama Indonesia akan menyebar sampai ke tabel fill_snapshots.
//
// Kontrak firmware (lihat BunnyBin_ESP32.ino):
//   GET  /api/status -> { organik_distance_cm, organik_percent,
//                         anorganik_distance_cm, anorganik_percent,
//                         servo_angle, ... }
//   POST /api/sort   <- { "jenis": "organik" | "anorganik" }
//                    -> { success, jenis, servo_angle }
import type {
  Esp32Status,
  IEsp32Client,
  SortCommand,
  SortResult,
  WasteCategory,
} from '@/api/contracts'
import { esp32 } from '@/api/http'

/** Respons mentah firmware. Hanya field yang dipakai kiosk yang didaftarkan. */
interface FirmwareStatus {
  organik_distance_cm: number
  organik_percent: number
  anorganik_distance_cm: number
  anorganik_percent: number
  servo_angle: number
}

interface FirmwareSortResult {
  success: boolean
  jenis: string
  servo_angle: number
}

/** Sudut servo di firmware: 20 = organik, 160 = anorganik, 90 = netral. */
const ORGANIC_ANGLE_MAX = 45
const INORGANIC_ANGLE_MIN = 135

/**
 * Timeout khusus /api/sort, jauh di atas timeout default instance (4 dtk).
 *
 * Firmware SENGAJA menahan respons sampai servo selesai: 900ms ke posisi tray +
 * 450ms kembali ke tengah = 1350ms, sebelum sedikit pun byte dikirim. Di WiFi
 * sekolah yang lambat, tambahan latensi 3 dtk sudah cukup melewati 4 dtk —
 * padahal servo-nya bergerak dengan benar. Tanpa kelonggaran ini kiosk menandai
 * ESP32 "offline" tepat ketika alatnya bekerja normal.
 *
 * Polling /api/status sengaja TIDAK ikut dilonggarkan: itu jajak pendapat tiap
 * 2 detik yang memang harus gagal cepat supaya banner offline muncul tepat waktu.
 */
const SORT_TIMEOUT_MS = 12_000

const TO_FIRMWARE: Record<WasteCategory, string> = {
  organic: 'organik',
  inorganic: 'anorganik',
}

function servoPosFromAngle(angle: number): Esp32Status['servo_pos'] {
  if (!Number.isFinite(angle)) return 'idle'
  if (angle <= ORGANIC_ANGLE_MAX) return 'organic'
  if (angle >= INORGANIC_ANGLE_MIN) return 'inorganic'
  return 'idle'
}

/**
 * Field yang hilang atau bukan angka berarti kita bicara dengan firmware lain
 * (atau captive portal yang membalas HTML). Melemparnya membuat kiosk menandai
 * ESP32 offline — jauh lebih jujur daripada meneruskan NaN yang berakhir jadi
 * "NaN%" di layar anak dan payload tertolak 422 tiap 30 detik.
 */
function num(raw: unknown, field: string): number {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Respons ESP32 tidak sesuai: field "${field}" bukan angka`)
  }
  return value
}

export class RealEsp32Client implements IEsp32Client {
  async getStatus(): Promise<Esp32Status> {
    const { data } = await esp32.get<FirmwareStatus>('/api/status')

    return {
      organic_pct: num(data?.organik_percent, 'organik_percent'),
      inorganic_pct: num(data?.anorganik_percent, 'anorganik_percent'),
      // Jarak mentah diteruskan apa adanya: backend yang mengonversinya memakai
      // geometri unit, jadi kalibrasi tong bisa diubah dari dashboard admin
      // tanpa perlu flash ulang firmware.
      organic_distance_cm: num(data?.organik_distance_cm, 'organik_distance_cm'),
      inorganic_distance_cm: num(data?.anorganik_distance_cm, 'anorganik_distance_cm'),
      servo_pos: servoPosFromAngle(data?.servo_angle),
    }
  }

  async sort(cmd: SortCommand): Promise<SortResult> {
    // Firmware menahan respons sampai servo selesai bergerak (~1,4 dtk), jadi
    // resolve-nya memang menandakan sampah sudah masuk tray yang benar.
    const { data } = await esp32.post<FirmwareSortResult>(
      '/api/sort',
      { jenis: TO_FIRMWARE[cmd.category] },
      { timeout: SORT_TIMEOUT_MS },
    )

    return {
      status: data?.success ? 'ok' : 'error',
      servo_pos: cmd.category,
    }
  }

  async simDrop(): Promise<void> {
    throw new Error('simDrop tidak tersedia di hardware nyata')
  }

  async simReset(): Promise<void> {
    throw new Error('simReset tidak tersedia di hardware nyata')
  }
}
