import { useWorkflow } from '../../context/WorkflowContext'
import { isNewsGateFlagged } from '../../services/newsGate'
import { NewsCard } from '../shared/NewsCard'

export function NewsFetchStep() {
  const {
    newsList,
    selectedNews,
    selectNews,
    setStep,
    isFetchingPipeline,
    pipelineWarning,
    pipelineSource,
    lastFetchedAt,
    fetchPipeline,
  } = useWorkflow()

  const sourceLabel =
    pipelineSource === 'sources'
      ? '运营信源'
      : pipelineSource === 'fallback'
        ? '演示回退'
        : ''

  const flaggedSelected = isNewsGateFlagged(selectedNews)

  function handleNext() {
    if (!selectedNews) return
    if (flaggedSelected) {
      const cats = selectedNews.gateCategories?.length
        ? selectedNews.gateCategories.join('、')
        : '敏感/争议话题'
      const ok = window.confirm(
        `硬边界提醒：该热点需人工审核（涉及${cats}）。\n\n${selectedNews.gateReason ?? ''}\n\n确认仍要进入商品匹配并借势？`,
      )
      if (!ok) return
    }
    setStep('suggest')
  }

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            新闻抓取
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            按运营信源拉取热点后，自动做借势合规硬边界审核；高风险条目标注「需人工审核」。
            <a
              href="#/admin/prompts"
              className="ml-1 font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              调整审核提示词
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-700/55">
            上次同步 {lastFetchedAt}
            {sourceLabel ? ` · ${sourceLabel}` : ''}
          </span>
          <button
            type="button"
            onClick={() => void fetchPipeline()}
            disabled={isFetchingPipeline}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-600 disabled:opacity-60"
          >
            {isFetchingPipeline && (
              <span className="h-3.5 w-3.5 animate-spin-slow rounded-full border-2 border-white/30 border-t-white" />
            )}
            {isFetchingPipeline ? '抓取并审核…' : '立即抓取'}
          </button>
        </div>
      </div>

      {pipelineWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {pipelineWarning}
        </div>
      )}

      {flaggedSelected && selectedNews && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          当前所选热点需人工审核
          {selectedNews.gateCategories?.length
            ? `（涉及${selectedNews.gateCategories.join('、')}）`
            : ''}
          。进入下一步前会再次确认。
        </div>
      )}

      {isFetchingPipeline && (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40">
          <span className="h-7 w-7 animate-spin-slow rounded-full border-[3px] border-brand-200 border-t-brand-500" />
          <p className="text-sm font-medium text-brand-700">
            正在拉取热点并做借势硬边界审核…
          </p>
          <p className="text-xs text-brand-600/70">
            审核提示词可在运营后台「提示词」中调整与试运行
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {newsList.map((news) => (
          <NewsCard
            key={news.id}
            news={news}
            selected={selectedNews?.id === news.id}
            onSelect={() => selectNews(news)}
          />
        ))}
      </div>

      {!isFetchingPipeline && newsList.length === 0 && (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-surface-300 bg-white/50">
          <p className="text-sm text-surface-700/65">
            暂无热点，请点击「立即抓取」
          </p>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!selectedNews}
          onClick={handleNext}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：建议匹配
        </button>
      </div>
    </div>
  )
}
