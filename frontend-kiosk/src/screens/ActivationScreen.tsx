// src/screens/ActivationScreen.tsx
// Layar sekali-seumur-perangkat: operator memasukkan kode aktivasi, kiosk
// menukarnya dengan token unitnya sendiri lalu menyimpannya di localStorage.
//
// Ini yang menggantikan VITE_KIOSK_API_TOKEN. Layar ini TIDAK ditujukan untuk
// anak — ia hanya muncul saat perangkat belum punya kredensial, yaitu saat
// pemasangan atau setelah token dicabut.
import { useState, type FormEvent } from 'react'
import axios from 'axios'
import { config } from '@/api/config'
import { saveCredentials } from '@/api/credentials'

interface ActivationResponse {
  token: string
  unit_code: string
  location_label: string | null
}

export default function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Sengaja memakai axios polos, bukan instance @/api/http: instance itu
      // menyisipkan Authorization dari kredensial yang justru belum ada.
      const { data } = await axios.post<ActivationResponse>(
        `${config.apiUrl}/devices/activate`,
        { code },
        { headers: { Accept: 'application/json' } },
      )

      saveCredentials({ token: data.token, unitCode: data.unit_code })
      onActivated()
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response
          ? // 429 = terlalu sering mencoba; 422 = kode tidak berlaku.
            (err.response.data?.message ?? 'Kode aktivasi tidak berlaku.')
          : 'Tidak dapat terhubung ke server. Periksa koneksi jaringan.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-canvas p-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-5xl">🐰</div>
        <h1 className="text-2xl font-bold text-slate-800">Aktivasi Perangkat</h1>
        <p className="mt-2 text-sm text-slate-500">
          Perangkat ini belum terhubung ke unit mana pun. Masukkan kode aktivasi dari
          admin untuk menghubungkannya.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-center font-mono text-xl tracking-[0.2em] text-slate-800 focus:border-emerald-500 focus:outline-none"
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || code.trim().length === 0}
            className="rounded-xl bg-emerald-600 py-3 text-lg font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Menghubungkan…' : 'Aktifkan'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          Admin membuat kode dengan:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">
            php artisan unit:activation-code {'{kode-unit}'}
          </code>
        </p>
      </div>
    </div>
  )
}
