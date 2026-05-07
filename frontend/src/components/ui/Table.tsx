import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

export type TableAlign = 'left' | 'right' | 'center'

export interface TableColumn<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  align?: TableAlign
  sortable?: boolean
  width?: string
}

export interface TablePagination {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  loading?: boolean
  emptyMessage?: string
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  pagination?: TablePagination
  density?: 'compact' | 'comfortable'
  className?: string
}

const ALIGN_CLASSES: Record<TableAlign, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function Table<T>({
  columns,
  rows,
  loading,
  emptyMessage = 'No hay registros para mostrar.',
  keyExtractor,
  onRowClick,
  pagination,
  density = 'comfortable',
  className,
}: TableProps<T>) {
  const cellPadY = density === 'compact' ? '8px' : '12px'
  const cellPadX = '16px'

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / Math.max(1, pagination.pageSize)))
    : 1
  const currentPage = pagination?.page ?? 1
  const fromIdx = pagination ? (currentPage - 1) * pagination.pageSize + 1 : 0
  const toIdx = pagination
    ? Math.min(pagination.total, currentPage * pagination.pageSize)
    : 0

  const renderBody = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, r) => (
        <tr key={`skeleton-${r}`}>
          {columns.map((col) => (
            <td
              key={col.key}
              style={{ padding: `${cellPadY} ${cellPadX}` }}
            >
              <div
                className="animate-pulse rounded-md"
                style={{
                  height: '14px',
                  background: 'color-mix(in srgb, var(--surface-3) 70%, transparent)',
                }}
              />
            </td>
          ))}
        </tr>
      ))
    }

    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length} style={{ padding: 0 }}>
            <EmptyState
              icon={<Inbox size={28} />}
              title="Sin resultados"
              description={emptyMessage}
            />
          </td>
        </tr>
      )
    }

    return rows.map((row, idx) => (
      <tr
        key={keyExtractor(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={clsx(
          'transition-colors',
          onRowClick && 'cursor-pointer'
        )}
        style={{
          background:
            idx % 2 === 1
              ? 'color-mix(in srgb, var(--surface-2) 35%, transparent)'
              : 'transparent',
          borderBottom: '1px solid var(--border-dim)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 6%, transparent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            idx % 2 === 1
              ? 'color-mix(in srgb, var(--surface-2) 35%, transparent)'
              : 'transparent'
        }}
      >
        {columns.map((col) => {
          const align: TableAlign = col.align ?? 'left'
          const value = col.render
            ? col.render(row)
            : ((row as Record<string, unknown>)[col.key] as ReactNode)
          return (
            <td
              key={col.key}
              className={ALIGN_CLASSES[align]}
              style={{
                padding: `${cellPadY} ${cellPadX}`,
                color: 'var(--text)',
                fontSize: '0.875rem',
              }}
            >
              {value as ReactNode}
            </td>
          )
        })}
      </tr>
    ))
  }

  return (
    <div
      className={clsx('flex flex-col overflow-hidden', className)}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'color-mix(in srgb, var(--surface-2) 95%, transparent)',
            }}
          >
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map((col) => {
                const align: TableAlign = col.align ?? 'left'
                return (
                  <th
                    key={col.key}
                    className={ALIGN_CLASSES[align]}
                    style={{
                      padding: '12px 16px',
                      color: 'var(--text-muted)',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      width: col.width,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>{renderBody()}</tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--surface-2) 50%, transparent)',
          }}
        >
          <span
            className="text-xs"
            style={{
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {fromIdx}–{toIdx} de {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => pagination.onChange(currentPage - 1)}
              className={clsx(
                'inline-flex items-center justify-center rounded-lg p-1.5 transition-colors',
                currentPage <= 1 && 'cursor-not-allowed opacity-40'
              )}
              style={{
                color: 'var(--text)',
                border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span
              className="px-3 text-xs font-bold"
              style={{ color: 'var(--text)', letterSpacing: '0.04em' }}
            >
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => pagination.onChange(currentPage + 1)}
              className={clsx(
                'inline-flex items-center justify-center rounded-lg p-1.5 transition-colors',
                currentPage >= totalPages && 'cursor-not-allowed opacity-40'
              )}
              style={{
                color: 'var(--text)',
                border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
