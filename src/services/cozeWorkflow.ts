import type { IntegrationConfig } from '../types/integration'
import type { NewsItem, Product } from '../types/workflow'

/** 开发态经 Vite 代理到 https://api.coze.cn，避免浏览器 CORS */
export const COZE_PROXY_RUN_URL = '/coze-api/v1/workflow/run'
export const COZE_DEFAULT_API_HOST = 'https://api.coze.cn'

export interface CozeRunResult {
  texts: string[]
  raw: unknown
  debugUrl?: string
}

/** 从编排页链接中提取 workflow_id */
export function extractWorkflowId(input: string): string {
  const value = input.trim()
  if (!value) return ''

  try {
    const url = new URL(value)
    const fromQuery =
      url.searchParams.get('workflow_id') ?? url.searchParams.get('workflow')
    if (fromQuery) return fromQuery
  } catch {
    // 非 URL，继续按纯 ID 处理
  }

  const match = value.match(/workflow_id=(\d+)/i) ?? value.match(/^(\d{10,})$/)
  return match?.[1] ?? ''
}

export function isCozeEditorPageUrl(url: string): boolean {
  return /coze\.(cn|com).*work_flow/i.test(url)
}

export function isCozeApiUrl(url: string): boolean {
  return /api\.coze\.(cn|com).*\/v1\/workflow\/(run|stream_run)/i.test(url)
}

/**
 * 解析最终请求地址：
 * - 编排页链接 → 走本地代理 API
 * - api.coze.cn 直连 → 改写为代理路径（开发态防 CORS）
 * - 自定义 Webhook → 原样使用
 * - 空 → 默认代理 API
 */
export function resolveWorkflowEndpoint(config: IntegrationConfig): string {
  const raw = config.workflowUrl.trim()
  if (!raw || isCozeEditorPageUrl(raw) || isCozeApiUrl(raw)) {
    return COZE_PROXY_RUN_URL
  }
  if (raw.startsWith('/')) return raw
  return raw
}

export function resolveWorkflowId(config: IntegrationConfig): string {
  return (
    config.workflowId.trim() ||
    extractWorkflowId(config.workflowUrl) ||
    ''
  )
}

export function buildWorkflowParameters(
  news: NewsItem,
  product: Product,
  inputKey = 'input',
): Record<string, string> {
  const combined = [
    `热点标题：${news.title}`,
    `热点摘要：${news.summary}`,
    `标签：${news.tags.join('、')}`,
    `商品品牌：${product.brand}`,
    `商品名称：${product.name}`,
    `价格：¥${product.price}`,
    `卖点：${product.sellingPoints.join('、')}`,
    '',
    '请生成 3 条高传播力微博营销文案（纯文本，含#话题、Emoji、互动引导），以 JSON 字符串数组输出。',
  ].join('\n')

  return {
    [inputKey]: combined,
    // 兼容常见开始节点变量名
    BOT_USER_INPUT: combined,
    query: combined,
    news_title: news.title,
    news_summary: news.summary,
    news_tags: news.tags.join(','),
    product_name: product.name,
    product_brand: product.brand,
    product_price: String(product.price),
    product_selling_points: product.sellingPoints.join('；'),
  }
}

export interface CozeInvokeResult {
  payload: unknown
  debugUrl?: string
}

/** 底层调用扣子 /v1/workflow/run */
export async function invokeCozeRun(
  config: IntegrationConfig,
  parameters: Record<string, string>,
): Promise<CozeInvokeResult> {
  const workflowId = resolveWorkflowId(config)
  if (!workflowId) {
    throw new Error(
      '缺少 workflow_id。请粘贴扣子编排页链接，或单独填写工作流 ID',
    )
  }
  if (!config.apiKey.trim()) {
    throw new Error('缺少扣子个人访问令牌（通常以 pat_ 开头）')
  }

  const endpoint = resolveWorkflowEndpoint(config)
  const body = {
    workflow_id: workflowId,
    parameters,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const payload: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const msg = readCozeMessage(payload) || `HTTP ${res.status}`
    throw new Error(`扣子工作流请求失败：${msg}`)
  }

  if (payload && typeof payload === 'object' && 'code' in payload) {
    const code = Number((payload as { code: unknown }).code)
    if (code !== 0) {
      throw new Error(
        `扣子返回错误 code=${code}：${readCozeMessage(payload) || '未知错误'}`,
      )
    }
  }

  const debugUrl =
    payload && typeof payload === 'object' && 'debug_url' in payload
      ? String((payload as { debug_url: unknown }).debug_url ?? '')
      : undefined

  return { payload, debugUrl: debugUrl || undefined }
}

export async function runCozeWorkflow(
  news: NewsItem,
  product: Product,
  config: IntegrationConfig,
): Promise<CozeRunResult> {
  const inputKey = config.workflowInputKey.trim() || 'input'
  const { payload, debugUrl } = await invokeCozeRun(
    config,
    buildWorkflowParameters(news, product, inputKey),
  )

  const texts = extractCozeTexts(payload)
  if (texts.length === 0) {
    throw new Error(
      '扣子已响应，但未能解析出文案。请确认结束节点输出字段（如 output）含文本，或开始节点变量名与「输入变量名」一致',
    )
  }

  return { texts, raw: payload, debugUrl }
}

export function readCozeMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  if (typeof obj.msg === 'string') return obj.msg
  if (typeof obj.message === 'string') return obj.message
  return ''
}

/** 解析 JSON / 代码块；供全流程解析复用 */
export function tryParseJson(text: string): unknown | null {
  return tryParse(text)
}

/** 剥开扣子响应外壳，尽量拿到业务 data / output */
export function unwrapCozeData(payload: unknown): unknown {
  let current = payload
  for (let i = 0; i < 6; i++) {
    if (current == null) return null
    if (typeof current === 'string') {
      const parsed = tryParse(current)
      if (parsed == null) return current
      current = parsed
      continue
    }
    if (typeof current !== 'object' || Array.isArray(current)) return current
    const obj = current as Record<string, unknown>
    if ('data' in obj && obj.data != null && obj.data !== '') {
      current = obj.data
      continue
    }
    if ('output' in obj && obj.output != null && obj.output !== '') {
      current = obj.output
      continue
    }
    return current
  }
  return current
}

export function extractCozeTexts(payload: unknown): string[] {
  if (payload == null) return []

  if (typeof payload === 'string') {
    const parsed = tryParse(payload)
    return parsed != null ? extractCozeTexts(parsed) : payload.trim() ? [payload] : []
  }

  if (Array.isArray(payload)) {
    return payload
      .flatMap((item) => extractCozeTexts(item))
      .map((t) => t.trim())
      .filter(Boolean)
  }

  if (typeof payload !== 'object') return []

  const obj = payload as Record<string, unknown>

  // 官方同步响应：data 常为 JSON 字符串，如 {"output":"..."}
  if ('data' in obj) {
    const fromData = extractCozeTexts(obj.data)
    if (fromData.length) return fromData
  }

  const preferredKeys = [
    'output',
    'outputs',
    'text',
    'content',
    'result',
    'copies',
    'variants',
    'weibo',
    'copy',
  ]
  for (const key of preferredKeys) {
    if (key in obj) {
      const found = extractCozeTexts(obj[key])
      if (found.length) return found
    }
  }

  // 兜底：对象里所有字符串字段
  const collected: string[] = []
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.trim().length > 20) {
      const nested = tryParse(value)
      if (nested != null) {
        collected.push(...extractCozeTexts(nested))
      } else if (!looksLikeUrl(value)) {
        collected.push(value.trim())
      }
    }
  }
  return collected
}

function tryParse(text: string): unknown | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}
