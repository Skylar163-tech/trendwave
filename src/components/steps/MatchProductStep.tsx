import { useWorkflow } from '../../context/WorkflowContext'
import { ProductCard } from '../shared/ProductCard'

export function MatchProductStep() {
  const {
    selectedNews,
    selectedProduct,
    selectProduct,
    catalogFilter,
    setCatalogFilter,
    filteredCatalog,
    setStep,
  } = useWorkflow()

  if (!selectedNews) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-300 bg-white/50">
        <p className="text-sm text-surface-700/70">请先选择热点新闻</p>
        <button
          type="button"
          onClick={() => setStep('news')}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white"
        >
          返回新闻抓取
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-surface-900">
          匹配商品
        </h2>
        <p className="mt-1 text-sm text-surface-700/65">
          手动/深度筛选商品库，绑定最终投放商品。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={catalogFilter}
          onChange={(e) => setCatalogFilter(e.target.value)}
          placeholder="搜索品牌 / 商品名 / 品类…"
          className="w-full max-w-md rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 placeholder:text-surface-700/40 focus:border-brand-400 focus:ring-2"
        />
        <span className="text-xs text-surface-700/55">
          {filteredCatalog.length} 件候选
        </span>
        {selectedProduct && (
          <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
            已绑定：{selectedProduct.name}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredCatalog.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            selected={selectedProduct?.id === product.id}
            onSelect={() => selectProduct(product)}
          />
        ))}
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep('suggest')}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-100"
        >
          上一步
        </button>
        <button
          type="button"
          disabled={!selectedProduct}
          onClick={() => setStep('copy')}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：创作文案
        </button>
      </div>
    </div>
  )
}
