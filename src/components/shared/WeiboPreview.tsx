import type { NewsItem, Product, ReviewStatus } from '../../types/workflow'

interface WeiboPreviewProps {
  content: string
  news: NewsItem
  product: Product
  authorName: string
  status: ReviewStatus
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '未审核',
  approved: '已通过',
  published: '已发布',
}

export function WeiboPreview({
  content,
  news,
  product,
  authorName,
  status,
}: WeiboPreviewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
            {authorName.slice(0, 1)}
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-900">{authorName}</div>
            <div className="text-[11px] text-surface-700/55">刚刚 · 来自 TrendWave</div>
          </div>
        </div>
        <span
          className={[
            'rounded-md px-2 py-0.5 text-[11px] font-semibold',
            status === 'published'
              ? 'bg-emerald-100 text-emerald-700'
              : status === 'approved'
                ? 'bg-brand-100 text-brand-700'
                : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-surface-900">
          {content}
        </p>
        <div className="overflow-hidden rounded-xl border border-surface-200">
          <div
            className={`flex h-36 items-end bg-gradient-to-br ${product.imageTone} p-4`}
          >
            <div className="text-white">
              <div className="text-xs opacity-80">{product.brand}</div>
              <div className="font-display text-lg font-semibold">{product.name}</div>
              <div className="mt-1 text-sm font-medium">¥{product.price}</div>
            </div>
          </div>
          <div className="bg-surface-50 px-3 py-2 text-[11px] text-surface-700/70">
            关联热点：{news.title}
          </div>
        </div>
      </div>

      <div className="flex border-t border-surface-100 text-center text-xs text-surface-700/60">
        <div className="flex-1 py-2.5">转发</div>
        <div className="flex-1 border-x border-surface-100 py-2.5">评论</div>
        <div className="flex-1 py-2.5">赞</div>
      </div>
    </div>
  )
}
