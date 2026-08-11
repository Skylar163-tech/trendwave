import { useEffect, useId, useState, type ReactNode } from 'react'
import { useIntegration } from '../../context/IntegrationContext'
import { MOCK_NEWS, PRODUCTS_BY_NEWS } from '../../data/mock'
import { extractWorkflowId, runCozeWorkflow } from '../../services/cozeWorkflow'
import { runCozePipeline } from '../../services/cozePipeline'
import {
  DEFAULT_INTEGRATION_CONFIG,
  type IntegrationConfig,
  type IntegrationMode,
} from '../../types/integration'
import { PIPELINE_OUTPUT_CONTRACT } from '../../types/pipeline'

const MODE_OPTIONS: { value: IntegrationMode; label: string; hint: string }[] =
  [
    {
      value: 'mock',
      label: '本地模拟',
      hint: '不调用外部接口，适合演示',
    },
    {
      value: 'workflow',
      label: '扣子工作流',
      hint: '方案 A：立即抓取一次跑完「新闻→匹配→文案」',
    },
    {
      value: 'llm',
      label: 'LLM API（暂不使用）',
      hint: 'DeepSeek 已在扣子工作流内调用时可忽略',
    },
  ]

export function IntegrationSettingsModal() {
  const { settingsOpen, closeSettings, config, saveConfig, clearAll } =
    useIntegration()
  const titleId = useId()
  const [draft, setDraft] = useState<IntegrationConfig>(config)
  const [showKey, setShowKey] = useState(false)
  const [savedTip, setSavedTip] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)

  useEffect(() => {
    if (settingsOpen) {
      setDraft(config)
      setShowKey(false)
      setSavedTip(false)
      setTestMessage(null)
    }
  }, [settingsOpen, config])

  if (!settingsOpen) return null

  function update<K extends keyof IntegrationConfig>(
    key: K,
    value: IntegrationConfig[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleWorkflowUrlChange(value: string) {
    const id = extractWorkflowId(value)
    setDraft((prev) => ({
      ...prev,
      workflowUrl: value,
      workflowId: id || prev.workflowId,
    }))
  }

  function normalizedDraft(): IntegrationConfig {
    const workflowId =
      draft.workflowId.trim() || extractWorkflowId(draft.workflowUrl)
    return {
      ...draft,
      workflowUrl: draft.workflowUrl.trim(),
      workflowId,
      workflowInputKey: draft.workflowInputKey.trim() || 'input',
      llmBaseUrl: draft.llmBaseUrl.trim().replace(/\/$/, ''),
      llmModel: draft.llmModel.trim(),
      apiKey: draft.apiKey.trim(),
    }
  }

  function handleSave() {
    saveConfig(normalizedDraft())
    setSavedTip(true)
    setTimeout(() => {
      setSavedTip(false)
      closeSettings()
    }, 600)
  }

  function handleClear() {
    if (!window.confirm('确认清除本机保存的全部集成配置（含 API Key）？')) {
      return
    }
    clearAll()
    setDraft({ ...DEFAULT_INTEGRATION_CONFIG })
    setTestMessage(null)
  }

  async function handleTest() {
    const next = normalizedDraft()
    setTesting(true)
    setTestMessage(null)
    setTestOk(false)
    try {
      // 方案 A：优先按全流程解析验证
      const pipeline = await runCozePipeline(next)
      const newsCount = pipeline.newsList.length
      const productCount = Object.values(pipeline.productsByNewsId).flat().length
      const copyCount = Object.values(pipeline.copyVariantsByNewsId).flat().length
      const preview =
        pipeline.newsList[0]?.title ??
        pipeline.copyVariantsByNewsId[pipeline.newsList[0]?.id ?? '']?.[0]
          ?.content?.slice(0, 80) ??
        ''
      setTestOk(true)
      setTestMessage(
        `连通成功（全流程解析）：新闻 ${newsCount} · 商品 ${productCount} · 文案 ${copyCount}。\n预览：${preview}${
          preview.length >= 80 ? '…' : ''
        }${pipeline.warning ? `\n注意：${pipeline.warning}` : ''}${
          pipeline.debugUrl ? `\n调试：${pipeline.debugUrl}` : ''
        }`,
      )
      setDraft(next)
    } catch (pipelineErr) {
      // 回退：旧版「仅文案」探测，便于排查
      try {
        const news = MOCK_NEWS[0]
        const product = PRODUCTS_BY_NEWS[news.id]?.[0]
        if (!product) throw pipelineErr
        const result = await runCozeWorkflow(news, product, next)
        const preview = result.texts[0]?.slice(0, 120) ?? ''
        setTestOk(true)
        setTestMessage(
          `全流程解析未通过（${
            pipelineErr instanceof Error ? pipelineErr.message : '未知'
          }），但按文案模式解析到 ${result.texts.length} 段文本。\n预览：${preview}${
            preview.length >= 120 ? '…' : ''
          }\n请调整结束节点为方案 A 的 JSON 结构。${
            result.debugUrl ? `\n调试：${result.debugUrl}` : ''
          }`,
        )
        setDraft(next)
      } catch (err) {
        setTestOk(false)
        setTestMessage(err instanceof Error ? err.message : '测试失败')
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-surface-950/45 backdrop-blur-[2px]"
        aria-label="关闭配置"
        onClick={closeSettings}
      />

      <div className="relative z-[1] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl animate-fade-up">
        <div className="flex items-start justify-between gap-3 border-b border-surface-100 px-5 py-4">
          <div>
            <h2
              id={titleId}
              className="font-display text-lg font-semibold text-surface-900"
            >
              集成配置
            </h2>
            <p className="mt-0.5 text-xs text-surface-700/65">
              扣子令牌仅保存在本机浏览器，不会写入代码仓库。
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-lg px-2 py-1 text-sm text-surface-700 hover:bg-surface-100"
          >
            关闭
          </button>
        </div>

        <div className="scrollbar-thin space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
            <strong>安全提示：</strong>
            请使用扣子「个人访问令牌」（一般以 <code>pat_</code>{' '}
            开头）。DeepSeek Key 配在扣子工作流节点内即可，无需在本页 LLM
            再填一遍。
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-surface-900">
              调用模式
            </legend>
            <div className="grid gap-2">
              {MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
                    draft.mode === opt.value
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/20'
                      : 'border-surface-200 hover:border-brand-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="integration-mode"
                    className="mt-1"
                    checked={draft.mode === opt.value}
                    onChange={() => update('mode', opt.value)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-surface-900">
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-surface-700/60">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.mode === 'workflow' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-brand-900">
                <p className="font-semibold">方案 A · 全流程灌入</p>
                <p className="mt-1 text-brand-900/80">
                  「立即抓取」会调用本工作流，并把返回结果写入新闻 / 商品 / 文案步骤。结束节点请尽量输出如下
                  JSON（也可包在 output 字符串里）：
                </p>
                <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-white/80 p-2 font-mono text-[10px] text-surface-800">
                  {PIPELINE_OUTPUT_CONTRACT}
                </pre>
              </div>
              <Field
                label="编排页链接（可粘贴）"
                hint="粘贴 coze.cn/work_flow?workflow_id=... 会自动提取 ID；实际请求走本地代理 /coze-api"
              >
                <input
                  type="url"
                  value={draft.workflowUrl}
                  onChange={(e) => handleWorkflowUrlChange(e.target.value)}
                  placeholder="https://www.coze.cn/work_flow?workflow_id=..."
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
              <Field
                label="工作流 ID"
                hint="必填；可从上方链接自动带出"
              >
                <input
                  type="text"
                  value={draft.workflowId}
                  onChange={(e) => update('workflowId', e.target.value)}
                  placeholder="767196429769056...."
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
              <Field
                label="开始节点输入变量名"
                hint="需与扣子开始节点一致，常见为 input"
              >
                <input
                  type="text"
                  value={draft.workflowInputKey}
                  onChange={(e) => update('workflowInputKey', e.target.value)}
                  placeholder="input"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {draft.mode === 'llm' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-[11px] text-surface-700/70">
                当前推荐只用「扣子工作流」。若 DeepSeek 已在工作流内配置，此处可留空。
              </div>
              <Field label="LLM Base URL" hint="OpenAI 兼容，无需末尾斜杠">
                <input
                  type="url"
                  value={draft.llmBaseUrl}
                  onChange={(e) => update('llmBaseUrl', e.target.value)}
                  placeholder="https://api.deepseek.com"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
              <Field label="模型名称">
                <input
                  type="text"
                  value={draft.llmModel}
                  onChange={(e) => update('llmModel', e.target.value)}
                  placeholder="deepseek-chat"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {draft.mode !== 'mock' && (
            <Field
              label={
                draft.mode === 'workflow'
                  ? '扣子个人访问令牌'
                  : 'API Key / Access Token'
              }
              hint="仅存 localStorage；扣子令牌通常以 pat_ 开头"
            >
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={(e) => update('apiKey', e.target.value)}
                  placeholder={
                    draft.mode === 'workflow' ? 'pat_xxxxxxxx' : 'sk-xxxxxxxx'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0 rounded-lg border border-surface-300 px-3 text-xs font-medium text-surface-800 hover:bg-surface-50"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </Field>
          )}

          {draft.mode === 'workflow' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={testing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
              >
                {testing ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin-slow rounded-full border-2 border-brand-300 border-t-brand-600" />
                    正在调用扣子…
                  </>
                ) : (
                  '测试调用工作流'
                )}
              </button>
              {testMessage && (
                <pre
                  className={[
                    'whitespace-pre-wrap rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
                    testOk
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  {testMessage}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-100 px-5 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            清除本机配置
          </button>
          <div className="flex items-center gap-2">
            {savedTip && (
              <span className="text-xs font-medium text-emerald-600">已保存</span>
            )}
            <button
              type="button"
              onClick={closeSettings}
              className="rounded-lg border border-surface-300 px-3.5 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-surface-900">{label}</span>
      {hint && (
        <span className="block text-[11px] text-surface-700/55">{hint}</span>
      )}
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500/25 placeholder:text-surface-700/35 focus:border-brand-400 focus:ring-2'
