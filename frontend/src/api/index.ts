import api from './client'
import type {
  LoginPayload, TokenResponse, UserMe, ConfigParam,
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

// ── Config ───────────────────────────────────────────────────────────────────
export const getConfig = () =>
  api.get<ConfigParam[]>('/config').then((r) => r.data)

export const updateConfig = (key: string, value: string) =>
  api.put<ConfigParam>(`/config/${key}`, { value }).then((r) => r.data)

// ── Catalog ──────────────────────────────────────────────────────────────────
export const getModels = (params?: { brand?: string; active?: boolean }) =>
  api.get<VehicleModel[]>('/catalog/models', { params }).then((r) => r.data)

export const getServices = (params?: { search?: string; category?: string }) =>
  api.get<Service[]>('/catalog/services', { params }).then((r) => r.data)

export const getCosts = (params?: { model_id?: string; service_id?: string }) =>
  api.get<CatalogCost[]>('/catalog/costs', { params }).then((r) => r.data)

export const getMissingCosts = () =>
  api.get<Array<{ model_id: string; model_name: string; service_id: string; service_name: string }>>('/catalog/costs/missing').then((r) => r.data)

export const updateCost = (model_id: string, service_id: string, data: Partial<CatalogCost>) =>
  api.put<CatalogCost>(`/catalog/costs/${model_id}/${service_id}`, data).then((r) => r.data)

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const getSuppliers = () =>
  api.get<Supplier[]>('/suppliers').then((r) => r.data)

export const getSupplierPrices = (supplierId: string) =>
  api.get<SupplierPrice[]>(`/suppliers/${supplierId}/prices`).then((r) => r.data)

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
  api.post<EngineResponse>('/engine/calculate', data).then((r) => r.data)

// ── Quotes ───────────────────────────────────────────────────────────────────
export const getQuotes = (params?: { status?: QuoteStatus; model_id?: string }) =>
  api.get<Quote[]>('/quotes', { params }).then((r) => r.data)

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
  api.patch<Quote>(`/quotes/${id}/status`, { status }).then((r) => r.data)

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
