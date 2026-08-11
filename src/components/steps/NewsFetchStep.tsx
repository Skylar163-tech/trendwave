import { useWorkflow } from '../../context/WorkflowContext'
import { useIntegration } from '../../context/IntegrationContext'
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
  const { config, isReady, openSettings } = useIntegration()

  const modeHint =
    config.mode === 'workflow' && isReady
      ? '将调用扣子全流程工作流（新闻 → 匹配 → 文案）'
      : config.mode === 'workflow' && !isReady
        ? '工作流配置不完整，将回退本地模拟'
        : '当前为本地模拟列表'

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            新闻抓取
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            {config.mode === 'workflow' && isReady
              ? '点击立即抓取，一次跑完扣子工作流并灌入后续步骤。'
              : '模拟实时热点列表；配置扣子工作流后可一键同步真实结果。'}
            <button
              type="button"
              onClick={openSettings}
              className="ml-1 font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              集成配置
            </button>
            <span className="ml-1 text-surface-700/45">· {modeHint}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-700/55">
            上次同步 {lastFetchedAt}
            {pipelineSource === 'workflow'
              ? ' · 工作流'
              : pipelineSource === 'mock'
                ? ' · 模拟'
                : ''}
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
            {isFetchingPipeline ? '抓取中…' : '立即抓取'}
          </button>
        </div>
      </div>

      {pipelineWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {pipelineWarning}
        </div>
      )}

      {isFetchingPipeline && (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40">
          <span className="h-7 w-7 animate-spin-slow rounded-full border-[3px] border-brand-200 border-t-brand-500" />
          <p className="text-sm font-medium text-brand-700">
            {config.mode === 'workflow' && isReady
              ? '正在调用扣子全流程工作流…'
              : '正在刷新模拟热点…'}
          </p>
          <p className="text-xs text-brand-600/70">
            耗时取决于工作流（含新闻插件、循环与大模型）
          </p>
        </div>
      )}

      <div className="grid gap-3">
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
          onClick={() => setStep('suggest')}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：查看建议匹配
        </button>
      </div>
    </div>
  )
}
