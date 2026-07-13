// src/lib/itemEmoji.ts
// Emoji hanya untuk tampilan (kontrak QuizItem tetap murni — tidak menyimpan emoji).
// QuizItem.image_url null di mock, jadi kiosk memakai emoji ini untuk visual ramah anak
// (sesuai prototype /mnt/Projects/BunnyBin yang memakai emoji per item).
import type { QuizItem, WasteCategory } from '@/api/contracts'

const BY_NAME: Record<string, string> = {
  'Kulit Pisang': '🍌',
  'Daun Kering': '🍂',
  'Sisa Roti': '🍞',
  'Kulit Apel': '🍎',
  'Sisa Sayur': '🥬',
  'Ampas Kopi': '☕',
  'Kulit Jeruk': '🍊',
  'Nasi Sisa': '🍚',
  'Cangkang Telur': '🥚',
  'Ranting Kecil': '🌿',
  'Botol Plastik': '🧴',
  'Kaleng Soda': '🥫',
  'Kertas Bekas': '📰',
  'Kantong Plastik': '🛍️',
  Sedotan: '🥤',
  'Tutup Botol': '🔵',
  'Gelas Plastik': '🥤',
  'Koran Bekas': '📰',
  'Kaca Pecah': '🔨',
  'Bungkus Snack': '🍬',
}

const FALLBACK: Record<WasteCategory, string> = {
  organic: '🍃',
  inorganic: '♻️',
}

export function itemEmoji(item: Pick<QuizItem, 'item_name' | 'category'>): string {
  return BY_NAME[item.item_name] ?? FALLBACK[item.category]
}
