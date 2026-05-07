import { type ChangeEvent, type CSSProperties } from 'react'
import { clsx } from 'clsx'

type FieldType = 'text' | 'email' | 'password' | 'number' | 'date' | 'textarea' | 'select'

export interface SelectOption {
  value: string
  label: string
}

export interface FormFieldProps {
  label: string
  name: string
  type?: FieldType
  value: string | number
  onChange: (value: string) => void
  options?: SelectOption[]
  error?: string
  helper?: string
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  rows?: number
  autoComplete?: string
  className?: string
}

export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  options,
  error,
  helper,
  required,
  placeholder,
  min,
  max,
  step,
  disabled,
  rows = 4,
  autoComplete,
  className,
}: FormFieldProps) {
  const baseInputStyle: CSSProperties = {
    width: '100%',
    borderRadius: '12px',
    border: `1px solid ${error ? 'color-mix(in srgb, var(--danger) 60%, var(--border))' : 'var(--border)'}`,
    background: 'color-mix(in srgb, var(--surface-2) 92%, transparent)',
    color: 'var(--text)',
    padding: '0.7rem 0.85rem',
    fontSize: '0.92rem',
    outline: 'none',
    transition:
      'border-color var(--duration-fast) var(--ease-premium), box-shadow var(--duration-fast) var(--ease-premium)',
    opacity: disabled ? 0.6 : 1,
  }

  const handle = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => onChange(e.target.value)

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (error) return
    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 42%, var(--border))'
    e.currentTarget.style.boxShadow = '0 0 0 4px color-mix(in srgb, var(--primary) 14%, transparent)'
  }

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = error
      ? 'color-mix(in srgb, var(--danger) 60%, var(--border))'
      : 'var(--border)'
    e.currentTarget.style.boxShadow = 'none'
  }

  const fieldId = `field-${name}`

  let control: React.ReactNode
  if (type === 'textarea') {
    control = (
      <textarea
        id={fieldId}
        name={name}
        value={value}
        onChange={handle}
        onFocus={handleFocus}
        onBlur={handleBlur}
        rows={rows}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...baseInputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
    )
  } else if (type === 'select') {
    control = (
      <select
        id={fieldId}
        name={name}
        value={value}
        onChange={handle}
        onFocus={handleFocus}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        style={baseInputStyle}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  } else {
    control = (
      <input
        id={fieldId}
        name={name}
        type={type}
        value={value}
        onChange={handle}
        onFocus={handleFocus}
        onBlur={handleBlur}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        autoComplete={autoComplete}
        style={baseInputStyle}
      />
    )
  }

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={fieldId}
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>
        )}
      </label>
      {control}
      {error ? (
        <p
          className="text-xs"
          style={{
            color: 'var(--danger)',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {helper}
        </p>
      ) : null}
    </div>
  )
}
