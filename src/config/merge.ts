import { DEFAULT_APP_CONFIG, DEFAULT_MODEL_TEMPERATURES } from './defaults'
import type {
  AppConfig,
  CatalogProduct,
  CreativeStyle,
  EvalCase,
  ModelTemperatures,
} from './types'

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function clampTemp(n: number): number {
  if (!Number.isFinite(n)) return 0.8
  return Math.min(1.5, Math.max(0, n))
}

function mergeTemperatures(
  raw: unknown,
  legacyCreative: number,
): ModelTemperatures {
  const base: ModelTemperatures = {
    ...DEFAULT_MODEL_TEMPERATURES,
    creative: clampTemp(legacyCreative),
  }
  if (!isObject(raw)) return base
  return {
    creative:
      typeof raw.creative === 'number'
        ? clampTemp(raw.creative)
        : base.creative,
    newsGate:
      typeof raw.newsGate === 'number'
        ? clampTemp(raw.newsGate)
        : DEFAULT_MODEL_TEMPERATURES.newsGate,
    productMatch:
      typeof raw.productMatch === 'number'
        ? clampTemp(raw.productMatch)
        : DEFAULT_MODEL_TEMPERATURES.productMatch,
    review:
      typeof raw.review === 'number'
        ? clampTemp(raw.review)
        : DEFAULT_MODEL_TEMPERATURES.review,
  }
}

function mergeProduct(p: unknown, fallback?: CatalogProduct): CatalogProduct | null {
  if (!isObject(p)) return null
  const base = fallback ?? DEFAULT_APP_CONFIG.products[0]
  if (!base) return null
  const name = typeof p.name === 'string' ? p.name : base.name
  if (!name.trim()) return null
  const price = Number(p.price)
  if (!Number.isFinite(price) || price <= 0) return null
  let originalPrice: number | undefined
  if (p.originalPrice != null && p.originalPrice !== '') {
    const op = Number(p.originalPrice)
    if (Number.isFinite(op) && op > 0) originalPrice = op
  }
  return {
    id: typeof p.id === 'string' && p.id ? p.id : `p-${Date.now()}`,
    name: name.trim(),
    brand: typeof p.brand === 'string' ? p.brand : base.brand,
    icon: typeof p.icon === 'string' && p.icon ? p.icon : '🛍️',
    price,
    originalPrice,
    sellingPoints: Array.isArray(p.sellingPoints)
      ? p.sellingPoints.map(String).filter(Boolean)
      : [...base.sellingPoints],
    category: typeof p.category === 'string' ? p.category : base.category,
    imageTone:
      typeof p.imageTone === 'string' && p.imageTone
        ? p.imageTone
        : base.imageTone,
    stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : base.stock,
    monthlySales:
      p.monthlySales != null && Number.isFinite(Number(p.monthlySales))
        ? Number(p.monthlySales)
        : undefined,
    returnRate:
      p.returnRate != null && Number.isFinite(Number(p.returnRate))
        ? Number(p.returnRate)
        : undefined,
    grossMargin:
      p.grossMargin != null && Number.isFinite(Number(p.grossMargin))
        ? Number(p.grossMargin)
        : undefined,
  }
}

/**
 * 读取时对缺失字段自动补默认值，避免运营误删某段导致崩溃。
 */
export function mergeWithDefaults(partial: unknown): AppConfig {
  const src = isObject(partial) ? partial : {}
  const d = DEFAULT_APP_CONFIG

  const promptsSrc = isObject(src.prompts) ? src.prompts : {}
  const modelSrc = isObject(src.model) ? src.model : {}
  const evalSrc = isObject(src.eval) ? src.eval : {}

  let products: CatalogProduct[] = d.products.map((p) => ({
    ...p,
    sellingPoints: [...p.sellingPoints],
  }))
  if (Array.isArray(src.products) && src.products.length > 0) {
    const merged = src.products
      .map((p, i) => mergeProduct(p, d.products[i] ?? d.products[0]))
      .filter((p): p is CatalogProduct => Boolean(p))
    if (merged.length > 0) products = merged
  }

  let creativeStyles: CreativeStyle[] = d.creativeStyles.map((s) => ({ ...s }))
  if (Array.isArray(src.creativeStyles) && src.creativeStyles.length > 0) {
    const styles = src.creativeStyles
      .filter(isObject)
      .map((s, i) => ({
        id:
          typeof s.id === 'string' && s.id
            ? s.id
            : `style-${i + 1}`,
        name: typeof s.name === 'string' && s.name ? s.name : `风格 ${i + 1}`,
        instruction:
          typeof s.instruction === 'string'
            ? s.instruction
            : d.creativeStyles[0]?.instruction ?? '',
      }))
    if (styles.length > 0) creativeStyles = styles
  }

  let tonePresets = [...d.tonePresets]
  if (Array.isArray(src.tonePresets) && src.tonePresets.length > 0) {
    tonePresets = src.tonePresets.map(String).filter(Boolean)
  }

  let sources = d.sources.map((s) => ({ ...s }))
  if (Array.isArray(src.sources) && src.sources.length > 0) {
    sources = src.sources.filter(isObject).map((s, i) => ({
      id: typeof s.id === 'string' && s.id ? s.id : `src-${i}`,
      name: typeof s.name === 'string' ? s.name : `来源 ${i + 1}`,
      kind: s.kind === 'rss' ? 'rss' : 'builtin',
      endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
      enabled: s.enabled !== false,
      builtin: Boolean(s.builtin),
    }))
  }

  let newsRecommendations: Record<string, string[]> = {
    ...d.newsRecommendations,
  }
  if (isObject(src.newsRecommendations)) {
    newsRecommendations = {}
    for (const [k, v] of Object.entries(src.newsRecommendations)) {
      if (Array.isArray(v)) newsRecommendations[k] = v.map(String)
    }
  }

  let evalCases: EvalCase[] = d.evalCases.map((c) => ({
    ...c,
    newsTags: [...c.newsTags],
    productIds: [...c.productIds],
  }))
  if (Array.isArray(src.evalCases)) {
    evalCases = src.evalCases.filter(isObject).map((c, i) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `case-${i + 1}`,
      name: typeof c.name === 'string' ? c.name : `用例 ${i + 1}`,
      enabled: c.enabled !== false,
      tone: typeof c.tone === 'string' ? c.tone : d.tonePresets[0] ?? '',
      newsTitle: typeof c.newsTitle === 'string' ? c.newsTitle : '',
      newsSummary: typeof c.newsSummary === 'string' ? c.newsSummary : '',
      newsTags: Array.isArray(c.newsTags) ? c.newsTags.map(String) : [],
      productIds: Array.isArray(c.productIds) ? c.productIds.map(String) : [],
    }))
  }

  return {
    version: 1,
    prompts: {
      systemRole:
        typeof promptsSrc.systemRole === 'string'
          ? promptsSrc.systemRole
          : d.prompts.systemRole,
      materialTemplate:
        typeof promptsSrc.materialTemplate === 'string'
          ? promptsSrc.materialTemplate
          : d.prompts.materialTemplate,
      productItemFormat:
        typeof promptsSrc.productItemFormat === 'string'
          ? promptsSrc.productItemFormat
          : d.prompts.productItemFormat,
      rewriteInstructions:
        typeof promptsSrc.rewriteInstructions === 'string'
          ? promptsSrc.rewriteInstructions
          : d.prompts.rewriteInstructions,
      reviewPrompt:
        typeof promptsSrc.reviewPrompt === 'string'
          ? promptsSrc.reviewPrompt
          : d.prompts.reviewPrompt,
      newsGateSystemRole:
        typeof promptsSrc.newsGateSystemRole === 'string'
          ? promptsSrc.newsGateSystemRole
          : d.prompts.newsGateSystemRole,
      newsGateUserTemplate:
        typeof promptsSrc.newsGateUserTemplate === 'string'
          ? promptsSrc.newsGateUserTemplate
          : d.prompts.newsGateUserTemplate,
      productMatchSystemRole:
        typeof promptsSrc.productMatchSystemRole === 'string'
          ? promptsSrc.productMatchSystemRole
          : d.prompts.productMatchSystemRole,
      productMatchUserTemplate:
        typeof promptsSrc.productMatchUserTemplate === 'string'
          ? promptsSrc.productMatchUserTemplate
          : d.prompts.productMatchUserTemplate,
    },
    creativeStyles,
    tonePresets,
    model: {
      mode:
        modelSrc.mode === 'proxy' ||
        modelSrc.mode === 'direct' ||
        modelSrc.mode === 'mock'
          ? modelSrc.mode
          : d.model.mode,
      provider:
        typeof modelSrc.provider === 'string'
          ? modelSrc.provider
          : d.model.provider,
      baseUrl:
        typeof modelSrc.baseUrl === 'string'
          ? modelSrc.baseUrl
          : d.model.baseUrl,
      modelName:
        typeof modelSrc.modelName === 'string'
          ? modelSrc.modelName
          : d.model.modelName,
      apiKey:
        typeof modelSrc.apiKey === 'string' ? modelSrc.apiKey : d.model.apiKey,
      temperature:
        typeof modelSrc.temperature === 'number'
          ? modelSrc.temperature
          : d.model.temperature,
      temperatures: mergeTemperatures(
        modelSrc.temperatures,
        typeof modelSrc.temperature === 'number'
          ? modelSrc.temperature
          : d.model.temperature,
      ),
      stream: Boolean(modelSrc.stream),
      workflowUrl:
        typeof modelSrc.workflowUrl === 'string'
          ? modelSrc.workflowUrl
          : d.model.workflowUrl,
      workflowId:
        typeof modelSrc.workflowId === 'string'
          ? modelSrc.workflowId
          : d.model.workflowId,
      workflowInputKey:
        typeof modelSrc.workflowInputKey === 'string' &&
        modelSrc.workflowInputKey
          ? modelSrc.workflowInputKey
          : d.model.workflowInputKey,
    },
    products,
    newsRecommendations,
    sources,
    eval: {
      machineWeight:
        typeof evalSrc.machineWeight === 'number'
          ? evalSrc.machineWeight
          : d.eval.machineWeight,
      reviewWeight:
        typeof evalSrc.reviewWeight === 'number'
          ? evalSrc.reviewWeight
          : d.eval.reviewWeight,
      charMin:
        typeof evalSrc.charMin === 'number' ? evalSrc.charMin : d.eval.charMin,
      charMax:
        typeof evalSrc.charMax === 'number' ? evalSrc.charMax : d.eval.charMax,
      maxTags:
        typeof evalSrc.maxTags === 'number' ? evalSrc.maxTags : d.eval.maxTags,
      emojiMin:
        typeof evalSrc.emojiMin === 'number'
          ? evalSrc.emojiMin
          : d.eval.emojiMin,
      emojiMax:
        typeof evalSrc.emojiMax === 'number'
          ? evalSrc.emojiMax
          : d.eval.emojiMax,
      unitPrice:
        typeof evalSrc.unitPrice === 'number'
          ? evalSrc.unitPrice
          : d.eval.unitPrice,
    },
    evalCases,
  }
}

/**
 * 写入前校验：空内容拒绝（如商品列表空）。
 */
export function validateConfigForWrite(config: AppConfig): string | null {
  if (!config.products.length) {
    return '商品列表不能为空，拒绝写入以免清空商品库'
  }
  if (!config.creativeStyles.length) {
    return '至少需要保留一个创作风格'
  }
  if (!config.prompts.systemRole.trim()) {
    return '角色设定与写作规范不能为空'
  }
  if (!config.prompts.materialTemplate.trim()) {
    return '素材模板不能为空'
  }
  if (!config.prompts.productItemFormat.trim()) {
    return '单件商品呈现格式不能为空'
  }
  return null
}

export function validateImportPayload(raw: unknown): {
  ok: true
  config: AppConfig
} | { ok: false; error: string } {
  if (!isObject(raw)) {
    return { ok: false, error: '文件内容不是有效的 JSON 对象' }
  }
  if (raw.version != null && raw.version !== 1) {
    return { ok: false, error: `不支持的配置版本：${String(raw.version)}` }
  }
  // 必须至少像一份配置（有 prompts 或 products 或 model）
  if (!raw.prompts && !raw.products && !raw.model && !raw.creativeStyles) {
    return {
      ok: false,
      error: '缺少必要字段（prompts / products / model / creativeStyles）',
    }
  }
  const config = mergeWithDefaults(raw)
  const err = validateConfigForWrite(config)
  if (err) return { ok: false, error: err }
  return { ok: true, config }
}
