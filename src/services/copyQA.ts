import type { CatalogProduct, EvalSettings } from '../config/types'

export const FORBIDDEN_WORDS = [
  '最佳',
  '最好',
  '最低',
  '第一',
  '国家级',
  '顶级',
  '绝对',
  '永久',
  '百分百',
  '全网最低',
  '唯一',
  '首选',
  '冠军',
  '领导品牌',
  '完美',
  '万能',
] as const

export type CheckSeverity = 'hard' | 'soft'

export interface CheckItem {
  id: string
  label: string
  passed: boolean
  severity: CheckSeverity
  weight: number
  reason?: string
  /** 是否适合送入自动返工 */
  reworkable: boolean
}

export interface MachineCheckResult {
  items: CheckItem[]
  score: number
  passed: boolean
  hardFailures: CheckItem[]
  softFailures: CheckItem[]
  reworkableFailures: CheckItem[]
}

export interface CopyMaterial {
  newsTags: string[]
  products: CatalogProduct[]
  allowedPrices: number[]
}

function extractAmounts(text: string): number[] {
  const amounts: number[] = []
  const re = /(?:¥|￥|\$)?\s*(\d+(?:\.\d+)?)\s*元?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = Number(m[1])
    if (Number.isFinite(n)) amounts.push(n)
  }
  // 也匹配「活动价 399」这类
  const re2 = /(?:价|价格|到手|活动价|售价|原价)\s*[:：]?\s*(\d+(?:\.\d+)?)/g
  while ((m = re2.exec(text))) {
    const n = Number(m[1])
    if (Number.isFinite(n)) amounts.push(n)
  }
  return [...new Set(amounts)]
}

function countEmoji(text: string): number {
  const matches = text.match(/\p{Extended_Pictographic}/gu)
  return matches?.length ?? 0
}

function hasInteractiveCta(text: string): boolean {
  return /(评论|转发|点赞|投票|扣|告诉我|聊聊|你怎么看|欢迎讨论|留言)/.test(
    text,
  )
}

function hasLayoutArtifacts(text: string): boolean {
  return /(\*\*|__|```|^\s*#{1,6}\s|^\s*---\s*$)/m.test(text)
}

function mentionsProduct(text: string, products: CatalogProduct[]): boolean {
  return products.some(
    (p) =>
      (p.name && text.includes(p.name)) ||
      (p.brand && text.includes(p.brand)),
  )
}

export function runMachineChecks(
  copy: string,
  material: CopyMaterial,
  settings: EvalSettings,
): MachineCheckResult {
  const items: CheckItem[] = []
  const len = [...copy].length

  // 字数
  const charOk = len >= settings.charMin && len <= settings.charMax
  items.push({
    id: 'length',
    label: '字数区间',
    passed: charOk,
    severity: 'soft',
    weight: 12,
    reason: charOk
      ? undefined
      : `当前 ${len} 字，要求 ${settings.charMin}～${settings.charMax} 字`,
    reworkable: true,
  })

  // 话题标签
  const tagMatches = copy.match(/#[^#\s]+#/g) ?? []
  const required = material.newsTags.filter(Boolean)
  const hasRequired =
    required.length === 0 ||
    required.some((t) => copy.includes(`#${t}#`) || copy.includes(t))
  const tagCountOk = tagMatches.length <= settings.maxTags
  const tagsOk = hasRequired && tagCountOk
  items.push({
    id: 'tags',
    label: '话题标签',
    passed: tagsOk,
    severity: 'soft',
    weight: 10,
    reason: !hasRequired
      ? `未带上素材指定标签（${required.join('、') || '无'}）`
      : !tagCountOk
        ? `话题标签过多（${tagMatches.length} > ${settings.maxTags}）`
        : undefined,
    reworkable: true,
  })

  // Emoji
  const emojiCount = countEmoji(copy)
  const emojiOk =
    emojiCount >= settings.emojiMin && emojiCount <= settings.emojiMax
  items.push({
    id: 'emoji',
    label: '表情数量',
    passed: emojiOk,
    severity: 'soft',
    weight: 6,
    reason: emojiOk
      ? undefined
      : `表情 ${emojiCount} 个，建议 ${settings.emojiMin}～${settings.emojiMax} 个`,
    reworkable: true,
  })

  // 违禁词（硬伤）
  const hitWords = FORBIDDEN_WORDS.filter((w) => copy.includes(w))
  items.push({
    id: 'forbidden',
    label: '广告法违禁词',
    passed: hitWords.length === 0,
    severity: 'hard',
    weight: 25,
    reason:
      hitWords.length > 0
        ? `命中违禁词：${hitWords.join('、')}`
        : undefined,
    reworkable: true,
  })

  // 编造价格（硬伤）
  const amounts = extractAmounts(copy)
  const allowed = new Set(
    (material.allowedPrices.length
      ? material.allowedPrices
      : material.products.flatMap((p) =>
          [p.price, p.originalPrice].filter((n): n is number => n != null),
        )
    ).map((n) => Number(n)),
  )
  const fabricated = amounts.filter((a) => !allowed.has(a))
  items.push({
    id: 'price',
    label: '编造价格',
    passed: fabricated.length === 0,
    severity: 'hard',
    weight: 25,
    reason:
      fabricated.length > 0
        ? `编造金额：${fabricated.join('、')}；素材可用：${[...allowed].join('、') || '无'}`
        : undefined,
    reworkable: true,
  })

  // 互动引导
  const ctaOk = hasInteractiveCta(copy)
  items.push({
    id: 'cta',
    label: '互动引导',
    passed: ctaOk,
    severity: 'soft',
    weight: 10,
    reason: ctaOk ? undefined : '结尾缺少互动引导（评论/转发/投票等）',
    reworkable: true,
  })

  // 排版符号
  const layoutOk = !hasLayoutArtifacts(copy)
  items.push({
    id: 'layout',
    label: '残留排版符号',
    passed: layoutOk,
    severity: 'soft',
    weight: 6,
    reason: layoutOk ? undefined : '检测到 markdown/排版残留符号',
    reworkable: true,
  })

  // 提到商品（改了也白改 → 不进返工）
  const productOk = mentionsProduct(copy, material.products)
  items.push({
    id: 'product_mention',
    label: '提到商品',
    passed: productOk,
    severity: 'soft',
    weight: 6,
    reason: productOk ? undefined : '文案中未出现商品名称或品牌',
    reworkable: false,
  })

  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  const earned = items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0)
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0
  const hardFailures = items.filter((i) => !i.passed && i.severity === 'hard')
  const softFailures = items.filter((i) => !i.passed && i.severity === 'soft')
  const reworkableFailures = items.filter((i) => !i.passed && i.reworkable)

  return {
    items,
    score,
    passed: hardFailures.length === 0 && score >= 70,
    hardFailures,
    softFailures,
    reworkableFailures,
  }
}

export function materialFromProducts(
  products: CatalogProduct[],
  newsTags: string[],
): CopyMaterial {
  return {
    newsTags,
    products,
    allowedPrices: products.flatMap((p) =>
      [p.price, p.originalPrice].filter((n): n is number => n != null),
    ),
  }
}
