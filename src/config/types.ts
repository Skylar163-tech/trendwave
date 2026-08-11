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
}

export interface ModelConfig {
  mode: ModelAccessMode
  provider: string
  baseUrl: string
  modelName: string
  /** 仅存浏览器；服务端中转时密钥放服务端环境/配置 */
  apiKey: string
  temperature: number
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
