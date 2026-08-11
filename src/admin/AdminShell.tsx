import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppConfig } from '../context/AppConfigContext'
import {
  ADMIN_NAV,
  useAdminSections,
  type AdminPageId,
} from './routing'
import { SourceBadge } from './shared'
import {
  exportConfigFile,
  importConfigFile,
} from '../config/store'
import { DEFAULT_APP_CONFIG } from '../config/defaults'
import { cloneConfig } from '../config/store'
import type { AppConfig } from '../config/types'

interface AdminShellProps {
  page: AdminPageId
  onNavigate: (page: AdminPageId) => void
  onBackWorkbench: () => void
  children: ReactNode
  /** 当前页草稿（与全局 config 同步由页面维护） */
  draft: AppConfig
  onDraftChange: (next: AppConfig) => void
  sectionResetters?: Partial<Record<string, () => void>>
}

export function AdminShell({
  page,
  onNavigate,
  onBackWorkbench,
  children,
  draft,
  onDraftChange,
  sectionResetters,
}: AdminShellProps) {
  const { config: saved, source, persist, dirty: _globalDirty, markSaved, reload } =
    useAppConfig()
  const sections = useAdminSections(page)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setImportError(null)
    try {
      const result = await persist(draft)
      if (!result.ok) {
        showToast(`保存失败：${result.error}`)
        return
      }
      showToast(`保存成功 · ${result.message}`)
    } finally {
      setSaving(false)
    }
  }, [draft, persist, showToast])

  // Ctrl/Cmd + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) void handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, handleSave])

  // 离开拦截
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const tryLeave = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action()
        return
      }
      if (window.confirm('有未保存的改动，确定离开？未保存内容将丢失。')) {
        onDraftChange(cloneConfig(saved))
        action()
      }
    },
    [dirty, onDraftChange, saved],
  )

  const handleImport = async (file: File) => {
    setImportError(null)
    const result = await importConfigFile(file)
    if (!result.ok) {
      setImportError(result.error)
      showToast(`导入失败：${result.error}`)
      return
    }
    onDraftChange(result.config)
    showToast('导入成功（尚未保存，请检查后点击保存）')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="panel sticky top-0 z-30 flex h-14 items-center justify-between border-b border-surface-200/80 px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">
            后
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold text-surface-900">
              TrendWave 运营后台
            </div>
            <div className="text-[11px] text-surface-700/65">
              与工作台共用配置与配色
            </div>
          </div>
          <SourceBadge source={source} />
          {dirty && (
            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              有未保存改动
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => tryLeave(onBackWorkbench)}
          className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-semibold text-surface-800 hover:border-brand-400"
        >
          返回工作台
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-surface-200/80 bg-white/50 p-3">
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-surface-700/45">
              本页区块
            </div>
            <nav className="space-y-0.5">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="block rounded-lg px-2.5 py-1.5 text-[13px] text-surface-800 hover:bg-brand-50 hover:text-brand-700"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-surface-700/45">
              其它页面
            </div>
            <nav className="space-y-0.5">
              {ADMIN_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    tryLeave(() => {
                      onNavigate(item.id)
                    })
                  }
                  className={[
                    'flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition',
                    item.id === page
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-surface-800 hover:bg-brand-50',
                  ].join(' ')}
                >
                  <span className="text-[13px] font-semibold">{item.title}</span>
                  <span
                    className={[
                      'text-[11px]',
                      item.id === page
                        ? 'text-white/80'
                        : 'text-surface-700/55',
                    ].join(' ')}
                  >
                    {item.desc}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5 pb-28">
          <div className="mx-auto flex max-w-5xl flex-col gap-5">{children}</div>
        </main>
      </div>

      <footer className="panel fixed bottom-0 left-0 right-0 z-40 border-t border-surface-200/80 px-5 py-3 shadow-[0_-4px_20px_rgba(26,30,39,0.06)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-surface-700/70">
            {dirty ? (
              <span className="font-semibold text-rose-600">
                已修改尚未保存 · Ctrl+S 可快速保存
              </span>
            ) : (
              <span>配置已与当前来源同步</span>
            )}
            {importError && (
              <span className="ml-2 text-rose-600">导入错误：{importError}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleImport(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => exportConfigFile(draft)}
            >
              导出配置
            </button>
            <button
              type="button"
              className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => fileRef.current?.click()}
            >
              导入配置
            </button>
            <button
              type="button"
              className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => {
                if (
                  window.confirm(
                    '将当前页相关区块恢复为内置默认？未保存前可继续编辑。',
                  )
                ) {
                  // 页面可提供更细的 reset；此处做整页安全回退提示
                  const first = Object.values(sectionResetters ?? {})[0]
                  if (first) first()
                  else {
                    void reload()
                    onDraftChange(cloneConfig(DEFAULT_APP_CONFIG))
                    markSaved(cloneConfig(DEFAULT_APP_CONFIG), 'default')
                  }
                }
              }}
            >
              恢复默认
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? '保存中…' : dirty ? '保存改动' : '已保存'}
            </button>
          </div>
        </div>
      </footer>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-surface-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
