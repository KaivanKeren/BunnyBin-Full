// src/screens/QuestionScreen.tsx — port dari prototype states/QuestionState.jsx (UI-02).
// Item + 2 tombol pilihan besar (min 120×120px). Data dari getQuizBank (§4).
import { motion } from 'framer-motion'
import { Leaf, Recycle, ScanSearch, X } from 'lucide-react'
import type { WasteCategory } from '@/api/contracts'
import BunnyMascot from '@/components/BunnyMascot'
import { useKiosk } from '@/context/kioskContext'
import { itemEmoji } from '@/lib/itemEmoji'

export default function QuestionScreen() {
  const { state, answer } = useKiosk()
  const { item, wrongChoice, detection } = state
  const highConfidence = !!detection?.category && detection.confidence >= 0.75

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-12"
    >
      {/* Hasil deteksi CV (kalau confidence tinggi) */}
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-3 rounded-full bg-white px-5 py-2 shadow-soft"
      >
        <ScanSearch className="text-inorganic-500" size={18} />
        <span className="text-xs font-bold uppercase tracking-wider text-[#9b8a7c]">
          {highConfidence ? 'Hasil Deteksi' : 'Ayo Tebak'}
        </span>
        {item && (
          <>
            <span className="text-2xl">{itemEmoji(item)}</span>
            <span className="text-lg font-bold text-[#3a2f29]">{item.item_name}</span>
          </>
        )}
      </motion.div>

      {/* Bunny + pertanyaan */}
      <div className="flex items-center gap-5">
        <BunnyMascot mood="think" size={150} />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="relative rounded-3xl bg-white px-6 py-4 shadow-soft"
        >
          <div className="text-xs font-semibold text-[#9b8a7c]">Bunny bertanya...</div>
          <div className="text-2xl font-bold text-[#3a2f29]">Menurutmu, ini sampah apa?</div>
          <div className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rotate-45 bg-white" />
        </motion.div>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-6">
        <ChoiceButton
          type="organic"
          disabled={wrongChoice === 'organic'}
          onClick={() => answer('organic')}
        />
        <ChoiceButton
          type="inorganic"
          disabled={wrongChoice === 'inorganic'}
          onClick={() => answer('inorganic')}
        />
      </div>

      {wrongChoice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm font-semibold text-[#9b8a7c]"
        >
          Coba pilih yang lain ya!
        </motion.div>
      )}
    </motion.div>
  )
}

function ChoiceButton({
  type,
  disabled,
  onClick,
}: {
  type: WasteCategory
  disabled: boolean
  onClick: () => void
}) {
  const isOrganic = type === 'organic'
  const cfg = isOrganic
    ? {
        label: 'Organik',
        sub: 'Sisa makanan, daun, kulit buah',
        Icon: Leaf,
        border: 'border-organic-300',
        bg: 'bg-organic-50',
        bgHover: 'hover:bg-organic-100',
        iconBg: 'bg-organic-300',
        iconBgHover: 'group-hover:bg-organic-400',
        text: 'text-organic-500',
      }
    : {
        label: 'Anorganik',
        sub: 'Plastik, kaleng, kertas, kaca',
        Icon: Recycle,
        border: 'border-inorganic-300',
        bg: 'bg-inorganic-50',
        bgHover: 'hover:bg-inorganic-100',
        iconBg: 'bg-inorganic-300',
        iconBgHover: 'group-hover:bg-inorganic-400',
        text: 'text-inorganic-500',
      }

  if (disabled) {
    return (
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: [1, 0.98, 1] }}
        className="relative flex min-h-[120px] flex-col items-center gap-3 rounded-3xl border-4 border-gray-300 bg-gray-100 px-6 py-8 opacity-60"
      >
        <div className="absolute right-3 top-3 rounded-full bg-gray-300 p-1 text-white">
          <X size={16} />
        </div>
        <div className="rounded-2xl bg-gray-300 p-4 text-white shadow-soft">
          <cfg.Icon size={48} />
        </div>
        <div className="text-3xl font-bold text-gray-400 line-through">{cfg.label}</div>
        <div className="text-sm text-gray-400">Pilihan salah</div>
      </motion.div>
    )
  }

  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`group flex min-h-[120px] flex-col items-center gap-3 rounded-3xl border-4 ${cfg.border} ${cfg.bg} px-6 py-8 shadow-pop transition ${cfg.bgHover}`}
    >
      <div className={`rounded-2xl ${cfg.iconBg} p-4 text-white shadow-soft ${cfg.iconBgHover}`}>
        <cfg.Icon size={48} />
      </div>
      <div className={`text-3xl font-bold ${cfg.text}`}>{cfg.label}</div>
      <div className="text-sm text-[#6b5b50]">{cfg.sub}</div>
    </motion.button>
  )
}
