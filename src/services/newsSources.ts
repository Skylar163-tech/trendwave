import { MOCK_NEWS } from '../data/mock'
import type { NewsSourceConfig } from '../config/types'
import type { NewsItem } from '../types/workflow'

export interface SourceTestResult {
  id: string
  name: string
  ok: boolean
  count: number
  latencyMs: number
  error?: string
  items?: NewsItem[]
}

function friendlyFetchError(err: unknown, status?: number): string {
  if (status === 404) return '地址不对或资源不存在（404）'
  if (status === 403 || status === 401) return '对方拒绝访问（鉴权/权限）'
  if (status === 422) return '订阅源无效或无法解析'
  if (status === 429) return '对方限流，请稍后再试'
  if (status && status >= 500) return '对方服务异常'
  const msg = err instanceof Error ? err.message : String(err)
  if (/timeout|aborted/i.test(msg)) return '请求超时'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '网络异常或地址不可达'
  if (/CORS/i.test(msg)) return '浏览器跨域限制（建议走服务端中转）'
  return msg || '未知错误'
}

/** 已接入真实拉取的内置热榜（其余仍为演示 mock） */
const LIVE_HOTBOARD = new Set(['toutiao'])

/** 内置热榜：原型演示用模拟数据（按 endpoint 过滤） */
function builtinItems(endpoint: string): NewsItem[] {
  const map: Record<string, string> = {
    weibo: '微博热搜',
    toutiao: '今日头条',
    zhihu: '知乎热榜',
    douyin: '抖音热点',
  }
  const sourceName = map[endpoint]
  if (!sourceName) return []
  const matched = MOCK_NEWS.filter((n) => n.source.includes(sourceName.slice(0, 2)) || n.source === sourceName)
  if (matched.length) return matched
  // fallback: clone mock with source renamed
  return MOCK_NEWS.slice(0, 3).map((n, i) => ({
    ...n,
    id: `${endpoint}-${n.id}-${i}`,
    source: sourceName,
  }))
}

function mapRemoteItems(
  items: Array<Record<string, unknown>>,
  idPrefix: string,
): NewsItem[] {
  return items.slice(0, 20).map((it, i) => ({
    id: `${idPrefix}-${Date.now()}-${i}`,
    title: String(it.title ?? '无标题'),
    source: String(it.source ?? '资讯'),
    heat: Number(it.heat ?? 500 - i * 10),
    category: String(it.category ?? '资讯'),
    summary: String(it.summary ?? it.title ?? ''),
    publishedAt: String(it.publishedAt ?? new Date().toISOString()),
    tags: Array.isArray(it.tags) ? it.tags.map(String) : ['资讯'],
  }))
}

async function fetchHotBoard(
  platform: string,
  signal: AbortSignal,
): Promise<NewsItem[]> {
  const res = await fetch(
    `/api/sources/hotboard?platform=${encodeURIComponent(platform)}`,
    { signal },
  )
  const text = await res.text()
  if (!res.ok) {
    const detail = parseFetchErrorBody(text)
    throw new Error(detail || friendlyFetchError(null, res.status))
  }
  let data: { items?: Array<Record<string, unknown>>; error?: string }
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    throw new Error('热榜返回无法解析')
  }
  const items = data.items ?? []
  if (!items.length) {
    throw new Error(data.error || '热榜暂无条目')
  }
  return mapRemoteItems(items, `hot-${platform}`)
}

function parseFetchErrorBody(text: string): string {
  try {
    const data = JSON.parse(text) as { error?: string; detail?: string }
    if (data.error) {
      return data.detail ? `${data.error}（${data.detail}）` : data.error
    }
  } catch {
    /* plain text */
  }
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, 120) : ''
}

async function fetchRss(url: string, signal: AbortSignal): Promise<NewsItem[]> {
  const res = await fetch(`/api/sources/fetch?url=${encodeURIComponent(url)}`, {
    signal,
  })
  const text = await res.text()
  if (!res.ok) {
    const detail = parseFetchErrorBody(text)
    throw new Error(
      detail ||
        friendlyFetchError(null, res.status) +
          (text ? `：${text.slice(0, 80)}` : ''),
    )
  }
  let data: { items?: Array<Record<string, unknown>>; error?: string }
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    throw new Error('订阅源返回无法解析')
  }
  const items = data.items ?? []
  if (!items.length) {
    throw new Error(data.error || '订阅源无条目，请换有效的 RSS/Atom 地址')
  }
  return mapRemoteItems(items, 'rss')
}

export async function testNewsSource(
  source: NewsSourceConfig,
  timeoutMs = 12000,
): Promise<SourceTestResult> {
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    if (!source.enabled) {
      return {
        id: source.id,
        name: source.name,
        ok: false,
        count: 0,
        latencyMs: 0,
        error: '已停用，跳过',
      }
    }
    if (source.kind === 'rss') {
      if (!/^https?:\/\//i.test(source.endpoint)) {
        return {
          id: source.id,
          name: source.name,
          ok: false,
          count: 0,
          latencyMs: Math.round(performance.now() - started),
          error: '地址格式不正确，需以 http:// 或 https:// 开头',
        }
      }
      const items = await fetchRss(source.endpoint, ctrl.signal)
      return {
        id: source.id,
        name: source.name,
        ok: true,
        count: items.length,
        latencyMs: Math.round(performance.now() - started),
        items,
      }
    }
    if (source.kind === 'builtin' && LIVE_HOTBOARD.has(source.endpoint)) {
      const items = await fetchHotBoard(source.endpoint, ctrl.signal)
      return {
        id: source.id,
        name: source.name,
        ok: true,
        count: items.length,
        latencyMs: Math.round(performance.now() - started),
        items,
      }
    }
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300))
    const items = builtinItems(source.endpoint)
    return {
      id: source.id,
      name: source.name,
      ok: true,
      count: items.length,
      latencyMs: Math.round(performance.now() - started),
      items,
    }
  } catch (err) {
    return {
      id: source.id,
      name: source.name,
      ok: false,
      count: 0,
      latencyMs: Math.round(performance.now() - started),
      error: friendlyFetchError(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function testAllSources(
  sources: NewsSourceConfig[],
): Promise<SourceTestResult[]> {
  const results: SourceTestResult[] = []
  for (const s of sources) {
    results.push(await testNewsSource(s))
  }
  return results
}

/** 工作台抓取：仅启用的来源 */
export async function fetchEnabledNews(
  sources: NewsSourceConfig[],
): Promise<{ news: NewsItem[]; warnings: string[] }> {
  const enabled = sources.filter((s) => s.enabled)
  const warnings: string[] = []
  const news: NewsItem[] = []
  const results = await testAllSources(enabled)
  for (const r of results) {
    if (r.ok && r.items) news.push(...r.items)
    else if (r.error && r.error !== '已停用，跳过') {
      warnings.push(`${r.name}：${r.error}`)
    }
  }
  // 去重标题
  const seen = new Set<string>()
  const unique = news.filter((n) => {
    if (seen.has(n.title)) return false
    seen.add(n.title)
    return true
  })
  return { news: unique, warnings }
}

export function isValidSourceUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
