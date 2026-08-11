// src/lib/labelToQuiz.ts
// Label model CV → kata kunci nama quiz item, supaya pertanyaan yang muncul
// tentang BENDA yang benar-benar dipegang anak, bukan sekadar benda acak dari
// kategori yang sama.
//
// Sebelumnya tabel ini hanya berisi label COCO (`bottle`, `banana`, …) dan
// tinggal di dalam badan komponen KioskProvider. Model produksi Binexa
// mengeluarkan label Indonesia (`botol_plastik`, `kulit_buah`, …), jadi TIDAK
// SATU PUN kunci pernah cocok: cabang pencocokan spesifik mati total dan setiap
// deteksi jatuh ke pemilihan acak dalam kategori.
//
// Kunci WAJIB huruf kecil semua — pencarian memakai `label.toLowerCase()`
// (lihat quizKeywordsFor), jadi kunci ber-huruf besar adalah entri mati yang
// tidak akan pernah terbaca. Ada test yang mengunci aturan ini.
//
// CATATAN soal label Roboflow. Model `deteksi-sampah-organik-anorganik/3`
// mengeluarkan "Sampah Organik"/"Sampah Anorganik" — itu label KATEGORI, bukan
// nama benda. Tidak ada benda spesifik untuk dicocokkan, jadi menambahkannya ke
// sini tidak ada gunanya: perilaku yang benar untuk label kategori justru
// fallback "acak dalam kategori terdeteksi", dan itu sudah terjadi dengan
// sendirinya saat label tidak ditemukan di tabel ini.

/** Kata kunci dicocokkan sebagai SUBSTRING (case-insensitive) ke `item_name`. */
export const LABEL_TO_QUIZ: Record<string, string[]> = {
  // ── Model bernama Binexa (produksi) — selaras LABEL_MAP_NAMED di cv-service ──
  // organik
  sisa_makanan: ['Sisa', 'Nasi'],
  kulit_buah: ['Kulit'],
  daun: ['Daun'],
  daun_hijau: ['Daun'],
  daun_kering: ['Daun'],
  kayu: ['Ranting', 'Kayu'],
  // anorganik
  botol_plastik: ['Botol'],
  gelas_plastik: ['Gelas'],
  sedotan: ['Sedotan'],
  sedotan_plastik: ['Sedotan'],
  wadah_plastik: ['Wadah'],
  bungkus_plastik: ['Bungkus', 'Kantong'],
  bungkus_snack: ['Bungkus', 'Snack'],
  kertas: ['Kertas', 'Koran'],
  kaleng: ['Kaleng'],
  kaca: ['Kaca'],

  // ── COCO (yolov8n pretrained) — SENGAJA DIPERTAHANKAN ──
  // Mode demo masih memakai model ini (LABEL_MAP_COCO di cv-service). Menghapus
  // kunci-kunci ini akan mematikan pencocokan spesifik di demo tanpa memberi
  // manfaat apa pun — keduanya bisa hidup berdampingan di satu tabel.
  bottle: ['Botol'],
  cup: ['Gelas'],
  'wine glass': ['Gelas'],
  bowl: ['Wadah', 'Gelas'],
  book: ['Kertas', 'Koran', 'Buku'],
  banana: ['Pisang'],
  apple: ['Apel'],
  orange: ['Jeruk'],
  broccoli: ['Sayur'],
  carrot: ['Sayur'],
  sandwich: ['Roti'],
  'hot dog': ['Roti'],
  pizza: ['Roti'],
  donut: ['Roti'],
  cake: ['Roti'],
}

/**
 * Label model apa pun → kata kunci, atau null bila tidak dikenali.
 *
 * Label yang tak dikenali BUKAN kesalahan: label kategori (Roboflow) dan kelas
 * model yang tidak punya padanan quiz item (`masker`, `rumput`) memang seharusnya
 * jatuh ke pemilihan acak dalam kategori yang terdeteksi.
 */
export function quizKeywordsFor(label: string | null | undefined): string[] | null {
  if (!label) return null

  return LABEL_TO_QUIZ[label.toLowerCase()] ?? null
}
