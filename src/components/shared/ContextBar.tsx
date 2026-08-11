import { useWorkflow } from '../../context/WorkflowContext'

export function ContextBar() {
  const { selectedNews, selectedProduct, selectedCopy, reviewStatus, step } =
    useWorkflow()

  if (!selectedNews && step === 'news') return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-surface-200/80 bg-white/70 px-3 py-2 text-xs text-surface-700 animate-fade-up">
      <span className="font-semibold text-surface-900">当前上下文</span>
      <span className="text-surface-300">|</span>
      {selectedNews ? (
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-700">
          热点：{selectedNews.title.slice(0, 22)}
          {selectedNews.title.length > 22 ? '…' : ''}
        </span>
      ) : (
        <span className="text-surface-700/50">尚未选择热点</span>
      )}
      {selectedProduct && (
        <span className="rounded-md bg-surface-100 px-2 py-0.5">
          商品：{selectedProduct.name}
        </span>
      )}
      {selectedCopy && (
        <span className="rounded-md bg-surface-100 px-2 py-0.5">
          文案：{selectedCopy.label}
        </span>
      )}
      {step === 'review' && (
        <span
          className={[
            'rounded-md px-2 py-0.5 font-medium',
            reviewStatus === 'published'
              ? 'bg-emerald-100 text-emerald-700'
              : reviewStatus === 'approved'
                ? 'bg-brand-100 text-brand-700'
                : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {reviewStatus === 'published'
            ? '已发布'
            : reviewStatus === 'approved'
              ? '已通过'
              : '未审核'}
        </span>
      )}
    </div>
  )
}
