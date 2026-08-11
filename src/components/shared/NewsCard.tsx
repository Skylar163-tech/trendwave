import type { NewsItem } from '../../types/workflow'
import { gateBadgeLabel } from '../../services/newsGate'

interface NewsCardProps {
  news: NewsItem
  selected: boolean
  onSelect: () => void
}

function formatPublishedAt(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
  const gateLabel = gateBadgeLabel(news)
  const flagged =
    news.gateStatus === 'needs_review' || news.gateStatus === 'error'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex h-full w-full flex-col rounded-xl border p-4 text-left transition-all',
        selected
          ? flagged
            ? 'border-rose-500 bg-rose-50/70 shadow-sm ring-1 ring-rose-500/25'
            : 'border-brand-500 bg-brand-50/70 shadow-sm shadow-brand-500/15 ring-1 ring-brand-500/30'
          : flagged
            ? 'border-rose-200/90 bg-rose-50/40 hover:border-rose-300'
            : 'border-surface-200/90 bg-white/80 hover:border-brand-300 hover:bg-white',
      ].join(' ')}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded bg-surface-100 px-1.5 py-0.5 font-medium text-surface-700">
            {news.source}
          </span>
          <span className="text-surface-700/55">
            {formatPublishedAt(news.publishedAt)}
          </span>
          <span className="rounded bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-600">
            热度 {news.heat}
          </span>
        </div>
        {selected && (
          <span
            className={[
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white',
              flagged ? 'bg-rose-500' : 'bg-brand-500',
            ].join(' ')}
          >
            已选
          </span>
        )}
      </div>

      {(gateLabel || news.gateStatus === 'clear') && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
          {gateLabel && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
              {gateLabel}
            </span>
          )}
          {news.gateStatus === 'clear' && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
              审核通过
            </span>
          )}
        </div>
      )}

      <h3 className="font-display text-[15px] font-semibold leading-snug text-surface-900">
        {news.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-surface-700/70">
        {news.summary}
      </p>
      {flagged && news.gateReason && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-rose-700/90">
          {news.gateReason}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {news.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-surface-100 px-2 py-0.5 text-[11px] text-surface-700"
          >
            #{tag}
          </span>
        ))}
      </div>
    </button>
  )
}
