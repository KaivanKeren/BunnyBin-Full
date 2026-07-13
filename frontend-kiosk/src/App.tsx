// src/App.tsx — shell kiosk: device frame + router-by-phase.
import { AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import StatusBar from '@/components/StatusBar'
import { config } from '@/api/config'
import DebugPanel from '@/debug/DebugPanel'
import { KioskProvider } from '@/context/KioskProvider'
import { useKiosk } from '@/context/kioskContext'
import ErrorScreen from '@/screens/ErrorScreen'
import FullLockScreen from '@/screens/FullLockScreen'
import IdleScreen from '@/screens/IdleScreen'
import OfflineBanner from '@/screens/OfflineBanner'
import QuestionScreen from '@/screens/QuestionScreen'
import ScanningScreen from '@/screens/ScanningScreen'
import SortingScreen from '@/screens/SortingScreen'
import SuccessScreen from '@/screens/SuccessScreen'

function Stage() {
  const { state } = useKiosk()
  return (
    <div className="absolute inset-0 pt-10">
      <AnimatePresence mode="wait">
        {state.phase === 'idle' && <IdleScreen key="idle" />}
        {state.phase === 'scanning' && <ScanningScreen key="scanning" />}
        {state.phase === 'question' && <QuestionScreen key="question" />}
        {state.phase === 'sorting' && <SortingScreen key="sorting" />}
        {state.phase === 'success' && <SuccessScreen key="success" />}
        {state.phase === 'error' && <ErrorScreen key="error" />}
        {state.phase === 'full_lock' && <FullLockScreen key="full_lock" />}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  // Kiosk: blokir context menu (UI-08). Fullscreen di-request saat gesture pertama.
  useEffect(() => {
    const noMenu = (e: Event) => e.preventDefault()
    document.addEventListener('contextmenu', noMenu)
    return () => document.removeEventListener('contextmenu', noMenu)
  }, [])

  const requestFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <KioskProvider>
      <div
        className="flex h-screen w-screen items-center justify-center bg-[#2b211a] p-4"
        onClick={requestFullscreen}
      >
        <div
          className="relative w-full max-w-[1024px] overflow-hidden rounded-[28px] border-[10px] border-[#1a1410] bg-canvas shadow-2xl"
          style={{ aspectRatio: '1024 / 600' }}
        >
          <StatusBar />
          <Stage />
          <OfflineBanner />
          {config.debugPanel && <DebugPanel />}
        </div>
      </div>
    </KioskProvider>
  )
}
