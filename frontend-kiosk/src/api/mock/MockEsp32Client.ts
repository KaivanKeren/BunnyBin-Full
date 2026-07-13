// src/api/mock/MockEsp32Client.ts
// Simulasi ESP32 lokal (§8): fill naik +1%/30dtk per kompartemen, sort() delay 800–1200ms.
import type {
  Esp32Status,
  IEsp32Client,
  SortCommand,
  SortResult,
  WasteCategory,
} from '@/api/contracts'
import { mockControls } from './mockControls'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const clamp = (n: number) => Math.max(0, Math.min(100, n))

export class MockEsp32Client implements IEsp32Client {
  private organic = 12
  private inorganic = 8
  private servo: Esp32Status['servo_pos'] = 'idle'

  constructor() {
    setInterval(() => {
      this.organic = clamp(this.organic + 1)
      this.inorganic = clamp(this.inorganic + 1)
    }, 30_000)
  }

  async getStatus(): Promise<Esp32Status> {
    if (mockControls.esp32Offline) throw new Error('ESP32 offline (mock)')
    await delay(60)
    return {
      organic_pct: this.organic,
      inorganic_pct: this.inorganic,
      servo_pos: this.servo,
    }
  }

  async sort(cmd: SortCommand): Promise<SortResult> {
    if (mockControls.esp32Offline) throw new Error('ESP32 offline (mock)')
    this.servo = cmd.category
    await delay(800 + Math.random() * 400)
    this.addFill(cmd.category, 2) // sampah masuk ke kompartemen tujuan
    const pos = this.servo
    this.servo = 'idle'
    return { status: 'ok', servo_pos: pos }
  }

  async simDrop(compartment: WasteCategory, amount: number): Promise<void> {
    this.addFill(compartment, amount)
  }

  async simReset(): Promise<void> {
    this.organic = 0
    this.inorganic = 0
    this.servo = 'idle'
  }

  /** Debug-only: set fill langsung dari slider panel. */
  setFill(compartment: WasteCategory, pct: number): void {
    if (compartment === 'organic') this.organic = clamp(pct)
    else this.inorganic = clamp(pct)
  }

  private addFill(c: WasteCategory, amt: number): void {
    if (c === 'organic') this.organic = clamp(this.organic + amt)
    else this.inorganic = clamp(this.inorganic + amt)
  }
}
