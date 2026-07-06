export interface DeviceSettings {
  esp32Host: string;
  cvUrl: string;
  cloudUrl: string;
}

const STORAGE_KEY = 'bunnybin.settings';

const DEFAULTS: DeviceSettings = {
  esp32Host: 'http://bunnybin.local',
  cvUrl: 'http://localhost:8001',
  cloudUrl: '',
};

export function getDeviceSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveDeviceSettings(settings: Partial<DeviceSettings>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getDeviceSettings(), ...settings }));
}
