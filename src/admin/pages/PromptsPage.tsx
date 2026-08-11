import { useMemo, useRef, useState } from 'react'
import type { AppConfig, CatalogProduct, CreativeStyle } from '../../config/types'
import { DEFAULT_PROMPTS, PLACEHOLDERS } from '../../config/defaults'
import {
  buildMaterialPrompt,
  countChars,
} from '../../services/promptEngine'
import {
  accessModeLabel,
  callChatModel,
  FriendlyLlmError,
  resolveSceneTemperature,
} from '../../services/llmClient'
import { AdminSectionCard, FieldError, insertAtCursor } from '../shared'

interface Props {
  draft: AppConfig
  onChange: (next: AppConfig) => void
}

export function PromptsPage({ draft, onChange }: Props) {
  const roleRef = useRef<HTMLTextAreaElement>(null)
  const materialRef = useRef<HTMLTextAreaElement>(null)
  const productRef = useRef<HTMLTextAreaElement>(null)
  const [activeField, setActiveField] = useState<
    'systemRole' | 'materialTemplate' | 'productItemFormat'
  >('materialTemplate')

  const [sampleTone, setSampleTone] = useState(
    draft.tonePresets[0] ?? '热点借势',
  )
  const [sampleStyleId, setSampleStyleId] = useState(
    draft.creativeStyles[0]?.id ?? '',
  )
  const [sampleProductIds, setSampleProductIds] = useState<string[]>(
    draft.products.slice(0, 1).map((p) => p.id),
  )
  const [trialBusy, setTrialBusy] = useState(false)
  const [trialResult, setTrialResult] = useState<string | null>(null)
  const [trialMeta, setTrialMeta] = useState<string | null>(null)
  const [trialError, setTrialError] = useState<string | null>(null)

  const [gateTrialBusy, setGateTrialBusy] = useState(false)
  const [gateTrialResult, setGateTrialResult] = useState<string | null>(null)
  const [gateTrialError, setGateTrialError] = useState<string | null>(null)
  const [matchTrialBusy, setMatchTrialBusy] = useState(false)
  const [matchTrialResult, setMatchTrialResult] = useState<string | null>(null)
  const [matchTrialError, setMatchTrialError] = useState<string | null>(null)

  const sampleNews = {
    title: '巴黎奥运会闭幕，国潮运动风席卷社交平台',
    summary:
      '闭幕式后「国潮运动」话题破 8 亿阅读，年轻用户密集讨论「赛场同款」与「日常可穿」运动穿搭。',
    tags: ['奥运会', '国潮', '运动穿搭'],
  }

  const style =
    draft.creativeStyles.find((s) => s.id === sampleStyleId) ??
    draft.creativeStyles[0]

  const sampleProducts: CatalogProduct[] = draft.products.filter((p) =>
    sampleProductIds.includes(p.id),
  )

  const materialPreview = useMemo(
    () =>
      buildMaterialPrompt(draft.prompts.materialTemplate, {
        newsTitle: sampleNews.title,
        newsSummary: sampleNews.summary,
        newsTags: sampleNews.tags,
        tone: sampleTone,
        styleName: style?.name ?? '',
        styleInstruction: style?.instruction ?? '',
        products: sampleProducts.length
          ? sampleProducts
          : draft.products.slice(0, 1),
        productItemFormat: draft.prompts.productItemFormat,
      }),
    [
      draft.prompts.materialTemplate,
      draft.prompts.productItemFormat,
      draft.products,
      sampleTone,
      style,
      sampleProducts,
      sampleNews.title,
      sampleNews.summary,
      sampleNews.tags,
    ],
  )

  const patchPrompts = (patch: Partial<AppConfig['prompts']>) => {
    onChange({ ...draft, prompts: { ...draft.prompts, ...patch } })
  }

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`
    if (activeField === 'systemRole') {
      insertAtCursor(roleRef.current, token, draft.prompts.systemRole, (v) =>
        patchPrompts({ systemRole: v }),
      )
    } else if (activeField === 'materialTemplate') {
      insertAtCursor(
        materialRef.current,
        token,
        draft.prompts.materialTemplate,
        (v) => patchPrompts({ materialTemplate: v }),
      )
    } else {
      insertAtCursor(
        productRef.current,
        token,
        draft.prompts.productItemFormat,
        (v) => patchPrompts({ productItemFormat: v }),
      )
    }
  }

  const updateStyle = (id: string, patch: Partial<CreativeStyle>) => {
    onChange({
      ...draft,
      creativeStyles: draft.creativeStyles.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    })
  }

  const addStyle = () => {
    const id = `style-${Date.now()}`
    onChange({
      ...draft,
      creativeStyles: [
        ...draft.creativeStyles,
        {
          id,
          name: '新风格',
          instruction: '描述该风格的写作要求',
        },
      ],
    })
  }

  const removeStyle = (id: string) => {
    if (draft.creativeStyles.length <= 1) {
      window.alert('至少保留一种创作风格')
      return
    }
    onChange({
      ...draft,
      creativeStyles: draft.creativeStyles.filter((s) => s.id !== id),
    })
  }

  const moveStyle = (id: string, dir: -1 | 1) => {
    const idx = draft.creativeStyles.findIndex((s) => s.id === id)
    if (idx < 0) return
    const next = [...draft.creativeStyles]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    onChange({ ...draft, creativeStyles: next })
  }

  const addTone = () => {
    const name = window.prompt('输入新语调名称')
    if (!name?.trim()) return
    if (draft.tonePresets.includes(name.trim())) {
      window.alert('该语调已存在')
      return
    }
    onChange({
      ...draft,
      tonePresets: [...draft.tonePresets, name.trim()],
    })
  }

  const removeTone = (tone: string) => {
    onChange({
      ...draft,
      tonePresets: draft.tonePresets.filter((t) => t !== tone),
    })
  }

  const runTrial = async () => {
    setTrialBusy(true)
    setTrialError(null)
    setTrialResult(null)
    setTrialMeta(null)
    try {
      const result = await callChatModel(
        draft.model,
        [
          { role: 'system', content: draft.prompts.systemRole },
          { role: 'user', content: materialPreview },
        ],
        { temperature: resolveSceneTemperature(draft.model, 'creative') },
      )
      setTrialResult(result.content)
      const usage = result.usage?.totalTokens
        ? `${result.usage.totalTokens} tokens`
        : '未知'
      setTrialMeta(
        [
          result.mocked
            ? '本地模拟输出（非真实模型）'
            : '真实模型调用',
          `模式：${accessModeLabel(result.mode)}`,
          `模型：${result.model}`,
          `延迟：${result.latencyMs}ms`,
          `用量：${usage}`,
        ].join(' · '),
      )
    } catch (err) {
      const msg =
        err instanceof FriendlyLlmError
          ? err.message
          : err instanceof Error
            ? err.message
            : '试运行失败'
      setTrialError(msg)
    } finally {
      setTrialBusy(false)
    }
  }

  const gateUserText = useMemo(() => {
    const list = [
      {
        id: 'demo-1',
        title: sampleNews.title,
        summary: sampleNews.summary,
        tags: sampleNews.tags,
        source: '微博热搜',
        category: '体育/潮流',
      },
      {
        id: 'demo-2',
        title: '某公众人物卷入严重争议事件登上热搜',
        summary: '舆论高度敏感，品牌需谨慎评估是否适合借势。',
        tags: ['舆论', '争议'],
        source: '社会',
        category: '社会',
      },
    ]
    return draft.prompts.newsGateUserTemplate.replace(
      /\{\{news_list_json\}\}/g,
      JSON.stringify(list, null, 2),
    )
  }, [draft.prompts.newsGateUserTemplate, sampleNews])

  const matchUserText = useMemo(() => {
    const catalog = draft.products.slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      price: p.price,
      sellingPoints: p.sellingPoints,
    }))
    return draft.prompts.productMatchUserTemplate
      .replace(/\{\{news_title\}\}/g, sampleNews.title)
      .replace(/\{\{news_summary\}\}/g, sampleNews.summary)
      .replace(/\{\{news_tags\}\}/g, sampleNews.tags.join('、'))
      .replace(/\{\{news_source\}\}/g, '微博热搜')
      .replace(/\{\{news_category\}\}/g, '体育/潮流')
      .replace(/\{\{catalog_json\}\}/g, JSON.stringify(catalog, null, 2))
  }, [draft.prompts.productMatchUserTemplate, draft.products, sampleNews])

  const runGateTrial = async () => {
    setGateTrialBusy(true)
    setGateTrialError(null)
    setGateTrialResult(null)
    try {
      const result = await callChatModel(
        draft.model,
        [
          { role: 'system', content: draft.prompts.newsGateSystemRole },
          { role: 'user', content: gateUserText },
        ],
        { temperature: resolveSceneTemperature(draft.model, 'newsGate') },
      )
      setGateTrialResult(
        `${result.mocked ? '【模拟】' : ''}延迟 ${result.latencyMs}ms\n\n${result.content}`,
      )
    } catch (err) {
      setGateTrialError(
        err instanceof Error ? err.message : '借势审核试运行失败',
      )
    } finally {
      setGateTrialBusy(false)
    }
  }

  const runMatchTrial = async () => {
    setMatchTrialBusy(true)
    setMatchTrialError(null)
    setMatchTrialResult(null)
    try {
      const result = await callChatModel(
        draft.model,
        [
          { role: 'system', content: draft.prompts.productMatchSystemRole },
          { role: 'user', content: matchUserText },
        ],
        { temperature: resolveSceneTemperature(draft.model, 'productMatch') },
      )
      setMatchTrialResult(
        `${result.mocked ? '【模拟】' : ''}延迟 ${result.latencyMs}ms\n\n${result.content}`,
      )
    } catch (err) {
      setMatchTrialError(
        err instanceof Error ? err.message : '商品匹配试运行失败',
      )
    } finally {
      setMatchTrialBusy(false)
    }
  }

  return (
    <>
      <AdminSectionCard
        id="role"
        title="角色与写作规范"
        description="对模型的 system 角色设定与写作约束"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={() =>
              patchPrompts({ systemRole: DEFAULT_PROMPTS.systemRole })
            }
          >
            恢复默认
          </button>
        }
      >
        <textarea
          ref={roleRef}
          value={draft.prompts.systemRole}
          onFocus={() => setActiveField('systemRole')}
          onChange={(e) => patchPrompts({ systemRole: e.target.value })}
          rows={12}
          className="w-full rounded-lg border border-surface-300 bg-white p-3 text-sm leading-relaxed"
        />
      </AdminSectionCard>

      <AdminSectionCard
        id="material"
        title="素材拼装模板"
        description="每次调用时用占位符拼装热点与商品素材（user 消息）"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={() =>
              patchPrompts({
                materialTemplate: DEFAULT_PROMPTS.materialTemplate,
              })
            }
          >
            恢复默认
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <textarea
            ref={materialRef}
            value={draft.prompts.materialTemplate}
            onFocus={() => setActiveField('materialTemplate')}
            onChange={(e) =>
              patchPrompts({ materialTemplate: e.target.value })
            }
            rows={14}
            className="w-full rounded-lg border border-surface-300 bg-white p-3 font-mono text-[13px] leading-relaxed"
          />
          <PlaceholderPanel onInsert={insertPlaceholder} />
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="product-format"
        title="单件商品格式"
        description="商品清单占位符内每一件商品的呈现格式，支持条件块"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={() =>
              patchPrompts({
                productItemFormat: DEFAULT_PROMPTS.productItemFormat,
              })
            }
          >
            恢复默认
          </button>
        }
      >
        <textarea
          ref={productRef}
          value={draft.prompts.productItemFormat}
          onFocus={() => setActiveField('productItemFormat')}
          onChange={(e) =>
            patchPrompts({ productItemFormat: e.target.value })
          }
          rows={8}
          className="w-full rounded-lg border border-surface-300 bg-white p-3 font-mono text-[13px]"
        />
      </AdminSectionCard>

      <AdminSectionCard
        id="styles"
        title="创作风格"
        description="至少保留一种风格；工作台可切换并影响生成结果"
      >
        <div className="space-y-3">
          {draft.creativeStyles.map((s, i) => (
            <div
              key={s.id}
              className="rounded-lg border border-surface-200 bg-surface-50/80 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => updateStyle(s.id, { name: e.target.value })}
                  className="rounded-md border border-surface-300 px-2 py-1 text-sm font-semibold"
                />
                <button
                  type="button"
                  className="text-xs text-surface-700"
                  onClick={() => moveStyle(s.id, -1)}
                  disabled={i === 0}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="text-xs text-surface-700"
                  onClick={() => moveStyle(s.id, 1)}
                  disabled={i === draft.creativeStyles.length - 1}
                >
                  下移
                </button>
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-rose-600"
                  onClick={() => removeStyle(s.id)}
                >
                  删除
                </button>
              </div>
              <textarea
                value={s.instruction}
                onChange={(e) =>
                  updateStyle(s.id, { instruction: e.target.value })
                }
                rows={2}
                className="w-full rounded-md border border-surface-300 bg-white p-2 text-sm"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addStyle}
            className="rounded-lg border border-dashed border-brand-400 px-3 py-2 text-sm font-semibold text-brand-600"
          >
            + 添加风格
          </button>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="tones"
        title="语调预设"
        description="工作台生成时可选的主打语调标签"
      >
        <div className="flex flex-wrap gap-2">
          {draft.tonePresets.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-sm text-brand-800"
            >
              {t}
              <button
                type="button"
                className="text-brand-600/70 hover:text-rose-600"
                onClick={() => removeTone(t)}
                aria-label={`删除 ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={addTone}
            className="rounded-md border border-dashed border-surface-300 px-2.5 py-1 text-sm text-surface-700"
          >
            + 添加
          </button>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="preview"
        title="实时预览与试运行"
        description="查看最终发给模型的内容，或用当前配置试调一次"
      >
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            语调
            <select
              value={sampleTone}
              onChange={(e) => setSampleTone(e.target.value)}
              className="rounded-md border border-surface-300 px-2 py-1"
            >
              {draft.tonePresets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            风格
            <select
              value={style?.id ?? ''}
              onChange={(e) => setSampleStyleId(e.target.value)}
              className="rounded-md border border-surface-300 px-2 py-1"
            >
              {draft.creativeStyles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            示例商品
            <select
              value={sampleProductIds[0] ?? ''}
              onChange={(e) => setSampleProductIds([e.target.value])}
              className="rounded-md border border-surface-300 px-2 py-1"
            >
              {draft.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <PreviewBlock
            title="预览（system）"
            text={draft.prompts.systemRole}
          />
          <PreviewBlock title="预览（user）" text={materialPreview} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={trialBusy}
            onClick={() => void runTrial()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {trialBusy ? '试运行中…' : '试运行'}
          </button>
          {draft.model.mode === 'mock' && (
            <span className="text-xs text-amber-700">
              当前为本地模拟，结果不代表真实模型效果
            </span>
          )}
        </div>
        {trialMeta && (
          <p className="mt-2 text-xs text-surface-700/70">{trialMeta}</p>
        )}
        {trialError && <FieldError message={trialError} />}
        {trialResult && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-3 text-sm">
            {trialResult}
          </pre>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        id="news-gate"
        title="借势硬边界审核"
        description="新闻抓取后批量审核是否适合品牌借势；命中风险的新闻会标注「需人工审核」"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={() =>
              patchPrompts({
                newsGateSystemRole: DEFAULT_PROMPTS.newsGateSystemRole,
                newsGateUserTemplate: DEFAULT_PROMPTS.newsGateUserTemplate,
              })
            }
          >
            恢复默认
          </button>
        }
      >
        <label className="mb-3 block text-sm font-medium">
          System（审核角色）
          <textarea
            value={draft.prompts.newsGateSystemRole}
            onChange={(e) =>
              patchPrompts({ newsGateSystemRole: e.target.value })
            }
            rows={10}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 font-mono text-[13px] leading-relaxed"
          />
        </label>
        <label className="mb-3 block text-sm font-medium">
          User 模板（可用 {'{{news_list_json}}'}）
          <textarea
            value={draft.prompts.newsGateUserTemplate}
            onChange={(e) =>
              patchPrompts({ newsGateUserTemplate: e.target.value })
            }
            rows={5}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 font-mono text-[13px]"
          />
        </label>
        <PreviewBlock title="预览（user）" text={gateUserText} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={gateTrialBusy}
            onClick={() => void runGateTrial()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {gateTrialBusy ? '试运行中…' : '试运行审核'}
          </button>
          {draft.model.mode === 'mock' && (
            <span className="text-xs text-amber-700">
              mock 模式下工作台走关键词规则；此处试运行仍可看模型拼装效果
            </span>
          )}
        </div>
        {gateTrialError && <FieldError message={gateTrialError} />}
        {gateTrialResult && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-3 text-sm">
            {gateTrialResult}
          </pre>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        id="product-match"
        title="商品智能匹配"
        description="建议匹配步：按热点从商品库挑选商品；可在此改提示词并试运行验证 JSON"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={() =>
              patchPrompts({
                productMatchSystemRole: DEFAULT_PROMPTS.productMatchSystemRole,
                productMatchUserTemplate:
                  DEFAULT_PROMPTS.productMatchUserTemplate,
              })
            }
          >
            恢复默认
          </button>
        }
      >
        <label className="mb-3 block text-sm font-medium">
          System（选品角色）
          <textarea
            value={draft.prompts.productMatchSystemRole}
            onChange={(e) =>
              patchPrompts({ productMatchSystemRole: e.target.value })
            }
            rows={8}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 font-mono text-[13px] leading-relaxed"
          />
        </label>
        <label className="mb-3 block text-sm font-medium">
          User 模板（{'{{news_*}}'} / {'{{catalog_json}}'}）
          <textarea
            value={draft.prompts.productMatchUserTemplate}
            onChange={(e) =>
              patchPrompts({ productMatchUserTemplate: e.target.value })
            }
            rows={10}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 font-mono text-[13px]"
          />
        </label>
        <PreviewBlock title="预览（user）" text={matchUserText} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={matchTrialBusy}
            onClick={() => void runMatchTrial()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {matchTrialBusy ? '试运行中…' : '试运行匹配'}
          </button>
        </div>
        {matchTrialError && <FieldError message={matchTrialError} />}
        {matchTrialResult && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-3 text-sm">
            {matchTrialResult}
          </pre>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        id="rewrite"
        title="返工与评审提示词"
        description="用于自动返工与模型评审打分的额外指令"
      >
        <label className="mb-3 block text-sm font-medium">
          返工说明
          <textarea
            value={draft.prompts.rewriteInstructions}
            onChange={(e) =>
              patchPrompts({ rewriteInstructions: e.target.value })
            }
            rows={4}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium">
          评审提示词
          <textarea
            value={draft.prompts.reviewPrompt}
            onChange={(e) => patchPrompts({ reviewPrompt: e.target.value })}
            rows={4}
            className="mt-1 w-full rounded-lg border border-surface-300 p-2 text-sm"
          />
        </label>
      </AdminSectionCard>
    </>
  )
}

function PlaceholderPanel({ onInsert }: { onInsert: (key: string) => void }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 p-2">
      <div className="mb-2 px-1 text-[11px] font-semibold text-surface-700/60">
        占位符 · 点击插入
      </div>
      <ul className="max-h-[360px] space-y-1 overflow-y-auto">
        {PLACEHOLDERS.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => onInsert(p.key)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white"
            >
              <div className="font-mono text-[11px] text-brand-700">
                {`{{${p.key}}}`}
              </div>
              <div className="text-[11px] text-surface-700/70">
                {p.label} · {p.hint}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PreviewBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-surface-700">
        <span>{title}</span>
        <span className="text-surface-700/55">{countChars(text)} 字</span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-surface-800">
        {text}
      </pre>
    </div>
  )
}
