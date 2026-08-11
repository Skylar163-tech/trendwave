import type { CatalogProduct } from '../config/types'

export interface PromptRenderContext {
  newsTitle: string
  newsSummary: string
  newsTags: string[]
  tone: string
  styleName: string
  styleInstruction: string
  products: CatalogProduct[]
  productItemFormat: string
}

/**
 * 简单模板引擎：
 * - {{key}} 替换
 * - {{#key}}...{{/key}} 条件块（值存在且非空时保留内容并替换内层）
 * - 未知占位符原样保留（不替换成空白）
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | undefined | null>,
): string {
  let out = template

  // 条件块
  out = out.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => {
      const val = vars[key]
      if (val == null || val === '') return ''
      return renderTemplate(inner, { ...vars, [key]: val })
    },
  )

  // 普通占位符：未知则保留原样
  out = out.replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
    if (!(key in vars)) return full
    const val = vars[key]
    if (val == null) return full
    return String(val)
  })

  return out
}

function productVars(p: CatalogProduct): Record<string, string> {
  return {
    product_name: p.name,
    product_brand: p.brand,
    product_icon: p.icon,
    product_price: String(p.price),
    product_original_price:
      p.originalPrice != null ? String(p.originalPrice) : '',
    product_selling_points: p.sellingPoints.join('、'),
    product_category: p.category,
  }
}

export function renderProductList(
  products: CatalogProduct[],
  itemFormat: string,
): string {
  return products
    .map((p) => renderTemplate(itemFormat, productVars(p)))
    .join('\n')
}

export function buildMaterialPrompt(
  materialTemplate: string,
  ctx: PromptRenderContext,
): string {
  const productList = renderProductList(ctx.products, ctx.productItemFormat)
  return renderTemplate(materialTemplate, {
    news_title: ctx.newsTitle,
    news_summary: ctx.newsSummary,
    news_tags: ctx.newsTags.join('、'),
    tone: ctx.tone,
    style_name: ctx.styleName,
    style_instruction: ctx.styleInstruction,
    product_list: productList,
    // 单件字段不在顶层填，避免误替换；保留在 product_list 内
  })
}

export function countChars(text: string): number {
  return [...text].length
}
