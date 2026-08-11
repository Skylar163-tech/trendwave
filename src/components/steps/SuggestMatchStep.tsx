import { useEffect, useRef } from 'react'
import { useWorkflow } from '../../context/WorkflowContext'
import { isNewsGateFlagged } from '../../services/newsGate'
import { ProductCard } from '../shared/ProductCard'

export function SuggestMatchStep() {
  const {
    selectedNews,
    suggestedProducts,
    selectedProduct,
    selectProduct,
    setStep,
    rematchProducts,
    isMatchingProducts,
    matchWarning,
    matchSource,
    matchReasons,
  } = useWorkflow()

  const autoStarted = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedNews) return
    if (autoStarted.current === selectedNews.id) return
    if (suggestedProducts.length === 0 || matchSource == null) {
      autoStarted.current = selectedNews.id
      void rematchProducts()
    } else {
      autoStarted.current = selectedNews.id
    }
  }, [selectedNews, rematchProducts, suggestedProducts.length, matchSource])

  if (!selectedNews) {
    return (
      <EmptyHint
        title="请先选择热点新闻"
        actionLabel="返回新闻抓取"
        onAction={() => setStep('news')}
      />
    )
  }

  const flagged = isNewsGateFlagged(selectedNews)
  const sourceLabel =
    matchSource === 'llm'
      ? 'LLM 匹配'
      : matchSource === 'heuristic'
        ? '规则降级'
        : matchSource === 'static'
          ? '后台静态推荐'
          : matchSource === 'empty'
            ? '无结果'
            : '待匹配'

  const canProceed =
    Boolean(selectedProduct) ||
    (!isMatchingProducts &&
      matchSource != null &&
      suggestedProducts.length === 0)

  return (
    <div className="animate-fade-up space-y-5 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            建议匹配
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            按热点调用可配置提示词，从商品库给出 AI 建议；点选采纳后进入确认匹配。
            <a
              href="#/admin/prompts"
              className="ml-1 font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              调整匹配提示词
            </a>
            <span className="ml-1 text-surface-700/45">· {sourceLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedProduct && (
            <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
              已采纳：{selectedProduct.name}
            </span>
          )}
          <button
            type="button"
            onClick={() => void rematchProducts()}
            disabled={isMatchingProducts}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            {isMatchingProducts && (
              <span className="h-3.5 w-3.5 animate-spin-slow rounded-full border-2 border-brand-300 border-t-brand-600" />
            )}
            {isMatchingProducts ? '匹配中…' : '重新 AI 匹配'}
          </button>
        </div>
      </div>

      {flagged && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          当前热点仍处于「需人工审核」状态
          {selectedNews.gateCategories?.length
            ? `（涉及${selectedNews.gateCategories.join('、')}）`
            : ''}
          ，匹配结果仅供参考，请谨慎借势。
        </div>
      )}

      {matchWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {matchWarning}
        </div>
      )}

      <div className="rounded-xl border border-brand-200/70 bg-brand-50/50 px-4 py-3 text-sm text-brand-800">
        热点摘要：{selectedNews.summary}
      </div>

      {isMatchingProducts && (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40">
          <span className="h-7 w-7 animate-spin-slow rounded-full border-[3px] border-brand-200 border-t-brand-500" />
          <p className="text-sm font-medium text-brand-700">
            正在根据热点匹配商品库…
          </p>
        </div>
      )}

      {!isMatchingProducts && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suggestedProducts.map((product) => (
            <div key={product.id} className="space-y-1.5">
              <ProductCard
                product={product}
                selected={selectedProduct?.id === product.id}
                onSelect={() => selectProduct(product)}
              />
              {matchReasons[product.id] && (
                <p className="px-1 text-[11px] leading-relaxed text-surface-700/60">
                  匹配理由：{matchReasons[product.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!isMatchingProducts && suggestedProducts.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-center text-sm text-amber-900">
          暂无 AI 建议。可点「重新 AI 匹配」，或进入确认匹配从商品库补选。
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-between gap-3 border-t border-surface-200/80 bg-surface-50/95 px-1 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setStep('news')}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-100"
        >
          上一步
        </button>
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => setStep('match')}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selectedProduct
            ? '下一步：确认匹配'
            : '暂无建议，去确认页补选'}
        </button>
      </div>
    </div>
  )
}

function EmptyHint({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-300 bg-white/50">
      <p className="text-sm text-surface-700/70">{title}</p>
      <button
        type="button"
        onClick={onAction}
        className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white"
      >
        {actionLabel}
      </button>
    </div>
  )
}
