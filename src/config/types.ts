/** 三级配置来源 */
export type ConfigSource = 'server' | 'local' | 'default'

export type ModelAccessMode = 'mock' | 'proxy' | 'direct'

export interface CreativeStyle {
  id: string
  name: string
  instruction: string
}

export interface CatalogProduct {
  id: string
  name: string
  brand: string
  icon: string
  price: number
  originalPrice?: number
  sellingPoints: string[]
  category: string
  imageTone: string
  stock: number
  /** 近月销量或销售额（导入可选，用于匹配加权） */
  monthlySales?: number
  /** 退货率 0～1 */
  returnRate?: number
  /** 毛利率 0～1 */
  grossMargin?: number
}

export type NewsSourceKind = 'builtin' | 'rss'

export interface NewsSourceConfig {
  id: string
  name: string
  kind: NewsSourceKind
  /** builtin 平台标识或 rss URL */
  endpoint: string
  enabled: boolean
  builtin?: boolean
}

export interface PromptConfig {
  /** 角色设定与写作规范（system） */
  systemRole: string
  /** 素材拼装模板（user） */
  materialTemplate: string
  /** 单件商品呈现格式 */
  productItemFormat: string
  /** 自动返工说明 */
  rewriteInstructions: string
  /** 模型评审提示词 */
  reviewPrompt: string
  /** 热点借势硬边界：审核 system */
  newsGateSystemRole: string
  /** 热点借势硬边界：user 模板 */
  newsGateUserTemplate: string
  /** 商品智能匹配：system */
  productMatchSystemRole: string
  /** 商品智能匹配：user 模板 */
  productMatchUserTemplate: string
}

export interface ModelTemperatures {
  /** 文案创作（偏高更有创意） */
  creative: number
  /** 借势硬边界审核（偏低更稳定） */
  newsGate: number
  /** 商品智能匹配 */
  productMatch: number
  /** 返工与模型评审 */
  review: number
}

export interface ModelConfig {
  mode: ModelAccessMode
  provider: string
  baseUrl: string
  modelName: string
  /** 仅存浏览器；服务端中转时密钥放服务端环境/配置 */
  apiKey: string
  /**
   * 兼容旧配置：等同于 temperatures.creative。
   * 新逻辑请优先读 temperatures。
   */
  temperature: number
  /** 分场景温度（后台可调） */
  temperatures: ModelTemperatures
  stream: boolean
  /** 兼容扣子工作流 */
  workflowUrl: string
  workflowId: string
  workflowInputKey: string
}

export interface EvalSettings {
  machineWeight: number
  reviewWeight: number
  charMin: number
  charMax: number
  maxTags: number
  emojiMin: number
  emojiMax: number
  unitPrice: number
}

export interface EvalCase {
  id: string
  name: string
  enabled: boolean
  tone: string
  newsTitle: string
  newsSummary: string
  newsTags: string[]
  productIds: string[]
}

export interface AppConfig {
  version: 1
  prompts: PromptConfig
  creativeStyles: CreativeStyle[]
  tonePresets: string[]
  model: ModelConfig
  products: CatalogProduct[]
  /** 热点 id → 推荐商品 id 列表（引用关系） */
  newsRecommendations: Record<string, string[]>
  sources: NewsSourceConfig[]
  eval: EvalSettings
  evalCases: EvalCase[]
}

export interface LoadedConfig {
  config: AppConfig
  source: ConfigSource
}
