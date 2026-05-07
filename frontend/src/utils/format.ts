// Formatting helpers — locale es-MX / MXN

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatterCache = new Map<number, Intl.NumberFormat>()

function getNumberFormatter(decimals: number): Intl.NumberFormat {
  let fmt = numberFormatterCache.get(decimals)
  if (!fmt) {
    fmt = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    numberFormatterCache.set(decimals, fmt)
  }
  return fmt
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const relativeFormatter = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })

export interface FmtCurrencyOptions {
  compact?: boolean
}

export function fmtCurrency(n: number, opts: FmtCurrencyOptions = {}): string {
  if (!Number.isFinite(n)) return '—'
  if (opts.compact) {
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
    return `${sign}$${abs.toFixed(0)}`
  }
  return currencyFormatter.format(n)
}

export interface FmtDateOptions {
  time?: boolean
  relative?: boolean
}

export function fmtDate(iso: string | null, opts: FmtDateOptions = {}): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  if (opts.relative) {
    const diffSec = Math.round((date.getTime() - Date.now()) / 1000)
    const abs = Math.abs(diffSec)
    if (abs < 60) return relativeFormatter.format(diffSec, 'second')
    if (abs < 3600) return relativeFormatter.format(Math.round(diffSec / 60), 'minute')
    if (abs < 86_400) return relativeFormatter.format(Math.round(diffSec / 3600), 'hour')
    if (abs < 2_592_000) return relativeFormatter.format(Math.round(diffSec / 86_400), 'day')
    if (abs < 31_536_000) return relativeFormatter.format(Math.round(diffSec / 2_592_000), 'month')
    return relativeFormatter.format(Math.round(diffSec / 31_536_000), 'year')
  }

  return opts.time ? dateTimeFormatter.format(date) : dateFormatter.format(date)
}

export function fmtPct(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(decimals)}%`
}

export function fmtNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—'
  return getNumberFormatter(decimals).format(n)
}

export function truncate(s: string, max = 40): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}
