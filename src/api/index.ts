// Titik tukar mock ↔ real (PRD-FE §5.4) — satu-satunya file yang perlu
// diubah begitu Fase A/B/C selesai. Komponen dan hooks SELALU import dari
// sini, tidak pernah langsung dari mock*/real*.

import type { IEsp32Client, ICvClient, ICloudClient } from './contracts';
import { MockEsp32Client } from './esp32/mockEsp32Client';
import { RealEsp32Client } from './esp32/realEsp32Client';
import { MockCvClient } from './cv/mockCvClient';
import { RealCvClient } from './cv/realCvClient';
import { MockCloudClient } from './cloud/mockCloudClient';
import { RealCloudClient } from './cloud/realCloudClient';
import { getDeviceSettings } from '../config/settings';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'; // default: mock

export const esp32Client: IEsp32Client = USE_MOCK
  ? new MockEsp32Client()
  : new RealEsp32Client(getDeviceSettings().esp32Host);

export const cvClient: ICvClient = USE_MOCK
  ? new MockCvClient()
  : new RealCvClient(getDeviceSettings().cvUrl);

export const cloudClient: ICloudClient = USE_MOCK
  ? new MockCloudClient()
  : new RealCloudClient(getDeviceSettings().cloudUrl);
