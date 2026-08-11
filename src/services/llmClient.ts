import type { ModelAccessMode, ModelConfig } from '../config/types'

export type FriendlyLlmErrorCode =
  | 'invalid_key'
  | 'insufficient_quota'
  | 'model_not_found'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'server'
  | 'unknown'

export class FriendlyLlmError extends Error {
  code: FriendlyLlmErrorCode
  constructor(code: FriendlyLlmErrorCode, message: string) {
    super(message)
    this.name = 'FriendlyLlmError'
    this.code = code
  }
}

export function mapLlmError(status: number, bodyText: string): FriendlyLlmError {
  const lower = bodyText.toLowerCase()
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('invalid_api_key') ||
    lower.includes('incorrect api key') ||
    lower.includes('authentication') ||
    lower.includes('unauthorized')
  ) {
    return new FriendlyLlmError('invalid_key', '密钥无效，请检查 API Key 是否正确')
  }
  if (
    status === 402 ||
    lower.includes('insufficient_quota') ||
    lower.includes('exceeded') ||
    lower.includes('balance') ||
    lower.includes('billing')
  ) {
    return new FriendlyLlmError('insufficient_quota', '余额不足或配额已用尽')
  }
  if (
    status === 404 ||
    lower.includes('model_not_found') ||
    lower.includes('does not exist') ||
    lower.includes('invalid model') ||
    lower.includes('unknown model')
  ) {
    return new FriendlyLlmError('model_not_found', '模型名不存在，请核对模型名称')
  }
  if (status === 429 || lower.includes('rate') || lower.includes('too many')) {
    return new FriendlyLlmError('rate_limited', '请求被限流，请稍后再试')
  }
  if (status >= 500) {
    return new FriendlyLlmError('server', '服务商接口暂时不可用，请稍后重试')
  }
  return new FriendlyLlmError(
    'unknown',
    `调用失败（HTTP ${status}），请检查配置后重试`,
  )
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmCallResult {
  content: string
  model: string
  mode: ModelAccessMode
  latencyMs: number
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  mocked?: boolean
}

function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/$/, '')
  if (b.endsWith('/chat/completions')) return b
  if (b.endsWith('/v1')) return `${b}/chat/completions`
  return `${b}/chat/completions`
}

async function callDirectOrProxy(
  config: ModelConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; viaProxy?: boolean },
): Promise<LlmCallResult> {
  const started = performance.now()
  const temperature = opts.temperature ?? config.temperature
  const body = {
    model: config.modelName,
    temperature,
    stream: false,
    messages,
  }

  let res: Response
  try {
    if (opts.viaProxy) {
      res = await fetch('/api/llm/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          ...body,
        }),
      })
    } else {
      res = await fetch(chatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })
    }
  } catch {
    throw new FriendlyLlmError('network', '网络异常，无法连接到模型服务')
  }

  const rawText = await res.text()
  if (!res.ok) {
    throw mapLlmError(res.status, rawText)
  }

  let data: {
    model?: string
    choices?: Array<{ message?: { content?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
  try {
    data = JSON.parse(rawText) as typeof data
  } catch {
    throw new FriendlyLlmError('unknown', '模型返回无法解析')
  }

  const content = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!content) {
    throw new FriendlyLlmError('unknown', '模型返回内容为空')
  }

  return {
    content,
    model: data.model || config.modelName,
    mode: opts.viaProxy ? 'proxy' : 'direct',
    latencyMs: Math.round(performance.now() - started),
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    },
  }
}

export async function callChatModel(
  config: ModelConfig,
  messages: ChatMessage[],
  opts?: { temperature?: number },
): Promise<LlmCallResult> {
  if (config.mode === 'mock') {
    const started = performance.now()
    await new Promise((r) => setTimeout(r, 600))
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const snippet = (lastUser?.content ?? '').slice(0, 40)
    return {
      content: `【模拟输出】这是本地模拟文案，不代表真实模型效果。围绕「${snippet}…」生成的示意内容：热点借势种草，卖点清晰，活动价原样引用，欢迎评论区聊聊你的看法 💬`,
      model: config.modelName || 'mock-model',
      mode: 'mock',
      latencyMs: Math.round(performance.now() - started),
      usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      mocked: true,
    }
  }

  if (!config.apiKey.trim() && config.mode === 'direct') {
    throw new FriendlyLlmError('invalid_key', '密钥无效：尚未填写 API Key')
  }
  if (!config.baseUrl.trim() || !config.modelName.trim()) {
    throw new FriendlyLlmError('model_not_found', '请先填写接口地址与模型名')
  }

  if (config.mode === 'proxy') {
    return callDirectOrProxy(config, messages, {
      temperature: opts?.temperature,
      viaProxy: true,
    })
  }

  return callDirectOrProxy(config, messages, {
    temperature: opts?.temperature,
    viaProxy: false,
  })
}

/** 最小连通性测试 */
export async function testModelConnection(
  config: ModelConfig,
): Promise<LlmCallResult> {
  return callChatModel(
    config,
    [
      { role: 'system', content: '你是连通性测试助手。' },
      { role: 'user', content: '请只回复：ok' },
    ],
    { temperature: 0 },
  )
}

export function accessModeLabel(mode: ModelAccessMode): string {
  switch (mode) {
    case 'mock':
      return '本地模拟'
    case 'proxy':
      return '本地服务中转'
    case 'direct':
      return '浏览器直连'
  }
}
