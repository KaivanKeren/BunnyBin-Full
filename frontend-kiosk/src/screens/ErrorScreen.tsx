// src/screens/ErrorScreen.tsx — port dari prototype states/ErrorState.jsx.
// "error" = jawaban salah (edukasi), BUKAN error teknis (§3). Teks dari quiz_item.explanation (UI-05).
import { motion } from 'framer-motion'
import { AlertCircle, BookOpen, RotateCcw } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'
import { useKiosk } from '@/context/kioskContext'
import { itemEmoji } from '@/lib/itemEmoji'

export default function ErrorScreen() {
  const { state, retryQuestion } = useKiosk()
  const item = state.item
  const isOrganic = item?.category === 'organic'

  const title = isOrganic ? 'Ini Sampah Organik!' : 'Ini Sampah Anorganik!'
  const emoji = isOrganic ? '🍃' : '♻️'
  // Utamakan explanation dari data quiz (UI-05); fallback teks default bila null.
  const text =
    item?.explanation ??
    (isOrganic
      ? 'Sampah organik berasal dari makhluk hidup seperti sisa makanan, daun, atau kulit buah. Bisa diolah menjadi kompos!'
      : 'Sampah anorganik seperti plastik, kaleng, dan kertas dapat didaur ulang menjadi barang baru. Ayo pilah dengan benar!')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-3 px-12"
      style={{ background: 'linear-gradient(135deg, #FFE5E5 0%, #FFB8B8 60%, #FF8A8A 100%)' }}
    >
      <motion.div
        className="absolute h-[480px] w-[480px] rounded-full bg-red-400 opacity-30 blur-3xl"
        animate={{ scale: [1, 1.25, 1], opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 border-[8px] border-red-500"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 1, repeat: Infinity }}
      />

      <motion.div animate={{ x: [-8, 8, -8, 8, 0] }} transition={{ duration: 0.6 }} className="z-10">
        <BunnyMascot mood="sad" size={170} />
      </motion.div>

      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="z-10 flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-white shadow-pop"
      >
        <AlertCircle size={24} />
        <h1 className="text-2xl font-bold">Hmm... Belum tepat nih!</h1>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="z-10 max-w-2xl rounded-3xl border-4 border-red-400 bg-white/95 px-7 py-4 shadow-soft"
      >
        <div className="mb-1 flex items-center gap-2">
          <BookOpen className="text-red-500" size={20} />
          <span className="text-xs font-bold uppercase tracking-wider text-red-500">Yuk Belajar</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-4xl">{emoji}</div>
          <div>
            <h2 className="text-xl font-bold text-red-600">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#6b5b50]">{text}</p>
            {item && (
              <div className="mt-2 inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                Contoh: {itemEmoji(item)} {item.item_name}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={retryQuestion}
        className="z-10 inline-flex items-center gap-2 rounded-full bg-red-600 px-7 py-3 text-base font-bold text-white shadow-pop hover:bg-red-700"
      >
        <RotateCcw size={18} /> Coba Lagi
      </motion.button>
    </motion.div>
  )
}
