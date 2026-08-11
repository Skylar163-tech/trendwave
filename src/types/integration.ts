export type IntegrationMode = 'mock' | 'workflow' | 'llm'

export interface IntegrationConfig {
  mode: IntegrationMode
  /**
   * 可填：
   * - 扣子编排页链接（含 workflow_id，会自动解析）
   * - 或 API 地址（默认走本地 /coze-api 代理）
   */
  workflowUrl: string
  /** 工作流 ID；可从编排页链接自动提取 */
  workflowId: string
  /** 扣子开始节点输入变量名，默认 input */
  workflowInputKey: string
  /** LLM 兼容接口 Base URL（暂不使用可留空） */
  llmBaseUrl: string
  /** 模型名（暂不使用可留空） */
  llmModel: string
  /** 扣子个人访问令牌（pat_...）或 LLM Key — 仅存本机 */
  apiKey: string
}

export const DEFAULT_INTEGRATION_CONFIG: IntegrationConfig = {
  mode: 'mock',
  workflowUrl: '',
  workflowId: '',
  workflowInputKey: 'input',
  llmBaseUrl: '',
  llmModel: '',
  apiKey: '',
}

export function isIntegrationReady(config: IntegrationConfig): boolean {
  if (config.mode === 'mock') return true
  if (!config.apiKey.trim()) return false
  if (config.mode === 'workflow') {
    const hasId =
      Boolean(config.workflowId.trim()) ||
      /workflow_id=\d+/i.test(config.workflowUrl) ||
      /^\d{10,}$/.test(config.workflowUrl.trim())
    return hasId
  }
  if (config.mode === 'llm') {
    return Boolean(config.llmBaseUrl.trim() && config.llmModel.trim())
  }
  return false
}

export function maskSecret(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}
