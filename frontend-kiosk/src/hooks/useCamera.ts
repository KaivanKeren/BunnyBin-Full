// src/hooks/useCamera.ts
// Camera capture hook — getUserMedia + canvas resize + base64 export.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CameraState {
  isActive: boolean
  ready: boolean
  error: string | null
  stream: MediaStream | null
}

const CAPTURE_WIDTH = 640
const CAPTURE_QUALITY = 0.85

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({
    isActive: false,
    ready: false,
    error: null,
    stream: null,
  })

  const start = useCallback(async () => {
    if (streamRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (!videoRef.current) {
        videoRef.current = document.createElement('video')
        videoRef.current.setAttribute('playsinline', 'true')
        videoRef.current.setAttribute('muted', 'true')
        videoRef.current.muted = true
      }
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }

      setState({ isActive: true, ready: false, error: null, stream })

      // Wait for video to have actual dimensions before marking ready
      const waitForReady = () => {
        const video = videoRef.current
        if (video && video.videoWidth > 0 && video.videoHeight > 0) {
          setState((s) => ({ ...s, ready: true }))
          return
        }
        requestAnimationFrame(waitForReady)
      }
      requestAnimationFrame(waitForReady)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera tidak tersedia'
      setState((s) => ({ ...s, error: msg }))
    }
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setState({ isActive: false, ready: false, error: null, stream: null })
  }, [])

  const captureFrame = useCallback((): string => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return ''

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return ''

    const scale = CAPTURE_WIDTH / vw
    canvas.width = CAPTURE_WIDTH
    canvas.height = Math.round(vh * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', CAPTURE_QUALITY).split(',')[1]
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  return { state, start, stop, captureFrame, videoRef }
}
