import type { AppConfig } from '../config/types'
import { renderTemplate } from './promptEngine'
import { callChatModel, resolveSceneTemperature } from './llmClient'
import type { NewsGateStatus, NewsItem } from '../types/workflow'

export interface NewsGateRunResult {
  news: NewsItem[]
  flaggedCount: number
  warning?: string
  mocked?: boolean
}

const RISK_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: '政治',
    patterns: [
      /政治/,
      /选举/,
      /两会/,
      /外交/,
      /制裁/,
      /军事/,
      /战争/,
      /冲突升级/,
      /国会/,
      /总统/,
      /总理/,
    ],
  },
  {
    category: '灾难事故',
    patterns: [
      /地震/,
      /海啸/,
      /空难/,
      /矿难/,
      /爆炸事故/,
      /遇难/,
      /伤亡/,
      /火灾.*死/,
    ],
  },
  {
    category: '敏感舆论',
    patterns: [
      /丑闻/,
      /出轨/,
      /嫖/,
      /吸毒/,
      /自杀/,
      /性侵/,
      /虐待/,
      /恐怖/,
      /爆炸案/,
    ],
  },
  {
    category: '宗教民族',
    patterns: [/宗教冲突/, /民族对立/, /仇恨言论/],
  },
]

function heuristicGate(news: NewsItem): Pick<
  NewsItem,
  'gateStatus' | 'gateCategories' | 'gateReason'
> {
  const text = `${news.title}\n${news.summary}\n${news.tags.join(',')}`
  const hit: string[] = []
  for (const rule of RISK_RULES) {
    if (rule.patterns.some((re) => re.test(text))) hit.push(rule.category)
  }
  if (hit.length) {
    return {
      gateStatus: 'needs_review',
      gateCategories: hit,
      gateReason: `规则命中：${hit.join('、')}，借势前需人工确认`,
    }
  }
  return {
    gateStatus: 'clear',
    gateCategories: [],
    gateReason: '未命中敏感规则（模拟审核）',
  }
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeStatus(raw: unknown): NewsGateStatus {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'clear' || s === 'pass' || s === 'ok' || s === 'safe') return 'clear'
  if (
    s === 'needs_review' ||
    s === 'review' ||
    s === 'flag' ||
    s === 'risk' ||
    s === 'block'
  ) {
    return 'needs_review'
  }
  return 'needs_review'
}

/**
 * 对热点列表做借势硬边界审核（批量一次 LLM；mock 走本地规则）。
 */
export async function runNewsGate(
  newsList: NewsItem[],
  appConfig: AppConfig,
): Promise<NewsGateRunResult> {
  if (!newsList.length) {
    return { news: [], flaggedCount: 0 }
  }

  const pending = newsList.map((n) => ({
    ...n,
    gateStatus: 'pending' as NewsGateStatus,
    gateCategories: [],
    gateReason: '审核中…',
  }))

  if (appConfig.model.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 450))
    const news = pending.map((n) => ({ ...n, ...heuristicGate(n) }))
    return {
      news,
      flaggedCount: news.filter((n) => n.gateStatus === 'needs_review').length,
      mocked: true,
      warning: '当前为本地模拟审核（关键词规则），非真实模型判断',
    }
  }

  const compact = newsList.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    tags: n.tags,
    source: n.source,
    category: n.category,
  }))

  const user = renderTemplate(appConfig.prompts.newsGateUserTemplate, {
    news_list_json: JSON.stringify(compact, null, 2),
    news_title: newsList[0]?.title ?? '',
    news_summary: newsList[0]?.summary ?? '',
    news_tags: newsList[0]?.tags.join('、') ?? '',
    news_source: newsList[0]?.source ?? '',
    news_category: newsList[0]?.category ?? '',
  })

  try {
    const result = await callChatModel(
      appConfig.model,
      [
        { role: 'system', content: appConfig.prompts.newsGateSystemRole },
        { role: 'user', content: user },
      ],
      { temperature: resolveSceneTemperature(appConfig.model, 'newsGate') },
    )

    const parsed = tryParseJson(result.content)
    const byId = new Map<
      string,
      { status: NewsGateStatus; categories: string[]; reason: string }
    >()

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const rows = Array.isArray(obj.results)
        ? obj.results
        : Array.isArray(obj.items)
          ? obj.items
          : Array.isArray(parsed)
            ? parsed
            : []
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const id = String(r.id ?? r.newsId ?? r.news_id ?? '')
        if (!id) continue
        const categories = Array.isArray(r.categories)
          ? r.categories.map(String).filter(Boolean)
          : typeof r.category === 'string'
            ? [r.category]
            : []
        byId.set(id, {
          status: normalizeStatus(r.status ?? r.gateStatus),
          categories,
          reason:
            typeof r.reason === 'string' && r.reason.trim()
              ? r.reason.trim()
              : categories.length
                ? `涉及${categories.join('、')}`
                : '模型建议人工复核',
        })
      }
    }

    const news = pending.map((n) => {
      const hit = byId.get(n.id)
      if (!hit) {
        return {
          ...n,
          gateStatus: 'error' as NewsGateStatus,
          gateCategories: [],
          gateReason: '模型未返回该条审核结果，请人工判断',
        }
      }
      return {
        ...n,
        gateStatus: hit.status,
        gateCategories: hit.categories,
        gateReason: hit.reason,
      }
    })

    const flaggedCount = news.filter(
      (n) => n.gateStatus === 'needs_review' || n.gateStatus === 'error',
    ).length

    return {
      news,
      flaggedCount,
      mocked: result.mocked,
      warning:
        byId.size === 0
          ? '审核响应未能解析为 JSON，条目已标为需人工判断'
          : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '审核失败'
    const fallback = pending.map((n) => {
      const h = heuristicGate(n)
      return {
        ...n,
        ...h,
        gateReason: `${h.gateReason}；模型调用失败已降级：${message}`,
      }
    })
    return {
      news: fallback,
      flaggedCount: fallback.filter((n) => n.gateStatus === 'needs_review')
        .length,
      warning: `借势审核模型调用失败，已降级本地规则：${message}`,
    }
  }
}

export function gateBadgeLabel(news: NewsItem): string | null {
  if (news.gateStatus === 'needs_review') {
    const cats = news.gateCategories?.length
      ? news.gateCategories.join('、')
      : '敏感话题'
    return `需人工审核 · 涉及${cats}`
  }
  if (news.gateStatus === 'error') {
    return '需人工审核 · 审核结果异常'
  }
  if (news.gateStatus === 'pending') {
    return '审核中…'
  }
  return null
}

export function isNewsGateFlagged(news: NewsItem | null | undefined): boolean {
  if (!news) return false
  return (
    news.gateStatus === 'needs_review' ||
    news.gateStatus === 'error' ||
    news.gateStatus === 'pending'
  )
}
