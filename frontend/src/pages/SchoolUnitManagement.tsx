import { useState, type FormEvent } from 'react'
import type { School, Unit, UnitStatus } from '../api/contracts'
import {
  useDeleteSchool,
  useDeleteUnit,
  useSaveSchool,
  useSaveUnit,
  useSchools,
  useUnits,
  type SchoolPayload,
  type UnitPayload,
} from '../api/hooks'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none'

const EMPTY_SCHOOL: SchoolPayload = {
  name: '',
  address: null,
  city: null,
  province: null,
  contact_person: null,
  contact_phone: null,
}

function SchoolForm({
  initial,
  onClose,
}: {
  initial: (SchoolPayload & { id?: number }) | null
  onClose: () => void
}) {
  const save = useSaveSchool()
  const [form, setForm] = useState(initial ?? EMPTY_SCHOOL)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await save.mutateAsync(form)
    onClose()
  }

  const text = (key: keyof SchoolPayload, label: string, required = false) => (
    <label className="text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        required={required}
        className={inputClass}
        value={(form[key] as string | null) ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value || (required ? '' : null) })}
      />
    </label>
  )

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      {text('name', 'Nama sekolah', true)}
      {text('address', 'Alamat')}
      <div className="grid grid-cols-2 gap-3">
        {text('city', 'Kota')}
        {text('province', 'Provinsi')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text('contact_person', 'Narahubung')}
        {text('contact_phone', 'Telepon')}
      </div>

      {save.isError && <ErrorState message="Gagal menyimpan sekolah." />}

      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Batal
        </button>
        <button type="submit" disabled={save.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

function UnitForm({
  initial,
  schools,
  onClose,
}: {
  initial: (UnitPayload & { id?: number }) | null
  schools: School[]
  onClose: () => void
}) {
  const save = useSaveUnit()
  const [form, setForm] = useState<UnitPayload & { id?: number }>(
    initial ?? {
      school_id: schools[0]?.id ?? 0,
      code: '',
      location_label: null,
      status: 'active',
    },
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await save.mutateAsync(form)
    onClose()
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Sekolah</span>
        <select
          required
          className={inputClass}
          value={form.school_id}
          onChange={(e) => setForm({ ...form, school_id: Number(e.target.value) })}
        >
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Kode unit (serial ESP32)</span>
        <input
          required
          maxLength={30}
          placeholder="BNB-003"
          className={inputClass}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Label lokasi</span>
        <input
          placeholder="Kelas 3A / Kantin"
          className={inputClass}
          value={form.location_label ?? ''}
          onChange={(e) => setForm({ ...form, location_label: e.target.value || null })}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Status</span>
        <select
          className={inputClass}
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as UnitStatus })}
        >
          <option value="active">active</option>
          <option value="maintenance">maintenance</option>
          <option value="offline">offline</option>
        </select>
      </label>

      {save.isError && <ErrorState message="Gagal menyimpan unit (kode mungkin sudah dipakai)." />}

      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Batal
        </button>
        <button type="submit" disabled={save.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

export function SchoolUnitManagement() {
  const [tab, setTab] = useState<'schools' | 'units'>('schools')
  const schools = useSchools()
  const units = useUnits()
  const deleteSchool = useDeleteSchool()
  const deleteUnit = useDeleteUnit()

  const [editingSchool, setEditingSchool] = useState<(SchoolPayload & { id?: number }) | null | 'new'>(null)
  const [editingUnit, setEditingUnit] = useState<(UnitPayload & { id?: number }) | null | 'new'>(null)
  const [deletingSchool, setDeletingSchool] = useState<School | null>(null)
  const [deletingUnit, setDeletingUnit] = useState<Unit | null>(null)

  const loading = schools.isPending || units.isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Sekolah & Unit</h1>
        <button
          onClick={() => (tab === 'schools' ? setEditingSchool('new') : setEditingUnit('new'))}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Tambah {tab === 'schools' ? 'Sekolah' : 'Unit'}
        </button>
      </div>

      <div className="flex gap-1 self-start rounded-lg bg-slate-100 p-1">
        {(['schools', 'units'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1 text-sm font-medium ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t === 'schools' ? 'Sekolah' : 'Unit'}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : schools.isError || units.isError ? (
          <ErrorState />
        ) : tab === 'schools' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Kota</th>
                <th className="py-2 pr-4">Narahubung</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schools.data.data.map((school) => (
                <tr key={school.id}>
                  <td className="py-2 pr-4 font-medium">{school.name}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {[school.city, school.province].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {school.contact_person ?? '—'}
                    {school.contact_phone ? ` (${school.contact_phone})` : ''}
                  </td>
                  <td className="py-2 pr-4">{school.units_count ?? 0}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => setEditingSchool({ ...EMPTY_SCHOOL, ...school })} className="mr-2 text-emerald-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => setDeletingSchool(school)} className="text-red-600 hover:underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {schools.data.data.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Belum ada sekolah.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-4">Kode</th>
                <th className="py-2 pr-4">Sekolah</th>
                <th className="py-2 pr-4">Lokasi</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.data.data.map((unit) => (
                <tr key={unit.id}>
                  <td className="py-2 pr-4 font-medium">{unit.code}</td>
                  <td className="py-2 pr-4 text-slate-500">{unit.school.name}</td>
                  <td className="py-2 pr-4 text-slate-500">{unit.location_label ?? '—'}</td>
                  <td className="py-2 pr-4"><StatusBadge status={unit.status} /></td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() =>
                        setEditingUnit({
                          id: unit.id,
                          school_id: unit.school.id,
                          code: unit.code,
                          location_label: unit.location_label,
                          status: unit.status,
                        })
                      }
                      className="mr-2 text-emerald-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button onClick={() => setDeletingUnit(unit)} className="text-red-600 hover:underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {units.data.data.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Belum ada unit.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        title={editingSchool === 'new' ? 'Tambah Sekolah' : 'Edit Sekolah'}
        open={editingSchool !== null}
        onClose={() => setEditingSchool(null)}
      >
        <SchoolForm initial={editingSchool === 'new' ? null : editingSchool} onClose={() => setEditingSchool(null)} />
      </Modal>

      <Modal
        title={editingUnit === 'new' ? 'Tambah Unit' : 'Edit Unit'}
        open={editingUnit !== null}
        onClose={() => setEditingUnit(null)}
      >
        <UnitForm
          initial={editingUnit === 'new' ? null : editingUnit}
          schools={schools.data?.data ?? []}
          onClose={() => setEditingUnit(null)}
        />
      </Modal>

      <ConfirmDialog
        open={deletingSchool !== null}
        title="Hapus Sekolah"
        message={`Hapus "${deletingSchool?.name}"? SEMUA unit, log, dan alert milik sekolah ini ikut terhapus.`}
        busy={deleteSchool.isPending}
        onCancel={() => setDeletingSchool(null)}
        onConfirm={() => {
          if (deletingSchool) {
            deleteSchool.mutate(deletingSchool.id, { onSuccess: () => setDeletingSchool(null) })
          }
        }}
      />

      <ConfirmDialog
        open={deletingUnit !== null}
        title="Hapus Unit"
        message={`Hapus unit ${deletingUnit?.code}? Seluruh riwayat sensor dan log sortirnya ikut terhapus.`}
        busy={deleteUnit.isPending}
        onCancel={() => setDeletingUnit(null)}
        onConfirm={() => {
          if (deletingUnit) {
            deleteUnit.mutate(deletingUnit.id, { onSuccess: () => setDeletingUnit(null) })
          }
        }}
      />
    </div>
  )
}
