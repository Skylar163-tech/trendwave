import type { CopyVariant, NewsItem, Product } from './workflow'

/** 单条热点及其匹配商品、预生成文案（方案 A 一次灌入） */
export interface NewsMatchBundle {
  news: NewsItem
  products: Product[]
  copies: string[]
}

export interface PipelineHydration {
  newsList: NewsItem[]
  productsByNewsId: Record<string, Product[]>
  copiesByNewsId: Record<string, string[]>
  /** 文案变体缓存（已规范化），按 newsId */
  copyVariantsByNewsId: Record<string, CopyVariant[]>
  warning?: string
  debugUrl?: string
  raw: unknown
  source: 'workflow' | 'mock'
}

/**
 * 扣子结束节点推荐输出（可放在 output / data 中，字符串或对象均可）：
 *
 * {
 *   "news": [{ "id","title","summary","source","tags","category","heat" }],
 *   "matches": [{
 *     "newsId": "n1",
 *     "products": [{ "id","name","brand","price","sellingPoints","matchScore","category" }],
 *     "copies": ["文案1","文案2","文案3"]
 *   }]
 * }
 *
 * 也兼容数组：[{ "title","summary","products":[], "copies":[] }]
 */
export const PIPELINE_OUTPUT_CONTRACT = `{
  "news": [{ "id": "n1", "title": "...", "summary": "...", "tags": ["..."] }],
  "matches": [{
    "newsId": "n1",
    "products": [{ "name": "...", "brand": "...", "price": 99, "sellingPoints": ["..."], "matchScore": 80 }],
    "copies": ["微博文案1", "微博文案2", "微博文案3"]
  }]
}`
