import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  Alert,
  DashboardSummary,
  FillHistoryResponse,
  Paginated,
  QuizItem,
  School,
  SortLog,
  SortLogsSummary,
  Unit,
  UnitStatus,
  WasteCategory,
} from './contracts'

const POLL_MS = 30_000

export type FillRange = '24h' | '7d' | '30d'

function fillHistoryParams(range: FillRange) {
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  return {
    from: from.toISOString(),
    to: new Date().toISOString(),
    interval: range === '24h' ? 'raw' : 'hourly',
  }
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    refetchInterval: POLL_MS,
  })
}

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<Paginated<Unit>>('/units', { params: { per_page: 100 } })).data,
    refetchInterval: POLL_MS,
  })
}

export function useUnit(id: number) {
  return useQuery({
    queryKey: ['units', id],
    queryFn: async () => (await api.get<Unit>(`/units/${id}`)).data,
    refetchInterval: POLL_MS,
  })
}

export function useFillHistory(id: number, range: FillRange) {
  return useQuery({
    queryKey: ['units', id, 'fill', range],
    queryFn: async () =>
      (await api.get<FillHistoryResponse>(`/units/${id}/fill-history`, {
        params: fillHistoryParams(range),
      })).data,
  })
}

export function useSortLogs(unitId: number, page: number) {
  return useQuery({
    queryKey: ['units', unitId, 'sort-logs', page],
    queryFn: async () =>
      (await api.get<Paginated<SortLog>>(`/units/${unitId}/sort-logs`, {
        params: { page },
      })).data,
  })
}

export function useAlerts(unreadOnly: boolean, page = 1) {
  return useQuery({
    queryKey: ['alerts', { unreadOnly, page }],
    queryFn: async () =>
      (await api.get<Paginated<Alert>>('/alerts', {
        params: { unread: unreadOnly ? 1 : undefined, page },
      })).data,
    refetchInterval: POLL_MS,
  })
}

export function useQuizItems() {
  return useQuery({
    queryKey: ['quiz-items'],
    queryFn: async () => (await api.get<Paginated<QuizItem>>('/quiz-items', { params: { per_page: 100 } })).data,
  })
}

export function useSchools() {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => (await api.get<Paginated<School>>('/schools', { params: { per_page: 100 } })).data,
  })
}

export function useUpdateUnit(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Partial<{ status: UnitStatus; location_label: string }>) =>
      (await api.put<Unit>(`/units/${id}`, payload)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertId: number) =>
      (await api.patch<Alert>(`/alerts/${alertId}/read`)).data,
    // Optimistic: tandai read di semua cache list alert tanpa menunggu server.
    onMutate: async (alertId) => {
      await queryClient.cancelQueries({ queryKey: ['alerts'] })
      queryClient.setQueriesData<Paginated<Alert>>({ queryKey: ['alerts'] }, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)),
            }
          : old,
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ---------- Fase 7 ----------

export interface SortLogFilters {
  unit_id?: number
  is_correct?: '1' | '0'
  from?: string
  to?: string
}

export function useAllSortLogs(filters: SortLogFilters, page: number) {
  return useQuery({
    queryKey: ['sort-logs', filters, page],
    queryFn: async () =>
      (await api.get<Paginated<SortLog> & { summary: SortLogsSummary }>('/sort-logs', {
        params: { ...filters, page },
      })).data,
  })
}

export interface QuizItemPayload {
  item_name: string
  category: WasteCategory
  image_url: string | null
  explanation: string | null
  active: boolean
}

export function useSaveQuizItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...payload }: QuizItemPayload & { id?: number }) =>
      id
        ? (await api.put<QuizItem>(`/quiz-items/${id}`, payload)).data
        : (await api.post<QuizItem>('/quiz-items', payload)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quiz-items'] }),
  })
}

export function useDeleteQuizItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => api.delete(`/quiz-items/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quiz-items'] }),
  })
}

export interface SchoolPayload {
  name: string
  address: string | null
  city: string | null
  province: string | null
  contact_person: string | null
  contact_phone: string | null
}

export function useSaveSchool() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...payload }: SchoolPayload & { id?: number }) =>
      id
        ? (await api.put<School>(`/schools/${id}`, payload)).data
        : (await api.post<School>('/schools', payload)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['schools'] }),
  })
}

export function useDeleteSchool() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => api.delete(`/schools/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schools'] })
      void queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}

export interface UnitPayload {
  school_id: number
  code: string
  location_label: string | null
  status: UnitStatus
}

export function useSaveUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...payload }: UnitPayload & { id?: number }) =>
      id
        ? (await api.put<Unit>(`/units/${id}`, payload)).data
        : (await api.post<Unit>('/units', payload)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => api.delete(`/units/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
