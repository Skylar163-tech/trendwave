import { useEffect, useState } from 'react'
import { useAppConfig } from '../context/AppConfigContext'
import { cloneConfig } from '../config/store'
import type { AppConfig } from '../config/types'
import { AdminShell } from './AdminShell'
import type { AdminPageId } from './routing'
import { PromptsPage } from './pages/PromptsPage'
import { ModelPage } from './pages/ModelPage'
import { ProductsPage } from './pages/ProductsPage'
import { SourcesPage } from './pages/SourcesPage'
import { EvalPage } from './pages/EvalPage'

interface Props {
  page: AdminPageId
  onNavigate: (page: AdminPageId) => void
  onBackWorkbench: () => void
}

export function AdminApp({ page, onNavigate, onBackWorkbench }: Props) {
  const { config, loading } = useAppConfig()
  const [draft, setDraft] = useState<AppConfig>(() => cloneConfig(config))

  useEffect(() => {
    setDraft(cloneConfig(config))
  }, [config])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-surface-700/70">
        正在加载配置…
      </div>
    )
  }

  return (
    <AdminShell
      page={page}
      onNavigate={onNavigate}
      onBackWorkbench={onBackWorkbench}
      draft={draft}
      onDraftChange={setDraft}
    >
      {page === 'prompts' && (
        <PromptsPage draft={draft} onChange={setDraft} />
      )}
      {page === 'model' && <ModelPage draft={draft} onChange={setDraft} />}
      {page === 'products' && (
        <ProductsPage draft={draft} onChange={setDraft} />
      )}
      {page === 'sources' && (
        <SourcesPage draft={draft} onChange={setDraft} />
      )}
      {page === 'eval' && <EvalPage draft={draft} onChange={setDraft} />}
    </AdminShell>
  )
}
