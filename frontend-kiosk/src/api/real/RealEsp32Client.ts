// src/api/real/RealEsp32Client.ts
// HTTP ke ESP32 lokal (jaringan lokal device kiosk). Endpoint firmware — sesuaikan
// saat integrasi hardware fisik (Fase K8). simDrop/simReset tidak berlaku di hardware.
import type {
  Esp32Status,
  IEsp32Client,
  SortCommand,
  SortResult,
} from '@/api/contracts'
import { esp32 } from '@/api/http'

export class RealEsp32Client implements IEsp32Client {
  async getStatus(): Promise<Esp32Status> {
    const { data } = await esp32.get<Esp32Status>('/status')
    return data
  }

  async sort(cmd: SortCommand): Promise<SortResult> {
    const { data } = await esp32.post<SortResult>('/sort', cmd)
    return data
  }

  async simDrop(): Promise<void> {
    throw new Error('simDrop tidak tersedia di hardware nyata')
  }

  async simReset(): Promise<void> {
    throw new Error('simReset tidak tersedia di hardware nyata')
  }
}
