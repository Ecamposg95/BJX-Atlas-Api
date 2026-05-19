import api from './client'
import type {
  LoginPayload, TokenResponse, UserMe, UserRead, ConfigParam,
  VehicleModel, Service, CatalogCost,
  Supplier, SupplierPrice,
  EngineResponse, SimulateRequest, SimulateResponse,
  Quote, QuoteStatus, DashboardSummary, ModelProfitability,
  Branch, BranchSwitchResponse, BranchStat, BranchMetric,
  Warehouse, Part, StockLevel, StockBoardResponse, StockStatus,
  InventoryRequest, InventoryRequestStatus, InventoryMovement,
  ServiceBay, WorkOrderLine, Evidence,
  Paginated,
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

export const getServices = (params?: { search?: string; category?: string; status?: 'proposed' | 'approved' | 'rejected' }) =>
  api.get<{ items: Service[] }>('/catalog/services', { params }).then((r) => r.data.items)

export const approveService = (id: string, reason?: string) =>
  api.post<Service>(`/catalog/services/${id}/approve`, reason ? { reason } : {}).then((r) => r.data)

export const rejectService = (id: string, reason: string) =>
  api.post<Service>(`/catalog/services/${id}/reject`, { reason }).then((r) => r.data)

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

// ── Branches ─────────────────────────────────────────────────────────────────
export const listBranches = () =>
  api.get<Branch[]>('/branches').then((r) => r.data)

export const switchBranch = (branch_id: string) =>
  api.post<BranchSwitchResponse>('/branches/switch', { branch_id }).then((r) => r.data)

export const getBranchStats = (params?: {
  metric?: BranchMetric
  date_from?: string
  date_to?: string
}) =>
  api
    .get<BranchStat[]>('/v1/branches/stats', { params })
    .then((r) => (Array.isArray(r.data) ? r.data : []))

export const getManagerDashboard = (params?: { branch_id?: string; refresh?: boolean }) =>
  api
    .get<import('./types').ManagerDashboard>('/v1/branches/manager-dashboard', { params })
    .then((r) => r.data)

// ── Inventory: Warehouses ────────────────────────────────────────────────────
export const listWarehouses = () =>
  api.get<Warehouse[]>('/inventory/warehouses').then((r) => r.data)

export const createWarehouse = (data: { code: string; name: string; kind?: string; branch_id?: string }) =>
  api.post<Warehouse>('/inventory/warehouses', data).then((r) => r.data)

export const updateWarehouse = (id: string, data: Partial<Warehouse>) =>
  api.put<Warehouse>(`/inventory/warehouses/${id}`, data).then((r) => r.data)

// ── Inventory: Parts ─────────────────────────────────────────────────────────
export const listParts = (params?: {
  q?: string; category?: string; only_active?: boolean; only_low_stock?: boolean
  page?: number; page_size?: number
}) =>
  api.get<Paginated<Part>>('/inventory/parts', { params }).then((r) => r.data)

export const createPart = (data: Partial<Part> & { sku: string; name: string }) =>
  api.post<Part>('/inventory/parts', data).then((r) => r.data)

export const updatePart = (id: string, data: Partial<Part>) =>
  api.put<Part>(`/inventory/parts/${id}`, data).then((r) => r.data)

// ── Inventory: Stock + Movements ─────────────────────────────────────────────
export const listStock = (params?: { warehouse_id?: string; part_id?: string }) =>
  api.get<StockLevel[]>('/inventory/stock', { params }).then((r) => r.data)

export const getStockBoard = (params?: {
  status?: StockStatus; search?: string; only_active?: boolean
  skip?: number; limit?: number
}) =>
  api.get<StockBoardResponse>('/inventory/stock-board', { params }).then((r) => r.data)

export const listMovements = (params?: {
  warehouse_id?: string; part_id?: string; movement_type?: string
  page?: number; page_size?: number
}) =>
  api.get<Paginated<InventoryMovement>>('/inventory/movements', { params }).then((r) => r.data)

export const createMovement = (data: {
  warehouse_id: string
  part_id: string
  movement_type: 'inbound' | 'outbound' | 'adjustment' | 'transfer_out'
  quantity: number
  unit_cost?: number
  work_order_id?: string
  counterpart_warehouse_id?: string
  reason?: string
}) =>
  api.post<InventoryMovement>('/inventory/movements', data).then((r) => r.data)

// ── Inventory: Requests ──────────────────────────────────────────────────────
export const listInventoryRequests = (params?: {
  work_order_id?: string; status?: InventoryRequestStatus; requested_by?: string
  page?: number; page_size?: number
}) =>
  api.get<Paginated<InventoryRequest>>('/inventory/requests', { params }).then((r) => r.data)

export const createInventoryRequest = (data: {
  work_order_id: string
  part_id: string
  quantity: number
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  notes?: string
}) =>
  api.post<InventoryRequest>('/inventory/requests', data).then((r) => r.data)

export const approveInventoryRequest = (id: string, notes?: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/approve`, { notes }).then((r) => r.data)

export const rejectInventoryRequest = (id: string, reason: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/reject`, { reason }).then((r) => r.data)

export const pickInventoryRequest = (id: string, warehouse_id: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/pick`, { warehouse_id }).then((r) => r.data)

export const deliverInventoryRequest = (id: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/deliver`).then((r) => r.data)

export const useInventoryRequest = (id: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/use`).then((r) => r.data)

export const returnInventoryRequest = (id: string) =>
  api.post<InventoryRequest>(`/inventory/requests/${id}/return`).then((r) => r.data)

// ── Workshop: Bays ───────────────────────────────────────────────────────────
export const listBays = (only_active = true) =>
  api.get<ServiceBay[]>('/workshop/bays', { params: { only_active } }).then((r) => r.data)

export const createBay = (data: { code: string; name: string; branch_id?: string }) =>
  api.post<ServiceBay>('/workshop/bays', data).then((r) => r.data)

// ── Workshop: Lines ──────────────────────────────────────────────────────────
export const listLines = (work_order_id: string) =>
  api.get<WorkOrderLine[]>(`/workshop/work-orders/${work_order_id}/lines`).then((r) => r.data)

export const createLine = (work_order_id: string, data: {
  service_id: string
  bay_id?: string
  mechanic_id?: string
  standard_duration_hrs?: number
  notes?: string
}) =>
  api.post<WorkOrderLine>(`/workshop/work-orders/${work_order_id}/lines`, data).then((r) => r.data)

export const updateLine = (line_id: string, data: { bay_id?: string; mechanic_id?: string; notes?: string }) =>
  api.put<WorkOrderLine>(`/workshop/lines/${line_id}`, data).then((r) => r.data)

export const startLine = (line_id: string) =>
  api.post<WorkOrderLine>(`/workshop/lines/${line_id}/start`).then((r) => r.data)

export const pauseLine = (line_id: string) =>
  api.post<WorkOrderLine>(`/workshop/lines/${line_id}/pause`).then((r) => r.data)

export const resumeLine = (line_id: string) =>
  api.post<WorkOrderLine>(`/workshop/lines/${line_id}/resume`).then((r) => r.data)

export const finishLine = (line_id: string) =>
  api.post<WorkOrderLine>(`/workshop/lines/${line_id}/finish`).then((r) => r.data)

// ── Workshop: Evidence ───────────────────────────────────────────────────────
export const listEvidence = (work_order_id: string) =>
  api.get<Evidence[]>(`/workshop/work-orders/${work_order_id}/evidence`).then((r) => r.data)

export const uploadEvidence = (
  work_order_id: string,
  file: File,
  meta: { kind?: string; stage?: string; note?: string; work_order_line_id?: string } = {},
) => {
  const fd = new FormData()
  fd.append('file', file)
  if (meta.kind) fd.append('kind', meta.kind)
  if (meta.stage) fd.append('stage', meta.stage)
  if (meta.note) fd.append('note', meta.note)
  if (meta.work_order_line_id) fd.append('work_order_line_id', meta.work_order_line_id)
  return api
    .post<Evidence>(`/workshop/work-orders/${work_order_id}/evidence`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: string
  branch_id: string | null
  user_id: string | null
  user_email: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export const listAuditLogs = (params?: {
  branch_id?: string; table_name?: string; record_id?: string
  user_id?: string; action?: string; page?: number; page_size?: number
}) =>
  api.get<Paginated<AuditLogEntry>>('/audit/logs', { params }).then((r) => r.data)
