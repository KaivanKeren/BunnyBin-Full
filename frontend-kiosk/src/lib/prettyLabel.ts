// Percantik label deteksi CV untuk tampilan. Menangani beberapa gaya label model:
//   "Sampah Organik"            → "Sampah Organik"  (sudah rapi)
//   "botol_plastik"             → "Botol Plastik"
//   "Organik-kulit-pisang"      → "Kulit Pisang"    (buang prefiks kategori)
//   "Anorganik-botol-plastik"   → "Botol Plastik"
export function prettyLabel(label: string | null | undefined): string | null {
  if (!label) return null
  // Buang prefiks kategori "Organik-"/"Anorganik-" (label sudah punya kategori sendiri).
  const stripped = label.replace(/^(an)?organik[-_\s]+/i, '')
  const words = stripped.split(/[-_\s]+/).filter(Boolean)
  if (words.length === 0) return label
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
