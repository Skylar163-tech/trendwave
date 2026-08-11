export type PipelineStep =
  | 'news'
  | 'suggest'
  | 'match'
  | 'copy'
  | 'review'

export type ReviewStatus = 'pending' | 'approved' | 'published'

/** 借势硬边界：LLM / 规则审核结果 */
export type NewsGateStatus =
  | 'pending'
  | 'clear'
  | 'needs_review'
  | 'error'

export interface NewsItem {
  id: string
  title: string
  source: string
  heat: number
  category: string
  summary: string
  publishedAt: string
  tags: string[]
  /** 借势合规审核状态 */
  gateStatus?: NewsGateStatus
  /** 命中的风险类别，如 政治、灾难、敏感人物 */
  gateCategories?: string[]
  /** 审核说明（展示给运营） */
  gateReason?: string
}

export interface Product {
  id: string
  name: string
  brand: string
  price: number
  originalPrice?: number
  matchScore: number
  sellingPoints: string[]
  category: string
  imageTone: string
  stock: number
  /** 电商表情图标（后台可配） */
  icon?: string
}

export interface CopyVariant {
  id: string
  label: string
  content: string
  tone: string
}

export interface WorkflowUser {
  name: string
  account: string
  role: string
  avatarInitials: string
  loggedIn: boolean
}

export interface PipelineStepMeta {
  id: PipelineStep
  index: number
  title: string
  short: string
  description: string
}
