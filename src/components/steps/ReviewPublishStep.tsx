import { CURRENT_USER } from '../../data/mock'
import { useWorkflow } from '../../context/WorkflowContext'
import { WeiboPreview } from '../shared/WeiboPreview'

export function ReviewPublishStep() {
  const {
    selectedNews,
    selectedProduct,
    selectedCopy,
    reviewStatus,
    approveCopy,
    publishCopy,
    resetPublish,
    setStep,
  } = useWorkflow()

  if (!selectedNews || !selectedProduct || !selectedCopy) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-300 bg-white/50">
        <p className="text-sm text-surface-700/70">请先完成文案创作</p>
        <button
          type="button"
          onClick={() => setStep('copy')}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white"
        >
          返回创作文案
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-surface-900">
          审核并发送
        </h2>
        <p className="mt-1 text-sm text-surface-700/65">
          预览微博卡片效果，完成合规审核后一键模拟发布。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <WeiboPreview
          content={selectedCopy.content}
          news={selectedNews}
          product={selectedProduct}
          authorName={CURRENT_USER.name}
          status={reviewStatus}
        />

        <div className="space-y-3">
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="text-sm font-semibold text-surface-900">合规检查（模拟）</div>
            <ul className="mt-3 space-y-2 text-xs text-surface-700/75">
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                无违禁词 / 极限词
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                商品价格信息与库一致
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                话题标签格式规范
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                含互动引导，利于传播
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-surface-900">发布操作</div>
            <div className="space-y-2">
              {reviewStatus === 'pending' && (
                <button
                  type="button"
                  onClick={approveCopy}
                  className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  审核通过
                </button>
              )}
              {reviewStatus === 'approved' && (
                <button
                  type="button"
                  onClick={publishCopy}
                  className="animate-pulse-ring w-full rounded-lg bg-surface-900 py-2.5 text-sm font-semibold text-white hover:bg-surface-800"
                >
                  一键发送（模拟）
                </button>
              )}
              {reviewStatus === 'published' && (
                <div className="space-y-2">
                  <div className="rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm font-semibold text-emerald-700">
                    已模拟发布成功 🎉
                  </div>
                  <button
                    type="button"
                    onClick={resetPublish}
                    className="w-full rounded-lg border border-surface-300 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50"
                  >
                    重置审核状态
                  </button>
                </div>
              )}
              {reviewStatus === 'approved' && (
                <button
                  type="button"
                  onClick={resetPublish}
                  className="w-full rounded-lg border border-surface-300 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50"
                >
                  撤回审核
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50/80 p-3 text-[11px] leading-relaxed text-surface-700/60">
            扩展预留：此处可对接微博开放平台 / 企业号 API，以及 Coze 工作流回调。
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep('copy')}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-100"
        >
          上一步
        </button>
        <button
          type="button"
          onClick={() => setStep('news')}
          className="rounded-lg border border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-surface-800 hover:bg-surface-50"
        >
          开始新一轮热点
        </button>
      </div>
    </div>
  )
}
