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
import { fetchEnabledNews } from '../services/newsSources'
import { runNewsGate } from '../services/newsGate'
import { matchProductsForNews } from '../services/productMatch'
import type {
  CopyVariant,
  NewsItem,
  PipelineStep,
  Product,
  ReviewStatus,
} from '../types/workflow'
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
  matchReasons: Record<string, string>
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
  isFetchingPipeline: boolean
  pipelineWarning: string | null
  pipelineSource: 'sources' | 'fallback' | null
  lastFetchedAt: string
  fetchPipeline: () => Promise<void>
  isMatchingProducts: boolean
  matchWarning: string | null
  matchSource: 'llm' | 'heuristic' | 'static' | 'empty' | null
  rematchProducts: () => Promise<void>
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
  }
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
  const { config: appConfig } = useAppConfig()
  const [step, setStepState] = useState<PipelineStep>('news')
  const [isStepPending, startStepTransition] = useTransition()
  const [newsList, setNewsList] = useState<NewsItem[]>(MOCK_NEWS)
  const [staticProductsByNewsId, setStaticProductsByNewsId] = useState<
    Record<string, Product[]>
  >(() =>
    buildProductsByNews(
      appConfig.newsRecommendations,
      appConfig.products,
    ),
  )
  /** LLM / 启发匹配覆盖静态推荐 */
  const [llmProductsByNewsId, setLlmProductsByNewsId] = useState<
    Record<string, Product[]>
  >({})
  const [matchReasonsByNewsId, setMatchReasonsByNewsId] = useState<
    Record<string, Record<string, string>>
  >({})
  const [selectedTone, setSelectedTone] = useState(
    () => appConfig.tonePresets[0] ?? '热点借势',
  )
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
  const [pipelineSource, setPipelineSource] = useState<
    'sources' | 'fallback' | null
  >(null)
  const [lastFetchedAt, setLastFetchedAt] = useState('尚未同步')
  const [isMatchingProducts, setIsMatchingProducts] = useState(false)
  const [matchWarning, setMatchWarning] = useState<string | null>(null)
  const [matchSource, setMatchSource] = useState<
    'llm' | 'heuristic' | 'static' | 'empty' | null
  >(null)

  useEffect(() => {
    setStaticProductsByNewsId(
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

  const productsByNewsId = useMemo(() => {
    return { ...staticProductsByNewsId, ...llmProductsByNewsId }
  }, [staticProductsByNewsId, llmProductsByNewsId])

  const suggestedProducts = useMemo(() => {
    if (!selectedNews) return []
    const recommended = productsByNewsId[selectedNews.id]
    if (recommended?.length) return recommended
    return []
  }, [selectedNews, productsByNewsId])

  const matchReasons = useMemo(() => {
    if (!selectedNews) return {}
    return matchReasonsByNewsId[selectedNews.id] ?? {}
  }, [selectedNews, matchReasonsByNewsId])

  /** 全库检索，供选品页「人工补选」 */
  const filteredCatalog = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase()
    if (!q) return productCatalog
    return productCatalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sellingPoints.some((s) => s.toLowerCase().includes(q)),
    )
  }, [catalogFilter, productCatalog])

  const selectedCopy = useMemo(
    () => copyVariants.find((v) => v.id === selectedCopyId) ?? null,
    [copyVariants, selectedCopyId],
  )

  const canEnterStep = useCallback(
    (target: PipelineStep) => {
      const targetIdx = STEP_ORDER.indexOf(target)
      if (targetIdx <= 0) return true
      if (targetIdx >= 1 && !selectedNews) return false
      // 确认匹配：至少选过热点；创作起需最终绑定商品
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

  const selectNews = useCallback((news: NewsItem) => {
    setSelectedNews(news)
    setSelectedProduct(null)
    setCatalogFilter('')
    setReviewStatus('pending')
    setCopyVariants([])
    setSelectedCopyId(null)
    setCopySource(null)
    setCopyWarning(null)
    setMatchWarning(null)
  }, [])

  const selectProduct = useCallback((product: Product) => {
    setSelectedProduct(product)
    setReviewStatus('pending')
    setCopyVariants([])
    setSelectedCopyId(null)
    setCopySource(null)
    setCopyWarning(null)
  }, [])

  const rematchProducts = useCallback(async () => {
    if (!selectedNews) return
    setIsMatchingProducts(true)
    setMatchWarning(null)
    try {
      const result = await matchProductsForNews(
        selectedNews,
        appConfig.products,
        appConfig,
      )
      const products = result.matches.map((m) => m.product)
      const reasons: Record<string, string> = {}
      for (const m of result.matches) {
        reasons[m.product.id] = m.reason
      }
      setLlmProductsByNewsId((prev) => ({
        ...prev,
        [selectedNews.id]: products,
      }))
      setMatchReasonsByNewsId((prev) => ({
        ...prev,
        [selectedNews.id]: reasons,
      }))
      setMatchSource(
        result.source === 'llm'
          ? 'llm'
          : result.source === 'heuristic'
            ? 'heuristic'
            : 'empty',
      )
      setMatchWarning(result.warning ?? null)
      if (
        selectedProduct &&
        !products.some((p) => p.id === selectedProduct.id)
      ) {
        setSelectedProduct(null)
      }
    } catch (err) {
      setMatchWarning(err instanceof Error ? err.message : '商品匹配失败')
    } finally {
      setIsMatchingProducts(false)
    }
  }, [selectedNews, appConfig, selectedProduct])

  const fetchPipeline = useCallback(async () => {
    setIsFetchingPipeline(true)
    setPipelineWarning(null)
    try {
      const { news, warnings } = await fetchEnabledNews(appConfig.sources)
      const usedFallback = !news.length
      const baseList = usedFallback ? MOCK_NEWS : news

      const gate = await runNewsGate(baseList, appConfig)
      setNewsList(gate.news)
      setStaticProductsByNewsId(
        buildProductsByNews(
          appConfig.newsRecommendations,
          appConfig.products,
        ),
      )
      setLlmProductsByNewsId({})
      setMatchReasonsByNewsId({})
      setMatchSource(null)
      setMatchWarning(null)
      setSelectedNews(null)
      setSelectedProduct(null)
      setCopyVariants([])
      setSelectedCopyId(null)
      setCopySource(null)
      setCopyWarning(null)
      setReviewStatus('pending')
      setPipelineSource(usedFallback ? 'fallback' : 'sources')
      setLastFetchedAt(nowLabel())

      const msgs = [...warnings]
      if (usedFallback) {
        msgs.push(
          '启用信源暂无有效条目，已回退演示热点列表。请在运营后台「信源」改用可访问的 RSS（如 https://www.36kr.com/feed）并点「测试全部来源」。',
        )
      }
      if (gate.flaggedCount > 0) {
        msgs.push(
          `借势硬边界：${gate.flaggedCount} 条热点需人工审核（已在卡片标注）。`,
        )
      }
      if (gate.warning) msgs.push(gate.warning)
      setPipelineWarning(msgs.length ? msgs.join('；') : null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '热点抓取失败'
      setPipelineWarning(`${message}（仍显示当前列表）`)
    } finally {
      setIsFetchingPipeline(false)
    }
  }, [appConfig])

  const generateCopy = useCallback(async () => {
    if (!selectedNews || !selectedProduct) return
    setIsGenerating(true)
    setCopyWarning(null)
    try {
      const result = await generateWeiboCopy(
        selectedNews,
        selectedProduct,
        null,
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
  }, [selectedNews, selectedProduct, appConfig, selectedTone])

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
      matchReasons,
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
      isMatchingProducts,
      matchWarning,
      matchSource,
      rematchProducts,
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
      matchReasons,
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
      isMatchingProducts,
      matchWarning,
      matchSource,
      rematchProducts,
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
