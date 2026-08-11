import type { CatalogProduct } from '../../config/types'

/** 与工作台商品卡视觉对齐：图标、渐变、卖点、价格、品类徽章 */
export function ProductCardView({
  product,
  selected,
  onClick,
  showCategory = false,
  showMatchScore = false,
}: {
  product: CatalogProduct & { matchScore?: number }
  selected?: boolean
  onClick?: () => void
  showCategory?: boolean
  showMatchScore?: boolean
}) {
  const className = [
    'flex w-full flex-col overflow-hidden rounded-xl border text-left transition-all',
    selected
      ? 'border-brand-500 shadow-md shadow-brand-500/15 ring-1 ring-brand-500/25'
      : 'border-surface-200/90 bg-white/80 hover:border-brand-300',
  ].join(' ')

  const body = (
    <>
      <div
        className={`relative flex h-28 items-end bg-gradient-to-br ${product.imageTone} p-3`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.25),transparent_45%)]" />
        <div className="relative z-[1] text-3xl drop-shadow">{product.icon}</div>
        <div className="relative z-[1] ml-2 font-display text-lg font-bold text-white/95 drop-shadow">
          {product.brand}
        </div>
        {showCategory && (
          <span className="absolute right-2 bottom-2 z-[1] rounded-md bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {product.category}
          </span>
        )}
        {showMatchScore && product.matchScore != null && (
          <span className="absolute right-2 top-2 z-[1] rounded-md bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            匹配 {product.matchScore}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 bg-white/90 p-3">
        <div>
          <div className="text-[13px] font-semibold leading-snug text-surface-900">
            {product.name}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-base font-bold text-brand-600">
              ¥{product.price}
            </span>
            {product.originalPrice != null && (
              <span className="text-xs text-surface-700/45 line-through">
                ¥{product.originalPrice}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {product.sellingPoints.map((point) => (
            <span
              key={point}
              className="rounded-md bg-surface-100 px-1.5 py-0.5 text-[11px] text-surface-700/80"
            >
              {point}
            </span>
          ))}
        </div>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}
