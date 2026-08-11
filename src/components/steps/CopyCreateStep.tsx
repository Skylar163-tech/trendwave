import { useState } from 'react'
import { useWorkflow } from '../../context/WorkflowContext'
import { useAppConfig } from '../../context/AppConfigContext'
import { accessModeLabel } from '../../services/llmClient'

export function CopyCreateStep() {
  const {
    selectedNews,
    selectedProduct,
    copyVariants,
    selectedCopyId,
    selectedCopy,
    isGenerating,
    copySource,
    copyWarning,
    generateCopy,
    selectCopy,
    updateCopyContent,
    setStep,
    tonePresets,
    selectedTone,
    setSelectedTone,
  } = useWorkflow()
  const { config: appConfig } = useAppConfig()
  const [copied, setCopied] = useState(false)

  if (!selectedNews || !selectedProduct) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-300 bg-white/50">
        <p className="text-sm text-surface-700/70">请先完成热点与商品绑定</p>
        <button
          type="button"
          onClick={() => setStep(selectedNews ? 'match' : 'news')}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white"
        >
          返回完善上下文
        </button>
      </div>
    )
  }

  async function handleCopy() {
    if (!selectedCopy) return
    await navigator.clipboard.writeText(selectedCopy.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const modelMode = appConfig.model.mode
  const sourceHint =
    modelMode === 'mock'
      ? '当前为本地模拟（运营后台「模型」可切换真实调用）'
      : `将使用运营后台提示词 · ${accessModeLabel(modelMode)}`

  const sourceLabel =
    copySource === 'mock'
      ? '本地模拟'
      : copySource === 'proxy'
        ? '服务端中转'
        : copySource === 'direct'
          ? '浏览器直连'
          : copySource === 'llm'
            ? 'LLM API'
            : copySource === 'workflow'
              ? '工作流（遗留）'
              : null

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-surface-900">
            创作文案
          </h2>
          <p className="mt-1 text-sm text-surface-700/65">
            基于「热点 + 商品」与运营后台提示词 / 创作风格生成文案。
            <a
              href="#/admin/prompts"
              className="ml-1 font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              编辑提示词
            </a>
            <span className="ml-1 text-surface-700/45">· {sourceHint}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-surface-700">
            主打语调
            <select
              value={selectedTone}
              onChange={(e) => setSelectedTone(e.target.value)}
              className="rounded-lg border border-surface-300 bg-white px-2 py-1.5 text-sm"
            >
              {tonePresets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void generateCopy()}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-600 disabled:opacity-70"
          >
            {isGenerating ? (
              <>
                <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-white/30 border-t-white" />
                生成中…
              </>
            ) : copyVariants.length ? (
              '重新生成'
            ) : (
              '生成文案'
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-surface-200 bg-white/70 p-3 sm:grid-cols-2">
        <div className="text-xs leading-relaxed text-surface-700/75">
          <span className="font-semibold text-surface-900">热点：</span>
          {selectedNews.title}
        </div>
        <div className="text-xs leading-relaxed text-surface-700/75">
          <span className="font-semibold text-surface-900">商品：</span>
          {selectedProduct.brand} · {selectedProduct.name} · ¥
          {selectedProduct.price}
        </div>
      </div>

      {copyWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {copyWarning}
        </div>
      )}

      {sourceLabel && !isGenerating && (
        <div className="text-[11px] text-surface-700/55">
          来源：{sourceLabel}
        </div>
      )}

      {isGenerating && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-brand-200 bg-brand-50/40">
          <span className="h-8 w-8 animate-spin-slow rounded-full border-[3px] border-brand-200 border-t-brand-500" />
          <p className="text-sm font-medium text-brand-700">
            {modelMode === 'mock'
              ? '正在生成模拟文案…'
              : '正在按运营提示词请求模型…'}
          </p>
          <p className="text-xs text-brand-600/70">
            {modelMode === 'mock'
              ? '预计约 1 秒（本地模拟）'
              : `通道：${accessModeLabel(modelMode)}`}
          </p>
        </div>
      )}

      {!isGenerating && copyVariants.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-300 bg-white/50">
          <p className="text-sm text-surface-700/65">
            点击「生成文案」获取多风格营销版本
          </p>
        </div>
      )}

      {!isGenerating && copyVariants.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {copyVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => selectCopy(variant.id)}
                className={[
                  'w-full rounded-xl border px-3 py-3 text-left transition',
                  selectedCopyId === variant.id
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/20'
                    : 'border-surface-200 bg-white hover:border-brand-300',
                ].join(' ')}
              >
                <div className="text-[13px] font-semibold text-surface-900">
                  {variant.label}
                </div>
                <div className="mt-0.5 text-[11px] text-surface-700/55">
                  调性 · {variant.tone}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-surface-900">文案微调</div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded-md border border-surface-300 px-2.5 py-1 text-xs font-medium text-surface-800 hover:bg-surface-50"
              >
                {copied ? '已复制 ✓' : '一键复制'}
              </button>
            </div>
            <textarea
              value={selectedCopy?.content ?? ''}
              onChange={(e) => updateCopyContent(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-lg border border-surface-200 bg-surface-50/60 px-3 py-2.5 text-sm leading-relaxed text-surface-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-2 text-[11px] text-surface-700/50">
              纯文本输出，含话题标签 #、Emoji 与互动引导；可直接微调后进入审核。
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep('match')}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-100"
        >
          上一步
        </button>
        <button
          type="button"
          disabled={!selectedCopy}
          onClick={() => setStep('review')}
          className="rounded-lg bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：审核并发送
        </button>
      </div>
    </div>
  )
}
