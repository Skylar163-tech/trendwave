import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  isIntegrationReady,
  type IntegrationConfig,
  type IntegrationMode,
} from '../types/integration'
import { useAppConfig } from './AppConfigContext'
import type { ModelAccessMode } from '../config/types'

function modelModeToIntegration(mode: ModelAccessMode): IntegrationMode {
  if (mode === 'mock') return 'mock'
  // proxy/direct 均映射为 llm；扣子 workflow 仅作可选连通测试，不驱动主路径
  return 'llm'
}

function integrationFromApp(model: {
  mode: ModelAccessMode
  baseUrl: string
  modelName: string
  apiKey: string
  workflowUrl: string
  workflowId: string
  workflowInputKey: string
}): IntegrationConfig {
  return {
    mode: modelModeToIntegration(model.mode),
    workflowUrl: model.workflowUrl,
    workflowId: model.workflowId,
    workflowInputKey: model.workflowInputKey,
    llmBaseUrl: model.baseUrl,
    llmModel: model.modelName,
    apiKey: model.apiKey,
  }
}

interface IntegrationContextValue {
  config: IntegrationConfig
  isReady: boolean
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  saveConfig: (next: IntegrationConfig) => void
  clearAll: () => void
}

const IntegrationContext = createContext<IntegrationContextValue | null>(null)

/**
 * 与后台「模型接入」共用 AppConfig.model，避免两套存储。
 */
export function IntegrationProvider({ children }: { children: ReactNode }) {
  const { config: appConfig, setDraft, persist } = useAppConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<IntegrationConfig>(() =>
    integrationFromApp(appConfig.model),
  )

  useEffect(() => {
    setConfig(integrationFromApp(appConfig.model))
  }, [appConfig.model])

  const saveConfig = useCallback(
    (next: IntegrationConfig) => {
      setConfig(next)
      // mock / workflow：不改写运营后台的 model.mode（主路径只认 AppConfig）
      // llm：写入 URL/模型，并在仍为 mock 时切到 direct 便于试跑
      let mode = appConfig.model.mode
      if (next.mode === 'llm') {
        mode =
          appConfig.model.mode === 'mock'
            ? 'direct'
            : appConfig.model.mode === 'proxy'
              ? 'proxy'
              : 'direct'
      }

      const merged = {
        ...appConfig,
        model: {
          ...appConfig.model,
          mode,
          baseUrl: next.llmBaseUrl || appConfig.model.baseUrl,
          modelName: next.llmModel || appConfig.model.modelName,
          apiKey: next.apiKey,
          workflowUrl: next.workflowUrl,
          workflowId: next.workflowId,
          workflowInputKey: next.workflowInputKey,
        },
      }
      setDraft(merged)
      void persist(merged)
    },
    [appConfig, setDraft, persist],
  )

  const clearAll = useCallback(() => {
    const cleared: IntegrationConfig = {
      ...integrationFromApp(appConfig.model),
      apiKey: '',
      mode: 'mock',
    }
    saveConfig(cleared)
  }, [appConfig.model, saveConfig])

  const value = useMemo<IntegrationContextValue>(
    () => ({
      config,
      isReady: isIntegrationReady(config),
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      saveConfig,
      clearAll,
    }),
    [config, settingsOpen, saveConfig, clearAll],
  )

  return (
    <IntegrationContext.Provider value={value}>
      {children}
    </IntegrationContext.Provider>
  )
}

export function useIntegration() {
  const ctx = useContext(IntegrationContext)
  if (!ctx) {
    throw new Error('useIntegration must be used within IntegrationProvider')
  }
  return ctx
}
