// ── Auth ────────────────────────────────────────────────────────────────────
export type Role =
  | 'admin'
  | 'director'
  | 'gerente_sede'
  | 'jefe_taller'
  | 'recepcion'
  | 'mecanico'
  | 'almacen'
  | 'cliente_corp'
  | 'operador'
  | 'viewer'

export const GLOBAL_ROLES: Role[] = ['admin', 'director', 'viewer', 'cliente_corp']

export interface LoginPayload { email: string; password: string }
export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserMe
}
export interface UserMe {
  id: string
  email: string
  role: Role
  active: boolean
  default_branch_id?: string | null
}
export interface UserRead {
  id: string
  email: string
  role: Role
  active: boolean
  created_at: string
  default_branch_id?: string | null
}

// ── Branches ─────────────────────────────────────────────────────────────────
export interface Branch {
  id: string
  organization_id: string
  code: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  timezone: string
  phone: string | null
  active: boolean
}

export interface BranchSwitchResponse {
  branch_id: string
  branch_code: string
  branch_name: string
}

// ── Branch Stats (Mexico map) ────────────────────────────────────────────────
export type BranchMetric = 'operation' | 'revenue' | 'alerts'
export type BranchSemaphore = 'green' | 'amber' | 'red'

export interface BranchKPIs {
  open_orders: number
  in_progress: number
  finished_today: number
  active_mechanics: number
  revenue_today: number
  avg_completion_hrs: number
  stalled_parts: number
  alerts_count: number
}

export interface BranchStat {
  branch_id: string
  code: string
  name: string
  city: string | null
  state: string | null
  lat: number
  lng: number
  kpis: BranchKPIs
  semaphore: BranchSemaphore
  pulse: boolean
}

// ── Inventory ────────────────────────────────────────────────────────────────
export interface Warehouse {
  id: string
  branch_id: string
  code: string
  name: string
  kind: 'main' | 'satellite' | 'mobile'
  active: boolean
}

export interface Part {
  id: string
  sku: string
  name: string
  description: string | null
  category: string | null
  unit: string
  image_url: string | null
  default_supplier_id: string | null
  min_stock: number
  max_stock: number | null
  lead_time_days: number
  last_unit_cost: number | null
  active: boolean
  total_quantity?: number
  total_reserved?: number
  total_available?: number
  is_low_stock?: boolean
}

export interface StockLevel {
  id: string
  branch_id: string
  warehouse_id: string
  part_id: string
  quantity: number
  reserved: number
  available: number
}

export type InventoryRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'picked'
  | 'delivered'
  | 'used'
  | 'returned'

export interface InventoryRequest {
  id: string
  branch_id: string
  work_order_id: string
  requested_by: string | null
  part_id: string
  quantity: number
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: InventoryRequestStatus
  approved_by: string | null
  rejected_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  part_name?: string
  part_sku?: string
  requested_by_email?: string
  work_order_number?: string
}

export interface InventoryMovement {
  id: string
  branch_id: string
  warehouse_id: string
  part_id: string
  movement_type: string
  quantity: number
  unit_cost: number | null
  work_order_id: string | null
  inventory_request_id: string | null
  counterpart_warehouse_id: string | null
  performed_by: string | null
  reason: string | null
  created_at: string
}

// ── Workshop ─────────────────────────────────────────────────────────────────
export interface ServiceBay {
  id: string
  branch_id: string
  code: string
  name: string
  active: boolean
}

export type LineStatus =
  | 'pending'
  | 'in_progress'
  | 'paused'
  | 'waiting_parts'
  | 'completed'
  | 'cancelled'

export interface WorkOrderLine {
  id: string
  branch_id: string
  work_order_id: string
  service_id: string
  bay_id: string | null
  mechanic_id: string | null
  status: LineStatus
  standard_duration_hrs: number | null
  started_at: string | null
  paused_at: string | null
  finished_at: string | null
  actual_duration_minutes: number | null
  notes: string | null
  service_name?: string
  bay_name?: string
  mechanic_email?: string
}

export interface Evidence {
  id: string
  branch_id: string
  work_order_id: string
  work_order_line_id: string | null
  document_id: string | null
  kind: 'photo' | 'video' | 'document' | 'note'
  stage: string | null
  note: string | null
  captured_by: string | null
  created_at: string
  download_url: string | null
}

// ── Pagination genérica ──────────────────────────────────────────────────────
export interface Paginated<T> {
  total: number
  page: number
  page_size: number
  items: T[]
}

// ── Config ───────────────────────────────────────────────────────────────────
export interface ConfigParam {
  id: string
  key: string
  value: string
  description: string | null
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export interface VehicleModel {
  id: string
  name: string
  brand: string
  active: boolean
  service_count: number
}

export type ServiceStatus = 'proposed' | 'approved' | 'rejected'

export interface Service {
  id: string
  name: string
  category: string
  active: boolean
  status?: ServiceStatus
  proposed_by_id?: string | null
  approved_by_id?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
}

export interface CatalogCost {
  id: string
  model_id: string
  service_id: string
  bjx_labor_cost: number | null
  bjx_parts_cost: number | null
  duration_hrs: number
  is_current: boolean
  data_source: string
}

// ── Suppliers ────────────────────────────────────────────────────────────────
export interface Supplier {
  id: string
  name: string
  lead_time_days: number
  warranty_days: number
  contact_name: string | null
  contact_email: string | null
  active: boolean
  price_count: number
  model_coverage: number
  service_coverage: number
  avg_price_index: number | null
}

export interface SupplierPrice {
  id: string
  supplier_id: string
  model_id: string
  service_id: string
  ref_cost: number
  labor_cost: number
  total_price: number
  price_date: string | null
  is_current: boolean
}

// ── Engine ───────────────────────────────────────────────────────────────────
export interface CalculationResult {
  duration_hrs: number
  labor_cost: number
  parts_cost: number
  total_bjx_cost: number
  brame_price: number
  margin_pesos: number
  margin_pct: number
  suggested_price: number
  gap_vs_target: number
  margin_status: 'ok' | 'low' | 'critical'
  data_source: 'catalog' | 'estimated'
}

export interface ScoredSupplier {
  supplier_id: string
  supplier_name: string
  ref_cost: number
  labor_cost: number
  total_price: number
  price: number          // alias for total_price (used in display)
  lead_time_days: number
  warranty_days: number
  final_score: number
  score: number          // same as final_score
  rank: number
  recommended: boolean
}

export interface EngineResponse {
  input: Record<string, unknown>
  result: CalculationResult
  suppliers: ScoredSupplier[]
  recommended_supplier: ScoredSupplier | null
  scoring_weights: { price: number; time: number; tc: number }
}

// ── Quotes ───────────────────────────────────────────────────────────────────
export type QuoteStatus = 'draft' | 'confirmed' | 'invoiced' | 'cancelled'

export interface Quote {
  id: string
  quote_number: string
  model_id: string
  model_name?: string
  created_by: string
  status: QuoteStatus
  technician_cost_hr: number
  target_margin: number
  notes: string | null
  created_at: string
  lines?: QuoteLine[]
}

export interface QuoteLine {
  id: string
  service_id: string
  service_name?: string
  supplier_id: string | null
  duration_hrs: number
  labor_cost: number
  parts_cost: number
  total_bjx_cost: number
  brame_price: number
  margin_pesos: number
  margin_pct: number
  suggested_price: number
  gap_vs_target: number
  margin_status: 'ok' | 'low' | 'critical'
  data_source: string
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardSummary {
  total_services: number
  total_models: number
  total_combos: number
  avg_margin_pct: number
  critical_combos: number
  low_combos: number
  ok_combos: number
  critical_pct: number
  margin_distribution: {
    ok: { count: number; pct: number }
    low: { count: number; pct: number }
    critical: { count: number; pct: number }
  }
  config_used: { technician_cost_hr: number; target_margin: number }
  last_calculated: string
}

export interface ModelProfitability {
  model_id: string
  model_name: string
  service_count: number
  avg_bjx_cost: number
  avg_brame_price: number
  avg_margin_pct: number
  avg_margin_pesos: number
  critical_count: number
  low_count: number
  ok_count: number
  margin_status: 'ok' | 'low' | 'critical'
  worst_services: Array<{
    service_id: string
    service_name: string
    margin_pct: number
    margin_pesos: number
    margin_status: string
  }>
}

export interface SimulateRequest {
  technician_cost_hr?: number
  target_margin?: number
  brame_price_increase_pct?: number
}

export interface SimulateResponse {
  scenario: Record<string, number>
  summary: DashboardSummary
  delta_vs_current: {
    avg_margin_pct_delta: number
    critical_combos_delta: number
    ok_combos_delta: number
  }
}
