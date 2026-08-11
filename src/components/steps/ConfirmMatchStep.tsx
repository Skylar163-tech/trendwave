import { useEffect, useMemo, useState } from 'react'
import { useWorkflow } from '../../context/WorkflowContext'
import { ProductCard } from '../shared/ProductCard'

const PAGE_SIZE = 6

export function ConfirmMatchStep() {
  const {
    selectedNews,
    suggestedProducts,
    selectedProduct,
    selectProduct,
    setStep,
    catalogFilter,
    setCatalogFilter,
    filteredCatalog,
    matchReasons,
  } = useWorkflow()

  const [catalogPage, setCatalogPage] = useState(1)

  useEffect(() => {
    setCatalogPage(1)
  }, [catalogFilter, selectedNews?.id])

  const suggestedIds = useMemo(
    () => new Set(suggestedProducts.map((p) => p.id)),
    [suggestedProducts],
  )

  const supplementProducts = useMemo(
    () => filteredCatalog.filter((p) => !suggestedIds.has(p.id)),
    [filteredCatalog, suggestedIds],
  )

  const totalPages = Math.max(1, Math.ceil(supplementProducts.length / PAGE_SIZE))
  const safePage = Math.min(catalogPage, totalPages)
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return supplementProducts.slice(start, start + PAGE_SIZE)
  }, [supplementProducts, safePage])

  useEffect(() => {
    if (catalogPage > totalPages) setCatalogPage(totalPages)
  }, [catalogPage, totalPages])

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
    <div className="animate-fade-up space-y-5 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            确认匹配
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            审定最终投放商品：可保留 AI 采纳结果，或从商品库补选替换。
          </p>
        </div>
        {selectedProduct && (
          <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
            已绑定：{selectedProduct.name}
          </span>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-surface-900">AI 已建议</h3>
        {suggestedProducts.length > 0 ? (
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
        ) : (
          <div className="rounded-xl border border-dashed border-surface-300 bg-white/50 px-4 py-5 text-center text-sm text-surface-700/65">
            暂无 AI 建议清单，请在下方从商品库补选绑定。
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-surface-200/80 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-surface-900">全库补选</h3>
            <p className="mt-0.5 text-xs text-surface-700/55">
              搜索并绑定 AI 未覆盖的商品（每页 {PAGE_SIZE} 件）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              placeholder="搜索品牌 / 商品名 / 品类…"
              className="w-full min-w-[220px] max-w-md rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 placeholder:text-surface-700/40 focus:border-brand-400 focus:ring-2"
            />
            <span className="text-xs text-surface-700/55">
              共 {supplementProducts.length} 件
              {supplementProducts.length > 0
                ? ` · 第 ${safePage}/${totalPages} 页`
                : ''}
            </span>
          </div>
        </div>

        {supplementProducts.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pageSlice.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selectedProduct?.id === product.id}
                  onSelect={() => selectProduct(product)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-semibold text-surface-800 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="px-2 text-xs font-medium text-surface-700/70">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCatalogPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-semibold text-surface-800 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-surface-300 bg-white/50 px-4 py-6 text-center text-sm text-surface-700/65">
            {catalogFilter.trim()
              ? '没有符合搜索条件的其他商品'
              : '商品库中暂无更多可补选项（或均已出现在上方建议中）'}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-between gap-3 border-t border-surface-200/80 bg-surface-50/95 px-1 py-3 backdrop-blur-sm">
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
