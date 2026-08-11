import type { ReactNode } from 'react'
import { useAppConfig } from '../context/AppConfigContext'
import type { ConfigSource } from '../config/types'

const SOURCE_STYLES: Record<ConfigSource, string> = {
  server: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  local: 'bg-amber-100 text-amber-800 border-amber-200',
  default: 'bg-surface-100 text-surface-700 border-surface-200',
}

export function SourceBadge({ source, label }: { source?: ConfigSource; label?: string }) {
  const ctx = useAppConfig()
  const s = source ?? ctx.source
  const text = label ?? ctx.sourceLabel
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLES[s]}`}
      title="配置按 服务端 → 本机浏览器 → 内置默认 三级读取"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      数据来源 · {text}
    </span>
  )
}

export function AdminSectionCard({
  id,
  title,
  description,
  children,
  actions,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border border-surface-200/90 bg-white/85 p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-surface-900">
            {title}
          </h3>
          <p className="mt-1 text-sm text-surface-700/65">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-rose-600">{message}</p>
}

export function insertAtCursor(
  el: HTMLTextAreaElement | null,
  text: string,
  value: string,
  onChange: (next: string) => void,
) {
  if (!el) {
    onChange(value + text)
    return
  }
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const next = value.slice(0, start) + text + value.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    el.focus()
    const pos = start + text.length
    el.setSelectionRange(pos, pos)
  })
}
