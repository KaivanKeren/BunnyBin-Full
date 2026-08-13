// src/components/DegradedBadge.tsx
// Penanda "jawaban ini dari model cadangan, bukan jalur utama".
//
// KENAPA INI ADA
// Saat kuota API cloud habis, layanan CV tetap menjawab — dari bobot lokal.
// Itu perilaku yang benar (anak tidak boleh melihat layar error), tapi tanpa
// penanda ia menjadi kegagalan yang SEMPURNA tersamar: hasilnya berbeda mutu,
// kiosk menampilkannya dengan percaya diri yang sama, dan satu-satunya jejak
// ada di log FastAPI yang tak pernah dibuka siapa pun. Mode terdegradasi bisa
// berjalan berhari-hari sebelum ada yang sadar, dan sementara itu setiap
// keluhan "hasilnya sering salah" salah alamat ke model yang keliru.
//
// Sengaja KECIL dan di pojok. Ini informasi untuk guru/operator, bukan untuk
// anak yang sedang memindai — membuatnya mencolok akan merusak alur permainan
// demi masalah yang tidak bisa diperbuat apa-apa oleh anak itu.
import { CloudOff } from 'lucide-react'

const REASON_TEXT: Record<string, string> = {
  kuota: 'Kuota AI habis',
  // Rem yang KITA pasang sendiri, bukan penolakan penyedia — batas free tier
  // sudah tersentuh dan sisa frame sengaja dilayani model lokal supaya jatah
  // harian tidak terbakar oleh permintaan yang toh akan ditolak.
  'batas-laju': 'AI sedang dihemat',
  // Rem berbasis TOKEN. Untuk beban gambar inilah batas yang benar-benar habis
  // lebih dulu — bukan jumlah permintaan. Dibedakan dari 'batas-laju' supaya
  // saat menyetel kuota, jelas satuan MANA yang sedang menahan.
  'batas-token': 'AI sedang dihemat',
  jaringan: 'Internet bermasalah',
  diblokir: 'AI menolak gambar',
  skema: 'Jawaban AI tak terbaca',
  'tanpa-cadangan': 'AI & cadangan mati',
}

export function DegradedBadge({
  degraded,
  reason,
}: {
  degraded?: boolean
  reason?: string | null
}) {
  if (!degraded) return null

  return (
    <div
      className="pointer-events-none flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 backdrop-blur-sm"
      title={`Mode cadangan: ${reason ?? 'sebab tak diketahui'}. Hasil dari model lokal, mutunya berbeda.`}
    >
      <CloudOff size={13} />
      <span>{(reason && REASON_TEXT[reason]) ?? 'Mode cadangan'}</span>
    </div>
  )
}
