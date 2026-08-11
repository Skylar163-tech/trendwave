import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { MOCK_NEWS, PRODUCTS_BY_NEWS } from '../data/mock'
import { generateWeiboCopy, type CopySource } from '../services/copyGenerator'
import { runCozePipeline } from '../services/cozePipeline'
import { fetchEnabledNews } from '../services/newsSources'
import type {
  CopyVariant,
  NewsItem,
  PipelineStep,
  Product,
  ReviewStatus,
} from '../types/workflow'
import { isIntegrationReady } from '../types/integration'
import { useIntegration } from './IntegrationContext'
import { useAppConfig } from './AppConfigContext'
import type { CatalogProduct } from '../config/types'

interface WorkflowContextValue {
  step: PipelineStep
  setStep: (step: PipelineStep) => void
  isStepPending: boolean
  newsList: NewsItem[]
  selectedNews: NewsItem | null
  selectNews: (news: NewsItem) => void
  suggestedProducts: Product[]
  selectedProduct: Product | null
  selectProduct: (product: Product) => void
  catalogFilter: string
  setCatalogFilter: (value: string) => void
  filteredCatalog: Product[]
  copyVariants: CopyVariant[]
  selectedCopyId: string | null
  selectedCopy: CopyVariant | null
  isGenerating: boolean
  copySource: CopySource | null
  copyWarning: string | null
  generateCopy: () => Promise<void>
  selectCopy: (id: string) => void
  updateCopyContent: (content: string) => void
  /** 方案 A：立即抓取 → 一次调用全流程工作流 */
  isFetchingPipeline: boolean
  pipelineWarning: string | null
  pipelineSource: 'mock' | 'workflow' | null
  lastFetchedAt: string
  fetchPipeline: () => Promise<void>
  reviewStatus: ReviewStatus
  approveCopy: () => void
  publishCopy: () => void
  resetPublish: () => void
  canEnterStep: (step: PipelineStep) => boolean
  tonePresets: string[]
  selectedTone: string
  setSelectedTone: (tone: string) => void
  productCatalog: Product[]
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

const STEP_ORDER: PipelineStep[] = [
  'news',
  'suggest',
  'match',
  'copy',
  'review',
]

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function catalogToProduct(p: CatalogProduct, matchScore = 80): Product {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    originalPrice: p.originalPrice,
    matchScore,
    sellingPoints: [...p.sellingPoints],
    category: p.category,
    imageTone: p.imageTone,
    stock: p.stock,
    icon: p.icon,
  } as Product & { icon: string }
}

function buildProductsByNews(
  recommendations: Record<string, string[]>,
  catalog: CatalogProduct[],
): Record<string, Product[]> {
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const out: Record<string, Product[]> = {}
  for (const [newsId, ids] of Object.entries(recommendations)) {
    out[newsId] = ids
      .map((id, i) => {
        const p = byId.get(id)
        if (!p) return null
        return catalogToProduct(p, Math.max(70, 98 - i * 5))
      })
      .filter((p): p is Product => Boolean(p))
  }
  // 若无推荐关系，回退 mock 映射中仍存在于商品库的项
  if (!Object.keys(out).length) {
    for (const [newsId, list] of Object.entries(PRODUCTS_BY_NEWS)) {
      out[newsId] = list
        .map((p) => {
          const c = byId.get(p.id)
          return c ? catalogToProduct(c, p.matchScore) : p
        })
        .filter(Boolean)
    }
  }
  return out
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { config } = useIntegration()
  const { config: appConfig } = useAppConfig()
  const [step, setStepState] = useState<PipelineStep>('news')
  const [isStepPending, startStepTransition] = useTransition()
  const [newsList, setNewsList] = useState<NewsItem[]>(MOCK_NEWS)
  const [productsByNewsId, setProductsByNewsId] = useState<
    Record<string, Product[]>
  >(() =>
    buildProductsByNews(
      appConfig.newsRecommendations,
      appConfig.products,
    ),
  )
  const [selectedTone, setSelectedTone] = useState(
    () => appConfig.tonePresets[0] ?? '热点借势',
  )
  const [copyVariantsByNewsId, setCopyVariantsByNewsId] = useState<
    Record<string, CopyVariant[]>
  >({})
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [catalogFilter, setCatalogFilter] = useState('')
  const [copyVariants, setCopyVariants] = useState<CopyVariant[]>([])
  const [selectedCopyId, setSelectedCopyId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copySource, setCopySource] = useState<CopySource | null>(null)
  const [copyWarning, setCopyWarning] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('pending')
  const [isFetchingPipeline, setIsFetchingPipeline] = useState(false)
  const [pipelineWarning, setPipelineWarning] = useState<string | null>(null)
  const [pipelineSource, setPipelineSource] = useState<'mock' | 'workflow' | null>(
    null,
  )
  const [lastFetchedAt, setLastFetchedAt] = useState('尚未同步')

  // 后台商品库 / 推荐关系变更时同步工作台
  useEffect(() => {
    setProductsByNewsId(
      buildProductsByNews(appConfig.newsRecommendations, appConfig.products),
    )
  }, [appConfig.products, appConfig.newsRecommendations])

  useEffect(() => {
    if (
      appConfig.tonePresets.length &&
      !appConfig.tonePresets.includes(selectedTone)
    ) {
      setSelectedTone(appConfig.tonePresets[0]!)
    }
  }, [appConfig.tonePresets, selectedTone])

  const productCatalog = useMemo(
    () => appConfig.products.map((p) => catalogToProduct(p)),
    [appConfig.products],
  )

  const suggestedProducts = useMemo(() => {
    if (!selectedNews) return []
    const recommended = productsByNewsId[selectedNews.id]
    if (recommended?.length) return recommended
    // 无推荐关系时：按品类/标签简单匹配商品库
    const tags = new Set(selectedNews.tags.map((t) => t.toLowerCase()))
    return productCatalog
      .map((p) => {
        let score = 50
        if (tags.has(p.category.toLowerCase())) score += 20
        for (const sp of p.sellingPoints) {
          for (const t of tags) {
            if (sp.toLowerCase().includes(t) || p.name.toLowerCase().includes(t))
              score += 8
          }
        }
        return { ...p, matchScore: Math.min(99, score) }
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 6)
  }, [selectedNews, productsByNewsId, productCatalog])

  const filteredCatalog = useMemo(() => {
    const pool = suggestedProducts.length ? suggestedProducts : productCatalog
    const q = catalogFilter.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sellingPoints.some((s) => s.toLowerCase().includes(q)),
    )
  }, [suggestedProducts, catalogFilter, productCatalog])

  const selectedCopy = useMemo(
    () => copyVariants.find((v) => v.id === selectedCopyId) ?? null,
    [copyVariants, selectedCopyId],
  )

  const canEnterStep = useCallback(
    (target: PipelineStep) => {
      const targetIdx = STEP_ORDER.indexOf(target)
      if (targetIdx <= 0) return true
      if (targetIdx >= 1 && !selectedNews) return false
      if (targetIdx >= 2 && !selectedNews) return false
      if (targetIdx >= 3 && !selectedProduct) return false
      if (targetIdx >= 4 && !selectedCopy) return false
      return true
    },
    [selectedNews, selectedProduct, selectedCopy],
  )

  const setStep = useCallback(
    (next: PipelineStep) => {
      if (
        !canEnterStep(next) &&
        STEP_ORDER.indexOf(next) > STEP_ORDER.indexOf(step)
      ) {
        return
      }
      startStepTransition(() => {
        setStepState(next)
      })
    },
    [canEnterStep, step],
  )

  const selectNews = useCallback(
    (news: NewsItem) => {
      setSelectedNews(news)
      setSelectedProduct(null)
      setCatalogFilter('')
      setReviewStatus('pending')
      const cached = copyVariantsByNewsId[news.id]
      if (cached?.length) {
        setCopyVariants(cached)
        setSelectedCopyId(cached[0]?.id ?? null)
        setCopySource('workflow')
        setCopyWarning(null)
      } else {
        setCopyVariants([])
        setSelectedCopyId(null)
        setCopySource(null)
        setCopyWarning(null)
      }
    },
    [copyVariantsByNewsId],
  )

  const selectProduct = useCallback(
    (product: Product) => {
      setSelectedProduct(product)
      setReviewStatus('pending')
      // 全流程已带文案时保留；否则清空等待生成
      if (selectedNews) {
        const cached = copyVariantsByNewsId[selectedNews.id]
        if (cached?.length) {
          setCopyVariants(cached)
          setSelectedCopyId(cached[0]?.id ?? null)
          setCopySource('workflow')
          setCopyWarning(null)
          return
        }
      }
      setCopyVariants([])
      setSelectedCopyId(null)
      setCopySource(null)
      setCopyWarning(null)
    },
    [selectedNews, copyVariantsByNewsId],
  )

  const fetchPipeline = useCallback(async () => {
    setIsFetchingPipeline(true)
    setPipelineWarning(null)
    try {
      // 优先：按启用的抓取来源拉取（后台可配置）
      if (config.mode === 'mock' || !isIntegrationReady(config)) {
        const { news, warnings } = await fetchEnabledNews(appConfig.sources)
        await new Promise((r) => setTimeout(r, 400))
        setNewsList(news.length ? news : MOCK_NEWS)
        setProductsByNewsId(
          buildProductsByNews(
            appConfig.newsRecommendations,
            appConfig.products,
          ),
        )
        setCopyVariantsByNewsId({})
        setSelectedNews(null)
        setSelectedProduct(null)
        setCopyVariants([])
        setSelectedCopyId(null)
        setCopySource(null)
        setCopyWarning(null)
        setReviewStatus('pending')
        setPipelineSource('mock')
        setLastFetchedAt(nowLabel())
        const msgs = [...warnings]
        if (config.mode !== 'mock') {
          msgs.unshift(
            '集成配置不完整，已使用本地/配置来源热点。可在后台「模型接入」或顶栏集成配置中完善。',
          )
        }
        setPipelineWarning(msgs.length ? msgs.join('；') : null)
        return
      }

      const result = await runCozePipeline(config)
      setNewsList(result.newsList)
      setProductsByNewsId(result.productsByNewsId)
      setCopyVariantsByNewsId(result.copyVariantsByNewsId)
      setSelectedNews(null)
      setSelectedProduct(null)
      setCopyVariants([])
      setSelectedCopyId(null)
      setCopySource(null)
      setCopyWarning(null)
      setReviewStatus('pending')
      setPipelineSource('workflow')
      setLastFetchedAt(nowLabel())
      setPipelineWarning(result.warning ?? null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '工作流调用失败'
      setPipelineWarning(`${message}（仍显示当前列表）`)
    } finally {
      setIsFetchingPipeline(false)
    }
  }, [config, appConfig.sources, appConfig.newsRecommendations, appConfig.products])

  const generateCopy = useCallback(async () => {
    if (!selectedNews || !selectedProduct) return
    setIsGenerating(true)
    setCopyWarning(null)
    try {
      const result = await generateWeiboCopy(
        selectedNews,
        selectedProduct,
        config,
        appConfig,
        { tone: selectedTone, enableRework: true },
      )
      setCopyVariants(result.variants)
      setSelectedCopyId(result.variants[0]?.id ?? null)
      setCopySource(result.source)
      setCopyWarning(result.warning ?? null)
      setReviewStatus('pending')
    } finally {
      setIsGenerating(false)
    }
  }, [selectedNews, selectedProduct, config, appConfig, selectedTone])

  const selectCopy = useCallback((id: string) => {
    setSelectedCopyId(id)
    setReviewStatus('pending')
  }, [])

  const updateCopyContent = useCallback(
    (content: string) => {
      if (!selectedCopyId) return
      setCopyVariants((prev) =>
        prev.map((v) => (v.id === selectedCopyId ? { ...v, content } : v)),
      )
      setReviewStatus('pending')
    },
    [selectedCopyId],
  )

  const approveCopy = useCallback(() => {
    if (!selectedCopy) return
    setReviewStatus('approved')
  }, [selectedCopy])

  const publishCopy = useCallback(() => {
    if (reviewStatus !== 'approved') return
    setReviewStatus('published')
  }, [reviewStatus])

  const resetPublish = useCallback(() => {
    setReviewStatus('pending')
  }, [])

  const value = useMemo<WorkflowContextValue>(
    () => ({
      step,
      setStep,
      isStepPending,
      newsList,
      selectedNews,
      selectNews,
      suggestedProducts,
      selectedProduct,
      selectProduct,
      catalogFilter,
      setCatalogFilter,
      filteredCatalog,
      copyVariants,
      selectedCopyId,
      selectedCopy,
      isGenerating,
      copySource,
      copyWarning,
      generateCopy,
      selectCopy,
      updateCopyContent,
      isFetchingPipeline,
      pipelineWarning,
      pipelineSource,
      lastFetchedAt,
      fetchPipeline,
      reviewStatus,
      approveCopy,
      publishCopy,
      resetPublish,
      canEnterStep,
      tonePresets: appConfig.tonePresets,
      selectedTone,
      setSelectedTone,
      productCatalog,
    }),
    [
      step,
      setStep,
      isStepPending,
      newsList,
      selectedNews,
      selectNews,
      suggestedProducts,
      selectedProduct,
      selectProduct,
      catalogFilter,
      filteredCatalog,
      copyVariants,
      selectedCopyId,
      selectedCopy,
      isGenerating,
      copySource,
      copyWarning,
      generateCopy,
      selectCopy,
      updateCopyContent,
      isFetchingPipeline,
      pipelineWarning,
      pipelineSource,
      lastFetchedAt,
      fetchPipeline,
      reviewStatus,
      approveCopy,
      publishCopy,
      resetPublish,
      canEnterStep,
      appConfig.tonePresets,
      selectedTone,
      productCatalog,
    ],
  )

  return (
    <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
  )
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) {
    throw new Error('useWorkflow must be used within WorkflowProvider')
  }
  return ctx
}
