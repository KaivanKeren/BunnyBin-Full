// src/api/index.ts
// Factory mock/real — satu switch VITE_USE_MOCK (§8). Instansiasi sekali (singleton),
// karena mock menyimpan state (fill, logs) yang harus persist selama sesi.
import { config } from './config'
import type { ICloudClient, IEsp32Client } from './contracts'
import { MockCloudClient } from './mock/MockCloudClient'
import { MockEsp32Client } from './mock/MockEsp32Client'
import { RealCloudClient } from './real/RealCloudClient'
import { RealEsp32Client } from './real/RealEsp32Client'

export interface KioskClients {
  esp32: IEsp32Client
  cloud: ICloudClient
}

let clients: KioskClients | null = null

export function getClients(): KioskClients {
  if (!clients) {
    clients = config.useMock
      ? { esp32: new MockEsp32Client(), cloud: new MockCloudClient() }
      : { esp32: new RealEsp32Client(), cloud: new RealCloudClient() }
  }
  return clients
}
