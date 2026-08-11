import { useWorkflow } from '../../context/WorkflowContext'
import { ProductCard } from '../shared/ProductCard'

export function SuggestMatchStep() {
  const {
    selectedNews,
    suggestedProducts,
    selectedProduct,
    selectProduct,
    setStep,
  } = useWorkflow()

  if (!selectedNews) {
    return (
      <EmptyHint
        title="请先选择热点新闻"
        actionLabel="返回新闻抓取"
        onAction={() => setStep('news')}
      />
    )
  }

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            建议匹配商品
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            系统根据「{selectedNews.tags.join(' / ')}」自动推荐匹配度最高的商品
            （来自立即抓取灌入的结果或本地演示数据）。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('match')}
          className="rounded-lg border border-surface-300 bg-white px-3.5 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50"
        >
          去深度筛选 →
        </button>
      </div>

      <div className="rounded-xl border border-brand-200/70 bg-brand-50/50 px-4 py-3 text-sm text-brand-800">
        热点摘要：{selectedNews.summary}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {suggestedProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            selected={selectedProduct?.id === product.id}
            onSelect={() => selectProduct(product)}
          />
        ))}
      </div>

      {suggestedProducts.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-center text-sm text-amber-900">
          暂无推荐商品。若刚跑过扣子全流程，多半是知识库未命中；可返回新闻步重新抓取，或检查扣子商品库。
        </div>
      )}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep('news')}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-100"
        >
          上一步
        </button>
        <button
          type="button"
          disabled={!selectedProduct}
          onClick={() => setStep('match')}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：确认匹配
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
