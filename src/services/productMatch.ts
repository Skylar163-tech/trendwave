import type { AppConfig, CatalogProduct } from '../config/types'
import { renderTemplate } from './promptEngine'
import { callChatModel, resolveSceneTemperature } from './llmClient'
import type { NewsItem, Product } from '../types/workflow'

export interface ProductMatchItem {
  product: Product
  reason: string
}

export interface ProductMatchResult {
  matches: ProductMatchItem[]
  warning?: string
  mocked?: boolean
  source: 'llm' | 'heuristic' | 'empty'
}

function catalogToProduct(p: CatalogProduct, matchScore: number): Product {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    originalPrice: p.originalPrice,
    matchScore,
    sellingPoints: [...p.sellingPoints],
    category: p.category,
    imageTone: p.imageTone,
    stock: p.stock,
    icon: p.icon,
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

function heuristicMatch(
  news: NewsItem,
  catalog: CatalogProduct[],
): ProductMatchItem[] {
  const tags = new Set(news.tags.map((t) => t.toLowerCase()))
  const blob = `${news.title} ${news.summary} ${news.category}`.toLowerCase()
  const maxSales = Math.max(
    1,
    ...catalog.map((p) => p.monthlySales ?? 0),
  )

  return catalog
    .map((p) => {
      let score = 40
      const reasons: string[] = []
      if (
        tags.has(p.category.toLowerCase()) ||
        blob.includes(p.category.toLowerCase())
      ) {
        score += 25
        reasons.push(`品类「${p.category}」相关`)
      }
      for (const t of tags) {
        if (
          p.name.toLowerCase().includes(t) ||
          p.brand.toLowerCase().includes(t)
        ) {
          score += 12
          reasons.push(`名称命中标签「${t}」`)
        }
        for (const sp of p.sellingPoints) {
          if (sp.toLowerCase().includes(t)) {
            score += 8
            reasons.push(`卖点含「${t}」`)
          }
        }
      }
      // 商业指标：相关度接近时优先高毛利、低退货、高销量
      if (p.grossMargin != null) {
        const boost = Math.round(p.grossMargin * 12)
        score += boost
        if (p.grossMargin >= 0.4) reasons.push(`毛利率 ${(p.grossMargin * 100).toFixed(0)}%`)
      }
      if (p.returnRate != null) {
        const penalty = Math.round(p.returnRate * 40)
        score -= penalty
        if (p.returnRate <= 0.04) reasons.push('退货率较低')
      }
      if (p.monthlySales != null && p.monthlySales > 0) {
        const boost = Math.round((p.monthlySales / maxSales) * 10)
        score += boost
        if (boost >= 6) reasons.push('近月销量靠前')
      }
      return {
        product: catalogToProduct(p, Math.min(99, Math.max(0, score))),
        reason: reasons[0] ?? '综合相关度与经营指标排序',
      }
    })
    .sort((a, b) => b.product.matchScore - a.product.matchScore)
    .slice(0, 6)
    .filter((m) => m.product.matchScore >= 50)
}

function compactCatalog(catalog: CatalogProduct[]) {
  return catalog.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    price: p.price,
    sellingPoints: p.sellingPoints,
    monthlySales: p.monthlySales,
    returnRate: p.returnRate,
    grossMargin: p.grossMargin,
  }))
}

/**
 * 按热点从商品库 LLM 匹配（可后台调提示词；mock 走启发式）。
 */
export async function matchProductsForNews(
  news: NewsItem,
  catalog: CatalogProduct[],
  appConfig: AppConfig,
): Promise<ProductMatchResult> {
  if (!catalog.length) {
    return { matches: [], source: 'empty', warning: '商品库为空' }
  }

  if (appConfig.model.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 500))
    return {
      matches: heuristicMatch(news, catalog),
      source: 'heuristic',
      mocked: true,
      warning: '当前为本地模拟匹配（标签/品类启发），非真实模型',
    }
  }

  const user = renderTemplate(appConfig.prompts.productMatchUserTemplate, {
    news_title: news.title,
    news_summary: news.summary,
    news_tags: news.tags.join('、'),
    news_source: news.source,
    news_category: news.category,
    catalog_json: JSON.stringify(compactCatalog(catalog), null, 2),
  })

  try {
    const result = await callChatModel(
      appConfig.model,
      [
        { role: 'system', content: appConfig.prompts.productMatchSystemRole },
        { role: 'user', content: user },
      ],
      { temperature: resolveSceneTemperature(appConfig.model, 'productMatch') },
    )

    const parsed = tryParseJson(result.content)
    const byId = new Map(catalog.map((p) => [p.id, p]))
    const matches: ProductMatchItem[] = []

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const rows = Array.isArray(obj.matches)
        ? obj.matches
        : Array.isArray(obj.products)
          ? obj.products
          : Array.isArray(parsed)
            ? parsed
            : []

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const id = String(r.productId ?? r.product_id ?? r.id ?? '')
        const p = byId.get(id)
        if (!p) continue
        const scoreRaw = Number(r.score ?? r.matchScore ?? 80)
        const score = Number.isFinite(scoreRaw)
          ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
          : 80
        matches.push({
          product: catalogToProduct(p, score),
          reason:
            typeof r.reason === 'string' && r.reason.trim()
              ? r.reason.trim()
              : '模型推荐',
        })
      }
    }

    matches.sort((a, b) => b.product.matchScore - a.product.matchScore)

    if (!matches.length) {
      const fallback = heuristicMatch(news, catalog)
      return {
        matches: fallback,
        source: 'heuristic',
        mocked: result.mocked,
        warning:
          '模型未返回有效商品 id，已降级为规则匹配。请检查提示词与商品库 id。',
      }
    }

    return {
      matches: matches.slice(0, 6),
      source: 'llm',
      mocked: result.mocked,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '匹配失败'
    return {
      matches: heuristicMatch(news, catalog),
      source: 'heuristic',
      warning: `模型匹配失败，已降级规则：${message}`,
    }
  }
}
