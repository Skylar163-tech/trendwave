import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_APP_CONFIG } from '../config/defaults'
import {
  cloneConfig,
  loadConfigTiered,
  saveConfigTiered,
  sourceLabel,
  type SaveResult,
} from '../config/store'
import type { AppConfig, ConfigSource } from '../config/types'

interface AppConfigContextValue {
  config: AppConfig
  source: ConfigSource
  sourceLabel: string
  loading: boolean
  reload: () => Promise<void>
  /** 用完整配置替换内存态（未落盘） */
  setDraft: (next: AppConfig) => void
  /** 落盘（三级保存） */
  persist: (next?: AppConfig) => Promise<SaveResult>
  /** 与当前已保存快照对比 */
  dirty: boolean
  markSaved: (cfg: AppConfig, source: ConfigSource) => void
}

const AppConfigContext = createContext<AppConfigContextValue | null>(null)

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() =>
    cloneConfig(DEFAULT_APP_CONFIG),
  )
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(DEFAULT_APP_CONFIG),
  )
  const [source, setSource] = useState<ConfigSource>('default')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const loaded = await loadConfigTiered()
      setConfig(loaded.config)
      setSavedSnapshot(JSON.stringify(loaded.config))
      setSource(loaded.source)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const setDraft = useCallback((next: AppConfig) => {
    setConfig(cloneConfig(next))
  }, [])

  const markSaved = useCallback((cfg: AppConfig, src: ConfigSource) => {
    setConfig(cloneConfig(cfg))
    setSavedSnapshot(JSON.stringify(cfg))
    setSource(src)
  }, [])

  const persist = useCallback(
    async (next?: AppConfig): Promise<SaveResult> => {
      const payload = next ?? config
      const result = await saveConfigTiered(payload)
      if (result.ok) {
        markSaved(payload, result.source)
      }
      return result
    },
    [config, markSaved],
  )

  const dirty = useMemo(
    () => JSON.stringify(config) !== savedSnapshot,
    [config, savedSnapshot],
  )

  const value = useMemo<AppConfigContextValue>(
    () => ({
      config,
      source,
      sourceLabel: sourceLabel(source),
      loading,
      reload,
      setDraft,
      persist,
      dirty,
      markSaved,
    }),
    [
      config,
      source,
      loading,
      reload,
      setDraft,
      persist,
      dirty,
      markSaved,
    ],
  )

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext)
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider')
  return ctx
}
