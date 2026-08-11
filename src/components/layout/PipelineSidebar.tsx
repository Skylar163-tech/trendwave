import { PIPELINE_STEPS } from '../../data/mock'
import { useWorkflow } from '../../context/WorkflowContext'
import type { PipelineStep } from '../../types/workflow'

function stepStatus(
  id: PipelineStep,
  current: PipelineStep,
  canEnter: (s: PipelineStep) => boolean,
  selectedNews: boolean,
  selectedProduct: boolean,
  hasCopy: boolean,
) {
  const order: PipelineStep[] = ['news', 'suggest', 'match', 'copy', 'review']
  const curIdx = order.indexOf(current)
  const idx = order.indexOf(id)

  let done = false
  if (id === 'news') done = selectedNews && curIdx > 0
  if (id === 'suggest') done = selectedProduct && curIdx > 1
  if (id === 'match') done = selectedProduct && curIdx > 2
  if (id === 'copy') done = hasCopy && curIdx > 3
  if (id === 'review') done = false

  const locked = !canEnter(id) && idx > curIdx
  const active = current === id
  return { done, locked, active }
}

export function PipelineSidebar() {
  const {
    step,
    setStep,
    canEnterStep,
    selectedNews,
    selectedProduct,
    selectedCopy,
  } = useWorkflow()

  return (
    <aside className="panel flex w-[240px] shrink-0 flex-col border-r border-surface-200/80">
      <div className="border-b border-surface-200/70 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-700/55">
          Pipeline
        </div>
        <div className="mt-1 font-display text-sm font-semibold text-surface-900">
          业务流导航
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 p-3" aria-label="流程步骤">
        {PIPELINE_STEPS.map((s) => {
          const { done, locked, active } = stepStatus(
            s.id,
            step,
            canEnterStep,
            Boolean(selectedNews),
            Boolean(selectedProduct),
            Boolean(selectedCopy),
          )

          return (
            <button
              key={s.id}
              type="button"
              disabled={locked}
              onClick={() => setStep(s.id)}
              className={[
                'group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all',
                active
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : locked
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:bg-surface-100 text-surface-800',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  active
                    ? 'bg-white/20 text-white'
                    : done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-surface-200 text-surface-700',
                ].join(' ')}
              >
                {done && !active ? '✓' : s.index}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">
                  {s.title}
                </span>
                <span
                  className={[
                    'mt-0.5 block text-[11px] leading-snug',
                    active ? 'text-white/75' : 'text-surface-700/60',
                  ].join(' ')}
                >
                  {s.description}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-surface-200/70 p-4 text-[11px] leading-relaxed text-surface-700/60">
        「立即抓取」可一次调用扣子全流程，结果灌入新闻 / 商品 / 文案；审核发送仍在本页完成。
      </div>
    </aside>
  )
}
