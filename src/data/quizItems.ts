import type { Category, QuizItem } from '../api/contracts';

export const CATEGORY_LABEL: Record<Category, string> = {
  organic: 'Organik',
  inorganic: 'Anorganik',
};

// Gambar dibundel sebagai data-URI SVG (emoji) — offline-first (PRD-FE §8),
// tidak ada fetch jaringan yang wajib. Nanti bisa diganti asset di quizImages/.
const emojiImage = (emoji: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="64" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`,
  )}`;

export const staticQuizItems: QuizItem[] = [
  {
    id: 'q-kulit-pisang',
    category: 'organic',
    item_name: 'kulit pisang',
    image_url: emojiImage('🍌'),
    explanation: 'Kulit pisang bisa membusuk dan berubah jadi pupuk untuk tanaman. Keren, kan?',
    active: true,
  },
  {
    id: 'q-sisa-apel',
    category: 'organic',
    item_name: 'sisa apel',
    image_url: emojiImage('🍎'),
    explanation: 'Sisa buah seperti apel berasal dari alam, jadi bisa terurai sendiri di tanah.',
    active: true,
  },
  {
    id: 'q-daun-kering',
    category: 'organic',
    item_name: 'daun kering',
    image_url: emojiImage('🍂'),
    explanation: 'Daun kering jatuh dari pohon dan bisa jadi kompos yang menyuburkan tanah.',
    active: true,
  },
  {
    id: 'q-sisa-nasi',
    category: 'organic',
    item_name: 'sisa nasi',
    image_url: emojiImage('🍚'),
    explanation: 'Sisa makanan seperti nasi bisa membusuk secara alami, jadi masuk sampah organik.',
    active: true,
  },
  {
    id: 'q-kulit-jeruk',
    category: 'organic',
    item_name: 'kulit jeruk',
    image_url: emojiImage('🍊'),
    explanation: 'Kulit jeruk wangi dan alami — dia bisa terurai jadi bagian dari tanah lagi.',
    active: true,
  },
  {
    id: 'q-botol-plastik',
    category: 'inorganic',
    item_name: 'botol plastik',
    image_url: emojiImage('🧴'),
    explanation: 'Botol plastik butuh ratusan tahun untuk hancur, jadi harus dipisah supaya bisa didaur ulang.',
    active: true,
  },
  {
    id: 'q-kaleng-minuman',
    category: 'inorganic',
    item_name: 'kaleng minuman',
    image_url: emojiImage('🥫'),
    explanation: 'Kaleng terbuat dari logam. Logam tidak bisa membusuk, tapi bisa dilebur dan dipakai lagi!',
    active: true,
  },
  {
    id: 'q-kertas-bekas',
    category: 'inorganic',
    item_name: 'kertas bekas',
    image_url: emojiImage('📄'),
    explanation: 'Kertas bekas dibuat di pabrik. Kalau dipisah dengan rapi, dia bisa didaur ulang jadi kertas baru.',
    active: true,
  },
  {
    id: 'q-kantong-plastik',
    category: 'inorganic',
    item_name: 'kantong plastik',
    image_url: emojiImage('🛍️'),
    explanation: 'Kantong plastik tidak bisa membusuk. Kalau dibuang sembarangan, bisa membahayakan hewan.',
    active: true,
  },
  {
    id: 'q-sedotan-plastik',
    category: 'inorganic',
    item_name: 'sedotan plastik',
    image_url: emojiImage('🥤'),
    explanation: 'Sedotan plastik kecil tapi susah hancur — makanya masuk tempat sampah anorganik.',
    active: true,
  },
];
