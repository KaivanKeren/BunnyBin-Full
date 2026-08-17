// src/screens/ScanningScreen.tsx — Live camera + real-time YOLO detection overlay.
import { motion } from 'framer-motion'
import { ScanLine, Camera, CameraOff, Crosshair, Smartphone, TriangleAlert } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'
import { DegradedBadge } from '@/components/DegradedBadge'
import { useKiosk } from '@/context/kioskContext'
import { prettyLabel } from '@/lib/prettyLabel'

const CATEGORY_COLORS = {
  organic: { border: '#22c55e', bg: 'rgba(34,197,94,0.15)', text: 'text-green-500' },
  inorganic: { border: '#3b82f6', bg: 'rgba(59,130,246,0.15)', text: 'text-blue-500' },
} as const

function PlacementGuide({ hasDetection }: { hasDetection: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* Guide box — 60% width, 50% height, centered */}
      <div
        className="relative"
        style={{ width: '60%', maxWidth: 360, aspectRatio: '4 / 3' }}
      >
        {/* Corner brackets */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
        >
          {/* Top-left */}
          <path d="M0 20 L0 0 L20 0" stroke={hasDetection ? '#22c55e' : '#ffffff'} strokeWidth="2" opacity={hasDetection ? 1 : 0.7} />
          {/* Top-right */}
          <path d="M80 0 L100 0 L100 20" stroke={hasDetection ? '#22c55e' : '#ffffff'} strokeWidth="2" opacity={hasDetection ? 1 : 0.7} />
          {/* Bottom-left */}
          <path d="M0 80 L0 100 L20 100" stroke={hasDetection ? '#22c55e' : '#ffffff'} strokeWidth="2" opacity={hasDetection ? 1 : 0.7} />
          {/* Bottom-right */}
          <path d="M80 100 L100 100 L100 80" stroke={hasDetection ? '#22c55e' : '#ffffff'} strokeWidth="2" opacity={hasDetection ? 1 : 0.7} />
          {/* Dashed border */}
          <rect
            x="1" y="1" width="98" height="98"
            stroke={hasDetection ? '#22c55e' : '#ffffff'}
            strokeWidth="0.5"
            strokeDasharray="4 3"
            opacity={hasDetection ? 0.4 : 0.25}
            rx="4"
          />
        </svg>

        {/* Center crosshair */}
        {!hasDetection && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Crosshair size={48} className="text-white/40" strokeWidth={1} />
          </motion.div>
        )}

        {/* Label below box */}
        <motion.div
          className="absolute -bottom-8 left-0 right-0 text-center"
          animate={!hasDetection ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
          transition={!hasDetection ? { duration: 1.8, repeat: Infinity } : {}}
        >
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm">
            {hasDetection ? '✓ Objek terdeteksi' : 'Taruh sampah di dalam kotak'}
          </span>
        </motion.div>
      </div>
    </div>
  )
}

function BoundingBoxOverlay({
  bbox,
  label,
  category,
  confidence,
}: {
  bbox: [number, number, number, number] | null
  label: string | null
  category: string | null
  confidence: number
}) {
  if (!bbox || !category) return null

  const colors = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.inorganic
  const [x1, y1, x2, y2] = bbox
  const w = x2 - x1
  const h = y2 - y1

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute"
      style={{
        left: `${x1 * 100}%`,
        top: `${y1 * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        border: `3px solid ${colors.border}`,
        borderRadius: '8px',
        backgroundColor: colors.bg,
      }}
    >
      <div
        className="absolute -top-7 left-0 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-white"
        style={{ backgroundColor: colors.border }}
      >
        <span>{label ?? category}</span>
        <span className="opacity-80">{Math.round(confidence * 100)}%</span>
      </div>
    </motion.div>
  )
}

function ConfidenceBar({ confidence, category }: { confidence: number; category: string | null }) {
  const color = category === 'organic' ? 'bg-green-500' : category === 'inorganic' ? 'bg-blue-500' : 'bg-gray-400'
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-white/80">Confidence</span>
        <span className="font-bold text-white">{Math.round(confidence * 100)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${confidence * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  )
}

/**
 * Penanda bahwa yang memindai BUKAN kamera HP.
 *
 * Kegagalan ini bisu tanpa penanda: kiosk tetap memindai, tetap menjawab, hanya
 * saja yang dilihatnya kamera bawaan tablet — yang menghadap wajah anak, bukan
 * sampah di dalam tong. Hasil klasifikasinya jadi acak dan tak seorang pun tahu
 * sebabnya. Karena itu ia ditampilkan di layar, bukan cuma di console.
 */
function FallbackCameraBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute left-1/2 top-14 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-black shadow-soft"
    >
      <TriangleAlert size={14} />
      Kamera HP tidak ditemukan — memakai kamera bawaan
    </motion.div>
  )
}

export default function ScanningScreen() {
  const { state: kioskState, camera, startCamera, attachPreview, liveDetection } = useKiosk()
  // During scanning phase, use liveDetection from the real-time loop.
  // After SCAN_DONE, kioskState.detection has the confirmed detection.
  const detection = kioskState.phase === 'scanning' ? liveDetection : kioskState.detection
  const isCameraActive = camera.isActive
  const isCameraReady = camera.ready
  // Sumber yang benar = kamera HP. Kamera bawaan hanya masuk lewat fallback,
  // dan saat itu terjadi seluruh indikator berubah warna, bukan diam-diam hijau.
  const usingPhoneCamera = camera.kind !== null && !camera.isFallback
  const hasError = !!camera.error
  const hasDetection = !!detection?.category && detection.confidence > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
    >
      {/* Camera feed background.
          Kontainer kosong yang DIISI useCamera dengan elemen kameranya sendiri —
          <video> untuk kamera virtual HP, <img> untuk stream MJPEG. Layar ini
          sengaja tidak membuat elemennya sendiri: pada jalur MJPEG setiap elemen
          adalah satu koneksi HTTP ke HP, dan DroidCam hanya melayani satu. */}
      {isCameraActive && (
        <div className="absolute inset-0">
          <div ref={attachPreview} className="h-full w-full" />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {camera.isFallback && <FallbackCameraBadge />}

      {/* Fallback: animated scanning when no camera */}
      {!isCameraActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                initial={{ scale: 0.4, opacity: 0.6 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.5, repeat: Infinity, ease: 'easeOut' }}
                className="absolute h-72 w-72 rounded-full border-4 border-inorganic-300"
              />
            ))}
            <motion.div
              className="absolute h-72 w-72 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(123,179,238,0.0) 0deg, rgba(123,179,238,0.45) 45deg, rgba(123,179,238,0.0) 90deg)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            <BunnyMascot mood="scan" size={260} />
          </div>
        </div>
      )}

      {/* Placement guide box (when camera active) */}
      {isCameraActive && <PlacementGuide hasDetection={hasDetection} />}

      {/* Bounding box overlay (when camera active + detection with bbox) */}
      {isCameraActive && detection?.bbox && (
        <BoundingBoxOverlay
          bbox={detection.bbox}
          label={prettyLabel(detection.label)}
          category={detection.category}
          confidence={detection.confidence}
        />
      )}

      {/* Bottom info panel */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-6 pb-6">
        {/* Camera status indicator */}
        <div className="flex items-center gap-2">
          {isCameraReady ? (
            usingPhoneCamera ? (
              <Smartphone size={16} className="text-green-400" />
            ) : (
              <Camera size={16} className="text-amber-400" />
            )
          ) : hasError ? (
            <CameraOff size={16} className="text-red-400" />
          ) : (
            <ScanLine size={16} className="animate-pulse text-inorganic-300" />
          )}
          <span className="text-sm font-medium text-white/80">
            {isCameraReady
              ? usingPhoneCamera
                ? `Kamera HP aktif — ${camera.label}`
                : `Kamera bawaan aktif — ${camera.label}`
              : hasError
                ? `Kamera error: ${camera.error}`
                : 'Menghubungkan kamera HP...'}
          </span>
        </div>

        {/* Detection result */}
        {hasDetection && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col items-center gap-2"
          >
            {detection!.label && (
              <div
                className={`rounded-full px-4 py-1 text-sm font-bold ${
                  detection!.category === 'organic'
                    ? 'bg-green-500/20 text-green-300'
                    : detection!.category === 'inorganic'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-gray-500/20 text-gray-300'
                }`}
              >
                {prettyLabel(detection!.label)?.toUpperCase()}
                {detection!.category && (
                  <span className="ml-2 opacity-70">
                    [{detection!.category === 'organic' ? 'ORGANIK' : 'ANORGANIK'}]
                  </span>
                )}
              </div>
            )}
            <ConfidenceBar confidence={detection!.confidence} category={detection!.category} />
            <DegradedBadge
              degraded={detection!.degraded}
              reason={detection!.degraded_reason}
            />
          </motion.div>
        )}

        {/* Scanning text — changes based on detection state */}
        <div className="inline-flex items-center gap-2 rounded-full bg-black/40 px-5 py-2 text-white shadow-soft backdrop-blur-sm">
          <ScanLine size={20} className="animate-pulse" />
          <span className="font-semibold">
            {hasDetection ? 'Mengenali objek...' : 'Memindai sampah...'}
          </span>
        </div>
        <motion.p
          className="text-xl font-bold text-white"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          {hasDetection ? 'Terdeteksi!' : 'Tunggu sebentar ya!'}
        </motion.p>

        {/* Loading dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-3 w-3 rounded-full bg-white/60"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </div>

      {/* Tombol kamera. Muncul juga SAAT ERROR — sebab paling umum (app DroidCam
          tertutup, HP terkunci, client di host mati) bisa diperbaiki di tempat
          dalam hitungan detik, dan tanpa tombol ini operator harus memuat ulang
          seluruh kiosk hanya untuk mencoba lagi. */}
      {!isCameraActive && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: hasError ? 0 : 1 }}
          onClick={() => startCamera()}
          className="absolute right-4 top-14 z-10 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-sm"
        >
          <Camera size={14} />
          {hasError ? 'Coba Lagi' : 'Aktifkan Kamera'}
        </motion.button>
      )}
    </motion.div>
  )
}
