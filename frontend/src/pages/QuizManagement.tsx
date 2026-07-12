import { useState, type FormEvent } from 'react'
import type { QuizItem, WasteCategory } from '../api/contracts'
import { useDeleteQuizItem, useQuizItems, useSaveQuizItem, type QuizItemPayload } from '../api/hooks'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none'

const EMPTY: QuizItemPayload = {
  item_name: '',
  category: 'organic',
  image_url: null,
  explanation: null,
  active: true,
}

function QuizForm({
  initial,
  onClose,
}: {
  initial: (QuizItemPayload & { id?: number }) | null
  onClose: () => void
}) {
  const save = useSaveQuizItem()
  const [form, setForm] = useState<QuizItemPayload & { id?: number }>(initial ?? EMPTY)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await save.mutateAsync(form)
    onClose()
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Nama item</span>
        <input
          required
          maxLength={100}
          className={inputClass}
          value={form.item_name}
          onChange={(e) => setForm({ ...form, item_name: e.target.value })}
        />
      </label>

      <fieldset className="text-sm">
        <span className="mb-1 block text-slate-600">Kategori</span>
        <div className="flex gap-4">
          {(['organic', 'inorganic'] as WasteCategory[]).map((category) => (
            <label key={category} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="category"
                checked={form.category === category}
                onChange={() => setForm({ ...form, category })}
              />
              {category === 'organic' ? 'Organik' : 'Anorganik'}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">URL gambar (opsional)</span>
        <input
          type="url"
          className={inputClass}
          value={form.image_url ?? ''}
          onChange={(e) => setForm({ ...form, image_url: e.target.value || null })}
        />
      </label>
      {form.image_url && (
        <img
          src={form.image_url}
          alt="Preview"
          className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}

      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Penjelasan edukasi</span>
        <textarea
          rows={3}
          className={inputClass}
          value={form.explanation ?? ''}
          onChange={(e) => setForm({ ...form, explanation: e.target.value || null })}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Aktif (tampil di kiosk)
      </label>

      {save.isError && <ErrorState message="Gagal menyimpan quiz item." />}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

export function QuizManagement() {
  const items = useQuizItems()
  const deleteItem = useDeleteQuizItem()
  const [editing, setEditing] = useState<(QuizItemPayload & { id?: number }) | null | 'new'>(null)
  const [deleting, setDeleting] = useState<QuizItem | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Quiz Bank</h1>
        <button
          onClick={() => setEditing('new')}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Tambah Item
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {items.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : items.isError ? (
          <ErrorState message="Gagal memuat quiz bank." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Kategori</th>
                <th className="py-2 pr-4">Penjelasan</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.data.data.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-4 font-medium">{item.item_name}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        item.category === 'organic'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.category === 'organic' ? 'Organik' : 'Anorganik'}
                    </span>
                  </td>
                  <td className="max-w-xs truncate py-2 pr-4 text-slate-500">
                    {item.explanation ?? '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={item.active ? 'text-emerald-600' : 'text-slate-400'}>
                      {item.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setEditing({ ...item })}
                      className="mr-2 text-emerald-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button onClick={() => setDeleting(item)} className="text-red-600 hover:underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {items.data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Quiz bank kosong.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        title={editing === 'new' ? 'Tambah Quiz Item' : 'Edit Quiz Item'}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        <QuizForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Hapus Quiz Item"
        message={`Hapus "${deleting?.item_name}"? Log sortir lama tetap tersimpan tetapi kehilangan referensi item ini.`}
        busy={deleteItem.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteItem.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
          }
        }}
      />
    </div>
  )
}
