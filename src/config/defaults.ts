import type {
  AppConfig,
  CatalogProduct,
  CreativeStyle,
  EvalCase,
  EvalSettings,
  ModelConfig,
  ModelTemperatures,
  NewsSourceConfig,
  PromptConfig,
} from './types'
import { PRODUCT_CATALOG, PRODUCTS_BY_NEWS } from '../data/mock'

const DEFAULT_SYSTEM_ROLE = `你是严谨的电商文案撰写专家，擅长撰写适合新浪微博传播与商品转化的营销文案草稿。

# 目标
根据已选定的热点与商品素材，写出供人工审核的微博文案；热点只作为真实使用场景，不要生硬复述整条新闻，也不要强行蹭敏感话题。

# 写作规范
1. 只输出一条纯文本文案；可适当使用 Emoji；带 1～3 个话题标签#。
2. 写完自查字数，必须控制在 80～180 字；超了就删，宁可少写一个卖点也不能超。
3. 金额、折扣、销量、库存、活动只能原样使用素材里明确给出的数字；素材没给的一律不许出现或编造。
4. 禁止广告法极限词与无法证实的表达：最佳、最好、最低、第一、国家级、顶级、绝对、永久、百分百、全网最低、唯一、首选、冠军、领导品牌、完美、万能、绝对有效等。
5. 不夸大、不虚构功效，不制造焦虑；不承诺素材未提供的效果。
6. 结尾要有互动引导（评论/转发/投票等）。
7. 不要输出 markdown、代码块、标题字段、分析过程或「推荐决策」等结构化报告；只输出最终微博正文。
8. 结果仅供运营初稿，默认发布前仍需人工核验新闻事实、库存、价格、活动与品牌风险。

范例（符合全部约束）：
#国潮运动# 热搜都在聊赛场同款，这件夹克真的很适合跟风出片 🔥
透气速干，国潮印花限定，活动价 ¥399。
你更 pick 赛场风还是日常风？评论区告诉我 💬`

const DEFAULT_MATERIAL_TEMPLATE = `请基于以下素材创作一条适合微博传播与转化的营销文案。
创作风格要求：{{style_instruction}}
主打语调：{{tone}}

【热点】
标题：{{news_title}}
摘要：{{news_summary}}
话题标签：{{news_tags}}

【商品信息】
{{product_list}}

要求：先捕捉热点中的真实使用场景，再落到商品卖点；关联要自然。只输出微博正文，不要前言后语。`

const DEFAULT_PRODUCT_ITEM_FORMAT = `· 【{{product_brand}} {{product_name}}】{{product_icon}}
  售价：¥{{product_price}}{{#product_original_price}}（原价 ¥{{product_original_price}}）{{/product_original_price}}
  卖点：{{product_selling_points}}
  品类：{{product_category}}{{#product_monthly_sales}}
  近月销量：{{product_monthly_sales}}{{/product_monthly_sales}}{{#product_return_rate}}
  退货率：{{product_return_rate}}{{/product_return_rate}}{{#product_gross_margin}}
  毛利率：{{product_gross_margin}}{{/product_gross_margin}}`

const DEFAULT_REWRITE_INSTRUCTIONS = `请根据下列校验失败项修改文案，只修指出的问题，不要大幅改写无关部分。
改完后再次自查字数与金额，确保全部符合素材；仍禁止极限词与编造未给出的经营数据。
只输出修改后的纯文本文案，不要解释。`

const DEFAULT_REVIEW_PROMPT = `你是微博营销文案评审。请对文案打分，只输出 JSON（不要 markdown）：
{"relevance":1-5,"fidelity":1-5,"appeal":1-5,"naturalness":1-5,"comment":"一句点评"}
维度：热点关联度、素材还原度、传播吸引力、语气自然度。若存在硬蹭敏感新闻、夸大承诺或编造未给出价格/功效，相应维度应明显扣分。`

const DEFAULT_NEWS_GATE_SYSTEM = `你是新闻安全与借势合规审核员。任务不是强行蹭热点，而是判断新闻是否适合进行电商借势营销。

# 判断流程
1. 先判断是否涉及灾难、伤亡、暴力、公共安全事故、重大疾病恐慌、未成年人伤害、战争冲突、违法犯罪受害者等不适合商业营销的敏感内容。
2. 再判断是否涉及政治、政策、国际关系、选举、军事、恐怖袭击、名人丑闻/自杀、宗教民族对立、歧视仇恨、色情赌博、未证实谣言、极易引发品牌道德绑架的争议。
3. 凡命中以上任一类，必须标记 needs_review；不得为了完成营销任务放行。
4. 一般消费、文体、科技、生活潮流、天气穿搭等存在自然消费场景的热点，可标记 clear。
5. 信息不完整但未见硬敏感时，可 clear，并在 reason 中注明「信息不足，建议人工再确认」。

# 输出规则
只输出 JSON（不要 markdown），格式：
{"results":[{"id":"新闻id","status":"clear|needs_review","categories":["灾难伤亡"],"reason":"一句话说明"}]}
categories 在 clear 时可为空数组；reason 始终用中文。
categories 可用：政治、灾难伤亡、公共安全、暴力犯罪、未成年人、战争冲突、敏感舆论、宗教民族、其他敏感。
不得输出分析过程、关键词列表或商品推荐。`

const DEFAULT_NEWS_GATE_USER = `请审核下列热点是否适合电商借势营销（禁止利用灾难伤亡或公共安全事件做营销）：

{{news_list_json}}`

const DEFAULT_PRODUCT_MATCH_SYSTEM = `你是从新闻中寻找适合商品的选品专家。任务不是硬凑关联，而是在关联真实、自然时，从企业商品库中选出可借势种草的真实商品。

# 判断流程
1. 阅读热点标题与摘要，分析其中是否存在明确、自然的消费需求或使用场景（例如降温→保暖衣物/热饮；运动话题→运动装备；早餐场景→食品饮品等）。食物/日用等消费场景优先，但不限于食品。
2. 若热点本身不适合营销（灾难伤亡、暴力、公共安全事故等），或没有自然商品需求，或信息不足导致无法判断：返回空数组 matches。
3. 只有关联真实时，才从商品库 id 中选择；禁止编造 id、商品名、价格、销量、退货率、毛利率、功效、库存、折扣或活动。
4. 相关性成立的前提下，再比较经营指标：优先近月销量较高、退货率较低、毛利率合理的商品。经营指标只能辅助排序，不能压过新闻与商品的相关性。
5. 按综合相关度排序，最多返回 6 个；都不合适则返回空数组。

# 输出规则
score 为 0～100 的整数；reason 用一句中文说明「新闻需求 ↔ 商品」的自然关联（可点出经营指标）。
只输出 JSON（不要 markdown）：
{"matches":[{"productId":"p1","score":88,"reason":"降温场景需要保暖，该品类匹配且近月销量较好"}]}`

const DEFAULT_PRODUCT_MATCH_USER = `【热点】
标题：{{news_title}}
摘要：{{news_summary}}
标签：{{news_tags}}
来源：{{news_source}}
品类：{{news_category}}

【商品库候选】
{{catalog_json}}

请只从上述候选的 id 中选择，返回匹配结果 JSON。若不应推荐，返回 {"matches":[]}。`

export const DEFAULT_PROMPTS: PromptConfig = {
  systemRole: DEFAULT_SYSTEM_ROLE,
  materialTemplate: DEFAULT_MATERIAL_TEMPLATE,
  productItemFormat: DEFAULT_PRODUCT_ITEM_FORMAT,
  rewriteInstructions: DEFAULT_REWRITE_INSTRUCTIONS,
  reviewPrompt: DEFAULT_REVIEW_PROMPT,
  newsGateSystemRole: DEFAULT_NEWS_GATE_SYSTEM,
  newsGateUserTemplate: DEFAULT_NEWS_GATE_USER,
  productMatchSystemRole: DEFAULT_PRODUCT_MATCH_SYSTEM,
  productMatchUserTemplate: DEFAULT_PRODUCT_MATCH_USER,
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

export const DEFAULT_MODEL_TEMPERATURES: ModelTemperatures = {
  creative: 0.8,
  newsGate: 0.1,
  productMatch: 0.2,
  review: 0.2,
}

export const DEFAULT_MODEL: ModelConfig = {
  mode: 'mock',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  apiKey: '',
  temperature: DEFAULT_MODEL_TEMPERATURES.creative,
  temperatures: { ...DEFAULT_MODEL_TEMPERATURES },
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
  { key: 'news_source', label: '热点来源', hint: '信源名称' },
  { key: 'news_category', label: '热点品类', hint: '热点分类' },
  {
    key: 'news_list_json',
    label: '热点列表 JSON',
    hint: '借势审核：批量新闻数组',
  },
  {
    key: 'catalog_json',
    label: '商品库 JSON',
    hint: '智能匹配：精简商品库',
  },
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
  {
    key: 'product_monthly_sales',
    label: '近月销量',
    hint: '单件：近月销量（可配合条件块）',
  },
  {
    key: 'product_return_rate',
    label: '退货率',
    hint: '单件：退货率百分比（可配合条件块）',
  },
  {
    key: 'product_gross_margin',
    label: '毛利率',
    hint: '单件：毛利率百分比（可配合条件块）',
  },
]
