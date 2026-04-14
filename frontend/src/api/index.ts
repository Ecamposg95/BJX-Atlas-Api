import api from './client'
import type {
  LoginPayload, TokenResponse, UserMe, UserRead, ConfigParam,
  VehicleModel, Service, CatalogCost,
  Supplier, SupplierPrice,
  EngineResponse, SimulateRequest, SimulateResponse,
  Quote, QuoteStatus, DashboardSummary, ModelProfitability,
} from './types'

// ── Auth ─────────────────────────────────────────────────────────────────────
export const login = (data: LoginPayload) =>
  api.post<TokenResponse>('/auth/login', data).then((r) => r.data)

export const getMe = () =>
  api.get<UserMe>('/auth/me').then((r) => r.data)

export const logout = () =>
  api.post('/auth/logout')

export const register = (data: { email: string; password: string; role: string }) =>
  api.post<UserMe>('/auth/register', data).then((r) => r.data)

// ── Users (admin) ────────────────────────────────────────────────────────────
export const getUsers = () =>
  api.get<UserRead[]>('/users').then((r) => r.data)

export const updateUser = (id: string, data: { role?: string; active?: boolean }) =>
  api.put<UserRead>(`/users/${id}`, data).then((r) => r.data)

export const deactivateUser = (id: string) =>
  api.delete(`/users/${id}`)

// ── Config ───────────────────────────────────────────────────────────────────
export const getConfig = () =>
  api.get<ConfigParam[]>('/config').then((r) => r.data)

export const updateConfig = (key: string, value: string) =>
  api.put<ConfigParam>(`/config/${key}`, { value }).then((r) => r.data)

// ── Catalog ──────────────────────────────────────────────────────────────────
// Returns ALL models (no garbage filter) — for admin CRUD use
export const getAllModels = () =>
  api.get<{ items: VehicleModel[] }>('/catalog/models').then((r) => r.data.items)

export const createModel = (data: { name: string; brand?: string }) =>
  api.post<VehicleModel>('/catalog/models', data).then((r) => r.data)

export const updateModel = (id: string, data: { name?: string; brand?: string; active?: boolean }) =>
  api.put<VehicleModel>(`/catalog/models/${id}`, data).then((r) => r.data)

export const deleteModel = (id: string) =>
  api.delete(`/catalog/models/${id}`)

export const createService = (data: { name: string; category: string }) =>
  api.post<Service>('/catalog/services', data).then((r) => r.data)

export const updateService = (id: string, data: { name?: string; category?: string; active?: boolean }) =>
  api.put<Service>(`/catalog/services/${id}`, data).then((r) => r.data)

export const getModels = (params?: { brand?: string; active?: boolean }) =>
  api.get<{ items: VehicleModel[] }>('/catalog/models', { params }).then((r) => {
    // Filter out Excel header rows that were mistakenly seeded as models
    const GARBAGE_PATTERN = /^\d+(\.\d+)?$|veh[íi]culos|conceptos|costo bjx|precio brame|modelo|servicio/i
    return r.data.items.filter(
      (m) => m.active && !GARBAGE_PATTERN.test(m.name.trim()) && m.service_count > 0
    )
  })

export const getServices = (params?: { search?: string; category?: string }) =>
  api.get<{ items: Service[] }>('/catalog/services', { params }).then((r) => r.data.items)

export const getCosts = (params?: { model_id?: string; service_id?: string }) =>
  api.get<{ items: CatalogCost[] }>('/catalog/costs', { params }).then((r) => r.data.items)

export const getMissingCosts = () =>
  api.get<Array<{ model_id: string; model_name: string; service_id: string; service_name: string }>>('/catalog/costs/missing').then((r) => r.data)

export const updateCost = (model_id: string, service_id: string, data: Partial<CatalogCost>) =>
  api.put<CatalogCost>(`/catalog/costs/${model_id}/${service_id}`, data).then((r) => r.data)

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const getSuppliers = () =>
  api.get<Supplier[]>('/suppliers').then((r) => r.data)

export const getSupplierPrices = (supplierId: string) =>
  api.get<SupplierPrice[]>(`/suppliers/${supplierId}/prices`).then((r) => r.data)

export const createSupplier = (data: {
  name: string
  lead_time_days: number
  warranty_days: number
  contact_name?: string
  contact_email?: string
  return_policy?: string
}) =>
  api.post<Supplier>('/suppliers', data).then((r) => r.data)

export const updateSupplier = (id: string, data: {
  name?: string
  lead_time_days?: number
  warranty_days?: number
  contact_name?: string
  contact_email?: string
  active?: boolean
}) =>
  api.put<Supplier>(`/suppliers/${id}`, data).then((r) => r.data)

export const deleteSupplier = (id: string) =>
  api.delete(`/suppliers/${id}`)

export const compareSuppliers = (params: {
  model_id: string
  service_id: string
  weights?: string
}) =>
  api.get<{ suppliers: import('./types').ScoredSupplier[]; bjx_calculation: EngineResponse['result'] }>(
    '/suppliers/compare', { params }
  ).then((r) => r.data)

// ── Engine ───────────────────────────────────────────────────────────────────
export const calculate = (data: {
  model_id: string
  service_id: string
  technician_cost_hr?: number
  target_margin?: number
  scoring_weight_price?: number
  scoring_weight_time?: number
  scoring_weight_tc?: number
}) =>
  api.post<EngineResponse>('/engine/calculate', data).then((r) => {
    // Normalize suppliers: map total_price → price and final_score → score for display
    const d = r.data
    d.suppliers = d.suppliers.map((s) => ({
      ...s,
      price: s.total_price ?? s.price ?? 0,
      score: s.final_score ?? s.score ?? 0,
    }))
    if (d.recommended_supplier) {
      d.recommended_supplier = {
        ...d.recommended_supplier,
        price: d.recommended_supplier.total_price ?? d.recommended_supplier.price ?? 0,
        score: d.recommended_supplier.final_score ?? d.recommended_supplier.score ?? 0,
      }
    }
    return d
  })

export const batch = (data: {
  model_id: string
  service_ids: string[]
  technician_cost_hr?: number
  target_margin?: number
}) =>
  api.post('/engine/batch', data).then((r) => r.data)

// ── Quotes ───────────────────────────────────────────────────────────────────
export const getQuotes = (params?: { status?: QuoteStatus; model_id?: string }) =>
  api.get<{ items: Quote[] }>('/quotes', { params }).then((r) => r.data.items)

export const getQuote = (id: string) =>
  api.get<Quote>(`/quotes/${id}`).then((r) => r.data)

export const createQuote = (data: {
  model_id: string
  service_ids: string[]
  notes?: string
  technician_cost_hr?: number
  target_margin?: number
}) =>
  api.post<Quote>('/quotes', data).then((r) => r.data)

export const updateQuoteStatus = (id: string, status: QuoteStatus) =>
  api.put<Quote>(`/quotes/${id}`, { status }).then((r) => r.data)

export const exportQuote = (id: string, format: 'pdf' | 'xlsx') =>
  api.get(`/quotes/${id}/export`, {
    params: { format },
    responseType: 'blob',
  }).then((r) => r.data)

export const getQuoteStats = (params?: { from?: string; to?: string }) =>
  api.get('/quotes/stats', { params }).then((r) => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboardSummary = () =>
  api.get<DashboardSummary>('/dashboard/summary').then((r) => r.data)

export const getByModel = (params?: { status?: string; sort?: string }) =>
  api.get<ModelProfitability[]>('/dashboard/by-model', { params }).then((r) => r.data)

export const getByService = (params?: { category?: string; sort?: string }) =>
  api.get<import('./types').ModelProfitability[]>('/dashboard/by-service', { params }).then((r) => r.data)

export const simulate = (data: SimulateRequest) =>
  api.post<SimulateResponse>('/dashboard/simulate', data).then((r) => r.data)
