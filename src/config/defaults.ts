import type {
  AppConfig,
  CatalogProduct,
  CreativeStyle,
  EvalCase,
  EvalSettings,
  ModelConfig,
  NewsSourceConfig,
  PromptConfig,
} from './types'
import { PRODUCT_CATALOG, PRODUCTS_BY_NEWS } from '../data/mock'

const DEFAULT_SYSTEM_ROLE = `你是专业的中文电商社媒文案助手，擅长微博营销文案。

写作规范：
1. 纯文本输出；适当使用 Emoji；带话题标签#。
2. 写完自己数一遍字数，必须控制在 80～180 字；超了就删，宁可少写一个卖点也不能超。
3. 金额只能原样使用素材里给出的数字，素材没给的价格、折扣、销量、库存一律不许出现。
4. 禁止广告法极限词：最佳、最好、最低、第一、国家级、顶级、绝对、永久、百分百、全网最低、唯一、首选、冠军、领导品牌、完美、万能。
5. 结尾要有互动引导（评论/转发/投票等）。
6. 不要输出 markdown 代码块或排版符号（如 **、---）。

范例（符合全部约束）：
#国潮运动# 热搜都在聊赛场同款，这件夹克真的很适合跟风出片 🔥
透气速干，国潮印花限定，活动价 ¥399。
你更 pick 赛场风还是日常风？评论区告诉我 💬`

const DEFAULT_MATERIAL_TEMPLATE = `请基于以下素材创作一条微博营销文案。
创作风格要求：{{style_instruction}}
主打语调：{{tone}}

【热点】
标题：{{news_title}}
摘要：{{news_summary}}
话题标签：{{news_tags}}

【商品清单】
{{product_list}}`

const DEFAULT_PRODUCT_ITEM_FORMAT = `· 【{{product_brand}} {{product_name}}】{{product_icon}}
  售价：¥{{product_price}}{{#product_original_price}}（原价 ¥{{product_original_price}}）{{/product_original_price}}
  卖点：{{product_selling_points}}
  品类：{{product_category}}`

const DEFAULT_REWRITE_INSTRUCTIONS = `请根据下列校验失败项修改文案，只修指出的问题，不要大幅改写无关部分。
改完后再次自查字数与金额，确保全部符合素材。
只输出修改后的纯文本文案，不要解释。`

const DEFAULT_REVIEW_PROMPT = `你是微博营销文案评审。请对文案打分，只输出 JSON（不要 markdown）：
{"relevance":1-5,"fidelity":1-5,"appeal":1-5,"naturalness":1-5,"comment":"一句点评"}
维度：热点关联度、素材还原度、传播吸引力、语气自然度。`

export const DEFAULT_PROMPTS: PromptConfig = {
  systemRole: DEFAULT_SYSTEM_ROLE,
  materialTemplate: DEFAULT_MATERIAL_TEMPLATE,
  productItemFormat: DEFAULT_PRODUCT_ITEM_FORMAT,
  rewriteInstructions: DEFAULT_REWRITE_INSTRUCTIONS,
  reviewPrompt: DEFAULT_REVIEW_PROMPT,
}

export const DEFAULT_CREATIVE_STYLES: CreativeStyle[] = [
  {
    id: 'style-trend',
    name: '热点借势',
    instruction:
      '先接住热点情绪再自然过渡到商品，重体验感与共鸣，语气轻松。',
  },
  {
    id: 'style-promo',
    name: '促销导向',
    instruction: '突出价格钩子和紧迫感，重转化，但不要编造未给出的优惠。',
  },
  {
    id: 'style-interact',
    name: '互动话题',
    instruction: '用提问或投票带动互动，商品作为选项自然出现。',
  },
]

export const DEFAULT_TONE_PRESETS = [
  '热点借势',
  '促销导向',
  '互动话题',
  '种草种心',
]

export const DEFAULT_MODEL: ModelConfig = {
  mode: 'mock',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  apiKey: '',
  temperature: 0.8,
  stream: false,
  workflowUrl: '',
  workflowId: '',
  workflowInputKey: 'input',
}

export const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string; modelName: string }
> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
  },
  moonshot: {
    label: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
  },
  qwen: {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
  },
  custom: {
    label: '自定义',
    baseUrl: '',
    modelName: '',
  },
}

export const GRADIENT_PRESETS = [
  'from-sky-500 to-blue-700',
  'from-slate-600 to-slate-900',
  'from-cyan-500 to-teal-700',
  'from-blue-400 to-indigo-600',
  'from-cyan-300 to-blue-500',
  'from-violet-500 to-blue-700',
  'from-amber-300 to-orange-500',
  'from-emerald-400 to-teal-600',
  'from-stone-500 to-stone-800',
  'from-amber-600 to-stone-800',
  'from-zinc-700 to-blue-900',
  'from-rose-400 to-pink-700',
]

export const ECOMMERCE_ICONS = [
  '🛍️',
  '👟',
  '👕',
  '📱',
  '💻',
  '🎧',
  '🏠',
  '☕',
  '💄',
  '🎒',
  '⌚',
  '🧴',
  '🧊',
  '📚',
  '🎮',
  '🧳',
]

function withIcons(products: CatalogProduct[]): CatalogProduct[] {
  const icons = ['🛍️', '👟', '👕', '📱', '🧊', '🛏️', '🥤', '💻', '💡', '📦', '☕', '🫘', '🏃', '🎒', '👚']
  return products.map((p, i) => ({
    ...p,
    icon: p.icon || icons[i % icons.length]!,
    brand: p.brand || p.name.slice(0, 2),
    stock: p.stock ?? 1000,
  }))
}

const seededProducts: CatalogProduct[] = withIcons(
  PRODUCT_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    icon: '',
    price: p.price,
    originalPrice: p.originalPrice,
    sellingPoints: [...p.sellingPoints],
    category: p.category,
    imageTone: p.imageTone,
    stock: p.stock,
  })),
)

const seededRecs: Record<string, string[]> = {}
for (const [newsId, list] of Object.entries(PRODUCTS_BY_NEWS)) {
  seededRecs[newsId] = list.map((p) => p.id)
}

export const DEFAULT_SOURCES: NewsSourceConfig[] = [
  {
    id: 'src-weibo',
    name: '微博热搜',
    kind: 'builtin',
    endpoint: 'weibo',
    enabled: true,
    builtin: true,
  },
  {
    id: 'src-toutiao',
    name: '今日头条热榜',
    kind: 'builtin',
    endpoint: 'toutiao',
    enabled: true,
    builtin: true,
  },
  {
    id: 'src-zhihu',
    name: '知乎热榜',
    kind: 'builtin',
    endpoint: 'zhihu',
    enabled: true,
    builtin: true,
  },
  {
    id: 'src-douyin',
    name: '抖音热点',
    kind: 'builtin',
    endpoint: 'douyin',
    enabled: false,
    builtin: true,
  },
]

export const DEFAULT_EVAL: EvalSettings = {
  machineWeight: 0.5,
  reviewWeight: 0.5,
  charMin: 80,
  charMax: 180,
  maxTags: 3,
  emojiMin: 1,
  emojiMax: 6,
  unitPrice: 0.002,
}

export const DEFAULT_EVAL_CASES: EvalCase[] = [
  {
    id: 'case-1',
    name: '国潮运动夹克',
    enabled: true,
    tone: '热点借势',
    newsTitle: '巴黎奥运会闭幕，国潮运动风席卷社交平台',
    newsSummary:
      '闭幕式后「国潮运动」话题破 8 亿阅读，年轻用户密集讨论「赛场同款」与「日常可穿」运动穿搭。',
    newsTags: ['奥运会', '国潮', '运动穿搭'],
    productIds: ['p1'],
  },
  {
    id: 'case-2',
    name: '消暑风扇',
    enabled: true,
    tone: '促销导向',
    newsTitle: '高温橙色预警持续，消暑家电销量环比暴涨 240%',
    newsSummary: '多地气温破 38℃，风扇、制冷小家电搜索量激增。',
    newsTags: ['高温', '消暑', '家电'],
    productIds: ['p4'],
  },
]

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: 1,
  prompts: { ...DEFAULT_PROMPTS },
  creativeStyles: DEFAULT_CREATIVE_STYLES.map((s) => ({ ...s })),
  tonePresets: [...DEFAULT_TONE_PRESETS],
  model: { ...DEFAULT_MODEL },
  products: seededProducts.map((p) => ({
    ...p,
    sellingPoints: [...p.sellingPoints],
  })),
  newsRecommendations: { ...seededRecs },
  sources: DEFAULT_SOURCES.map((s) => ({ ...s })),
  eval: { ...DEFAULT_EVAL },
  evalCases: DEFAULT_EVAL_CASES.map((c) => ({
    ...c,
    newsTags: [...c.newsTags],
    productIds: [...c.productIds],
  })),
}

/** 占位符清单（插入用） */
export const PLACEHOLDERS: { key: string; label: string; hint: string }[] = [
  { key: 'news_title', label: '热点标题', hint: '当前热点的标题' },
  { key: 'news_summary', label: '热点摘要', hint: '热点摘要文案' },
  { key: 'news_tags', label: '话题标签', hint: '用顿号拼接的标签' },
  { key: 'tone', label: '主打语调', hint: '运营选择的语调' },
  { key: 'style_name', label: '风格名称', hint: '当前创作风格名' },
  {
    key: 'style_instruction',
    label: '风格要求',
    hint: '当前创作风格的创作要求',
  },
  {
    key: 'product_list',
    label: '商品清单',
    hint: '按「单件呈现格式」渲染后拼接',
  },
  { key: 'product_name', label: '商品名称', hint: '单件：名称' },
  { key: 'product_brand', label: '商品品牌', hint: '单件：品牌' },
  { key: 'product_icon', label: '商品图标', hint: '单件：表情图标' },
  { key: 'product_price', label: '售价', hint: '单件：售价数字' },
  {
    key: 'product_original_price',
    label: '原价',
    hint: '单件：原价（可配合条件块）',
  },
  {
    key: 'product_selling_points',
    label: '卖点',
    hint: '单件：卖点顿号拼接',
  },
  { key: 'product_category', label: '品类', hint: '单件：品类' },
]
