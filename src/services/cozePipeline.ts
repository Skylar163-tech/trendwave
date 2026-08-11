import type { IntegrationConfig } from '../types/integration'
import { PIPELINE_OUTPUT_CONTRACT } from '../types/pipeline'
import type { PipelineHydration } from '../types/pipeline'
import type { CopyVariant, NewsItem, Product } from '../types/workflow'
import {
  invokeCozeRun,
  tryParseJson,
  unwrapCozeData,
} from './cozeWorkflow'

const COPY_LABELS = ['版本 A · 热点借势', '版本 B · 种草种心', '版本 C · 互动引导']
const COPY_TONES = ['热点借势', '种草种心', '互动引导']

export function buildPipelineParameters(
  inputKey = 'input',
  trigger = '热搜 电商 消费',
): Record<string, string> {
  const hint = [
    trigger.trim() || '热搜',
    '',
    '若结束节点可自定义输出，请尽量返回如下 JSON：',
    PIPELINE_OUTPUT_CONTRACT,
  ].join('\n')

  return {
    [inputKey]: hint,
    BOT_USER_INPUT: hint,
    query: trigger.trim() || '热搜',
  }
}

/** 方案 A：一次调用全流程工作流，解析为工作台可灌入的数据 */
export async function runCozePipeline(
  config: IntegrationConfig,
): Promise<PipelineHydration> {
  const inputKey = config.workflowInputKey.trim() || 'input'
  const { payload, debugUrl } = await invokeCozeRun(
    config,
    buildPipelineParameters(inputKey),
  )

  const hydration = parsePipelinePayload(payload)
  return {
    ...hydration,
    debugUrl,
    raw: payload,
    source: 'workflow',
  }
}

export function parsePipelinePayload(payload: unknown): Omit<
  PipelineHydration,
  'debugUrl' | 'raw' | 'source'
> {
  const root = unwrapCozeData(payload)
  const bundles = collectBundles(root)

  if (bundles.length === 0) {
    const looseTexts = collectLooseCopyTexts(root)
    if (looseTexts.length > 0) {
      const news = makeNews(
        {
          id: 'coze-1',
          title: '工作流返回结果（未识别结构化新闻）',
          summary: '结束节点未按约定返回 news/matches，已将文本当作文案灌入。',
          tags: ['扣子'],
        },
        0,
      )
      return {
        newsList: [news],
        productsByNewsId: { [news.id]: [] },
        copiesByNewsId: { [news.id]: looseTexts },
        copyVariantsByNewsId: {
          [news.id]: textsToVariants(looseTexts),
        },
        warning:
          '已调用成功，但未解析到结构化新闻/商品。请按结束节点 JSON 约定调整输出；当前仅灌入了文案文本。',
      }
    }

    throw new Error(
      '扣子已响应，但未能解析出新闻/商品/文案。请让结束节点输出含 news、matches 或 copies 的 JSON（见集成配置说明）',
    )
  }

  const newsList: NewsItem[] = []
  const productsByNewsId: Record<string, Product[]> = {}
  const copiesByNewsId: Record<string, string[]> = {}
  const copyVariantsByNewsId: Record<string, CopyVariant[]> = {}

  let emptyProductCount = 0
  for (const bundle of bundles) {
    newsList.push(bundle.news)
    productsByNewsId[bundle.news.id] = bundle.products
    copiesByNewsId[bundle.news.id] = bundle.copies
    copyVariantsByNewsId[bundle.news.id] = textsToVariants(bundle.copies)
    if (bundle.products.length === 0) emptyProductCount += 1
  }

  const warnings: string[] = []
  if (emptyProductCount === bundles.length) {
    warnings.push(
      '未解析到匹配商品（知识库可能无命中）。可先选新闻继续，或在扣子侧检查商品库检索结果。',
    )
  } else if (emptyProductCount > 0) {
    warnings.push(`${emptyProductCount} 条热点没有匹配商品。`)
  }
  if (bundles.every((b) => b.copies.length === 0)) {
    warnings.push('未解析到文案；可在「创作文案」步重新生成。')
  }

  return {
    newsList,
    productsByNewsId,
    copiesByNewsId,
    copyVariantsByNewsId,
    warning: warnings.length ? warnings.join(' ') : undefined,
  }
}

function collectBundles(root: unknown): Array<{
  news: NewsItem
  products: Product[]
  copies: string[]
}> {
  if (root == null) return []

  if (typeof root === 'string') {
    const parsed = tryParseJson(root)
    return parsed != null ? collectBundles(parsed) : []
  }

  if (Array.isArray(root)) {
    if (root.length === 0) return []
    if (root.some((item) => isRecord(item) && hasNewsShape(item))) {
      return root.flatMap((item, i) => bundleFromItem(item, i))
    }
    return []
  }

  if (!isRecord(root)) return []

  if (Array.isArray(root.matches) || Array.isArray(root.news)) {
    return bundlesFromNewsAndMatches(root)
  }

  if (
    hasNewsShape(root) ||
    Array.isArray(root.products) ||
    Array.isArray(root.copies)
  ) {
    return bundleFromItem(root, 0)
  }

  for (const key of ['items', 'results', 'list', 'records', 'data']) {
    if (Array.isArray(root[key])) {
      const nested = collectBundles(root[key])
      if (nested.length) return nested
    }
  }

  return []
}

function bundlesFromNewsAndMatches(root: Record<string, unknown>) {
  const newsRaw = Array.isArray(root.news) ? root.news : []
  const matchesRaw = Array.isArray(root.matches) ? root.matches : []

  const newsList = newsRaw.map((item, i) => makeNews(item, i))
  const byId = new Map(newsList.map((n) => [n.id, n]))

  if (matchesRaw.length === 0) {
    return newsList.map((news) => ({
      news,
      products: [],
      copies: [],
    }))
  }

  return matchesRaw.map((match, i) => {
    if (!isRecord(match)) {
      const news = newsList[i] ?? makeNews({ title: `热点 ${i + 1}` }, i)
      return { news, products: [], copies: [] }
    }

    const newsId =
      str(match.newsId) ||
      str(match.news_id) ||
      (isRecord(match.news) ? str(match.news.id) : '') ||
      newsList[i]?.id ||
      `coze-${i + 1}`

    const newsFromMatch = isRecord(match.news)
      ? makeNews(match.news, i)
      : hasNewsShape(match)
        ? makeNews(match, i)
        : (byId.get(newsId) ??
          newsList[i] ??
          makeNews({ id: newsId, title: str(match.title) || `热点 ${i + 1}` }, i))

    const news = { ...newsFromMatch, id: newsFromMatch.id || newsId }
    if (!byId.has(news.id)) byId.set(news.id, news)

    return {
      news,
      products: normalizeProducts(match.products ?? match.product_list, news.id),
      copies: normalizeCopies(match.copies ?? match.copy ?? match.output),
    }
  })
}

function bundleFromItem(item: unknown, index: number) {
  if (!isRecord(item)) return []
  const news = makeNews(item, index)
  const products = normalizeProducts(
    item.products ?? item.product_list ?? item.matched_products,
    news.id,
  )
  const copies = normalizeCopies(
    item.copies ?? item.copy ?? item.weibo ?? item.content ?? item.output,
  )
  return [{ news, products, copies }]
}

function normalizeProducts(raw: unknown, newsId: string): Product[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw)
    return parsed != null ? normalizeProducts(parsed, newsId) : []
  }
  if (!Array.isArray(raw)) {
    if (isRecord(raw) && (raw.name || raw.product_name || raw.title)) {
      return [makeProduct(raw, newsId, 0)]
    }
    return []
  }
  return raw
    .map((item, i) => (isRecord(item) ? makeProduct(item, newsId, i) : null))
    .filter((p): p is Product => p != null)
}

function normalizeCopies(raw: unknown): string[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw)
    if (parsed != null) return normalizeCopies(parsed)
    const t = raw.trim()
    return t ? [t] : []
  }
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => {
        if (typeof item === 'string') return [item]
        if (isRecord(item)) {
          const c =
            str(item.content) ||
            str(item.text) ||
            str(item.copy) ||
            str(item.output)
          return c ? [c] : []
        }
        return []
      })
      .map((t) => t.trim())
      .filter(Boolean)
  }
  if (isRecord(raw)) {
    return normalizeCopies(
      raw.copies ?? raw.content ?? raw.text ?? raw.output ?? raw.weibo,
    )
  }
  return []
}

function collectLooseCopyTexts(root: unknown): string[] {
  if (root == null) return []
  if (typeof root === 'string') {
    const parsed = tryParseJson(root)
    if (parsed != null) return collectLooseCopyTexts(parsed)
    return root.trim().length > 10 ? [root.trim()] : []
  }
  if (Array.isArray(root)) {
    const texts = root
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((t) => t.length > 10)
    if (texts.length) return texts
    return root.flatMap((item) => collectLooseCopyTexts(item))
  }
  if (!isRecord(root)) return []
  for (const key of ['copies', 'output', 'text', 'content', 'result', 'weibo']) {
    if (key in root) {
      const found = normalizeCopies(root[key])
      if (found.length) return found
    }
  }
  const collected: string[] = []
  for (const value of Object.values(root)) {
    if (typeof value === 'string' && value.trim().length > 20) {
      const nested = tryParseJson(value)
      if (nested != null) collected.push(...collectLooseCopyTexts(nested))
      else collected.push(value.trim())
    }
  }
  return collected
}

function makeNews(raw: unknown, index: number): NewsItem {
  const obj = isRecord(raw) ? raw : {}
  const id =
    str(obj.id) ||
    str(obj.news_id) ||
    str(obj.newsId) ||
    `coze-${index + 1}`
  const title =
    str(obj.title) ||
    str(obj.news_title) ||
    str(obj.name) ||
    `热点 ${index + 1}`
  const summary =
    str(obj.summary) ||
    str(obj.brief) ||
    str(obj.desc) ||
    str(obj.description) ||
    str(obj.content) ||
    ''
  const tags = normalizeStringArray(obj.tags ?? obj.tag ?? obj.keywords)
  const heat = num(obj.heat ?? obj.hot ?? obj.score, 500 + index * 10)

  return {
    id,
    title,
    source: str(obj.source) || '扣子工作流',
    heat,
    category: str(obj.category) || tags[0] || '热点',
    summary: summary || title,
    publishedAt:
      str(obj.publishedAt) ||
      str(obj.published_at) ||
      str(obj.time) ||
      new Date().toLocaleString('zh-CN', { hour12: false }),
    tags: tags.length ? tags : ['热点'],
  }
}

function makeProduct(
  raw: Record<string, unknown>,
  newsId: string,
  index: number,
): Product {
  const name =
    str(raw.name) ||
    str(raw.product_name) ||
    str(raw.title) ||
    `商品 ${index + 1}`
  const sellingPoints = normalizeStringArray(
    raw.sellingPoints ?? raw.selling_points ?? raw.points ?? raw.features,
  )

  const originalRaw = raw.originalPrice ?? raw.original_price
  const originalPrice =
    originalRaw != null ? num(originalRaw, Number.NaN) : undefined

  return {
    id: str(raw.id) || `${newsId}-p${index + 1}`,
    name,
    brand: str(raw.brand) || str(raw.shop) || '未知品牌',
    price: num(raw.price, 0),
    originalPrice:
      originalPrice != null && Number.isFinite(originalPrice)
        ? originalPrice
        : undefined,
    matchScore: num(raw.matchScore ?? raw.match_score ?? raw.score, 70),
    sellingPoints: sellingPoints.length ? sellingPoints : ['工作流推荐'],
    category: str(raw.category) || '推荐',
    imageTone: str(raw.imageTone) || str(raw.image_tone) || 'slate',
    stock: num(raw.stock, 100),
  }
}

function textsToVariants(texts: string[]): CopyVariant[] {
  return texts.slice(0, 3).map((content, i) => ({
    id: `pipe-${i + 1}`,
    label: COPY_LABELS[i] ?? `版本 ${i + 1}`,
    tone: COPY_TONES[i] ?? '自定义',
    content,
  }))
}

function hasNewsShape(obj: Record<string, unknown>): boolean {
  return Boolean(
    obj.title ||
      obj.news_title ||
      obj.summary ||
      obj.brief ||
      (obj.id && (obj.tags || obj.source)),
  )
}

function normalizeStringArray(raw: unknown): string[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw)
    if (Array.isArray(parsed)) return normalizeStringArray(parsed)
    return raw
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return fallback
}
