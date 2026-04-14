// ── Auth ────────────────────────────────────────────────────────────────────
export interface LoginPayload { email: string; password: string }
export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserMe
}
export interface UserMe {
  id: string
  email: string
  role: 'admin' | 'operador' | 'viewer'
  active: boolean
}
export interface UserRead {
  id: string
  email: string
  role: 'admin' | 'operador' | 'viewer'
  active: boolean
  created_at: string
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

export interface Service {
  id: string
  name: string
  category: string
  active: boolean
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
