// src/api/mock/generateDetection.ts
// Distribusi confidence CV mock (§8): 60% tinggi (0.75–0.95), 25% rendah (0.4–0.65),
// 15% null (CV gagal mengenali → fallback kuis manual).
import type { CvDetection, WasteCategory } from '@/api/contracts'

const CATS: WasteCategory[] = ['organic', 'inorganic']
const rand = (min: number, max: number) => min + Math.random() * (max - min)

export function generateDetection(): CvDetection {
  const roll = Math.random()
  const category = CATS[Math.floor(Math.random() * CATS.length)]
  const bbox: [number, number, number, number] = [
    Math.round(rand(20, 120)),
    Math.round(rand(20, 120)),
    Math.round(rand(140, 260)),
    Math.round(rand(140, 260)),
  ]
  const base = { bbox, model_version: 'mock-cv-1.0' }

  if (roll < 0.6) return { ...base, category, confidence: Number(rand(0.75, 0.95).toFixed(2)) }
  if (roll < 0.85) return { ...base, category, confidence: Number(rand(0.4, 0.65).toFixed(2)) }
  return { ...base, category: null, confidence: Number(rand(0.1, 0.39).toFixed(2)), bbox: null }
}
