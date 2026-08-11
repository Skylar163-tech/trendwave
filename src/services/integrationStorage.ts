import {
  DEFAULT_INTEGRATION_CONFIG,
  type IntegrationConfig,
} from '../types/integration'

const STORAGE_KEY = 'trendwave.integration.v1'

export function loadIntegrationConfig(): IntegrationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_INTEGRATION_CONFIG }
    const parsed = JSON.parse(raw) as Partial<IntegrationConfig>
    return {
      ...DEFAULT_INTEGRATION_CONFIG,
      ...parsed,
      workflowInputKey:
        typeof parsed.workflowInputKey === 'string' && parsed.workflowInputKey
          ? parsed.workflowInputKey
          : DEFAULT_INTEGRATION_CONFIG.workflowInputKey,
      // 确保敏感字段始终是字符串
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    }
  } catch {
    return { ...DEFAULT_INTEGRATION_CONFIG }
  }
}

export function saveIntegrationConfig(config: IntegrationConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearIntegrationSecrets(): void {
  const current = loadIntegrationConfig()
  saveIntegrationConfig({
    ...current,
    apiKey: '',
  })
}

export function wipeIntegrationConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}
