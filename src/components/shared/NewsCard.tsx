import type { NewsItem } from '../../types/workflow'

interface NewsCardProps {
  news: NewsItem
  selected: boolean
  onSelect: () => void
}

export function NewsCard({ news, selected, onSelect }: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-brand-500 bg-brand-50/70 shadow-sm shadow-brand-500/15 ring-1 ring-brand-500/30'
          : 'border-surface-200/90 bg-white/80 hover:border-brand-300 hover:bg-white',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded bg-surface-100 px-1.5 py-0.5 font-medium text-surface-700">
              {news.source}
            </span>
            <span className="text-surface-700/55">{news.publishedAt}</span>
            <span className="rounded bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-600">
              热度 {news.heat}
            </span>
          </div>
          <h3 className="font-display text-[15px] font-semibold leading-snug text-surface-900">
            {news.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-surface-700/70">
            {news.summary}
          </p>
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
        </div>
        {selected && (
          <span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            已选
          </span>
        )}
      </div>
    </button>
  )
}
