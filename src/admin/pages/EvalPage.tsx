import { useMemo, useRef, useState, Fragment } from 'react'
import type { AppConfig, EvalCase } from '../../config/types'
import {
  materialFromProducts,
  runMachineChecks,
  type MachineCheckResult,
} from '../../services/copyQA'
import {
  autoReworkCopy,
  composeTotalScore,
  reviewCopyWithModel,
  type ReviewScores,
} from '../../services/copyReview'
import { buildMaterialPrompt } from '../../services/promptEngine'
import { callChatModel } from '../../services/llmClient'
import { AdminSectionCard } from '../shared'

interface Props {
  draft: AppConfig
  onChange: (next: AppConfig) => void
}

interface EvalRow {
  caseId: string
  caseName: string
  styleId: string
  styleName: string
  repeat: number
  copy: string
  machine: MachineCheckResult
  review: ReviewScores | null
  total: number
  feedback?: 'up' | 'down'
  note?: string
  tokens?: number
  latencyMs?: number
}

interface RunRecord {
  id: string
  shortId: string
  at: string
  promptSnapshot: AppConfig['prompts']
  rows: EvalRow[]
  summary: ReturnType<typeof summarize>
}

const HISTORY_KEY = 'trendwave.eval.history.v1'

function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RunRecord[]
  } catch {
    return []
  }
}

function saveHistory(list: RunRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20)))
}

function summarize(rows: EvalRow[]) {
  const n = rows.length || 1
  const totalAvg = rows.reduce((s, r) => s + r.total, 0) / n
  const machinePass =
    rows.filter((r) => r.machine.passed).length / n
  const reviews = rows.filter((r) => r.review && !r.review.failed)
  const reviewAvg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => {
          const x = r.review!
          return (
            s +
            (x.relevance + x.fidelity + x.appeal + x.naturalness) / 4
          )
        }, 0) / reviews.length
  const forbiddenHits = rows.filter((r) =>
    r.machine.items.some((i) => i.id === 'forbidden' && !i.passed),
  ).length
  const priceHits = rows.filter((r) =>
    r.machine.items.some((i) => i.id === 'price' && !i.passed),
  ).length
  const tokens = rows.reduce((s, r) => s + (r.tokens ?? 0), 0)
  const latency = rows.reduce((s, r) => s + (r.latencyMs ?? 0), 0)
  return {
    totalAvg,
    machinePass,
    reviewAvg,
    forbiddenHits,
    priceHits,
    tokens,
    latency,
  }
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-700 bg-emerald-50'
  if (score >= 60) return 'text-amber-700 bg-amber-50'
  return 'text-rose-700 bg-rose-50'
}

export function EvalPage({ draft, onChange }: Props) {
  const [concurrency, setConcurrency] = useState(3)
  const [repeats, setRepeats] = useState(1)
  const [enableReview, setEnableReview] = useState(false)
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(
    () => new Set(draft.creativeStyles.map((s) => s.id)),
  )
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rows, setRows] = useState<EvalRow[]>([])
  const [history, setHistory] = useState<RunRecord[]>(() => loadHistory())
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [demoCheck, setDemoCheck] = useState<MachineCheckResult | null>(null)
  const [reworkLog, setReworkLog] = useState<string | null>(null)
  const abortRef = useRef(false)

  const enabledCases = draft.evalCases.filter((c) => c.enabled)
  const styleCount = [...selectedStyles].filter((id) =>
    draft.creativeStyles.some((s) => s.id === id),
  ).length
  const taskEstimate = enabledCases.length * styleCount * repeats
  const costEstimate = taskEstimate * draft.eval.unitPrice

  const patchCase = (id: string, patch: Partial<EvalCase>) => {
    onChange({
      ...draft,
      evalCases: draft.evalCases.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    })
  }

  const addCase = () => {
    onChange({
      ...draft,
      evalCases: [
        ...draft.evalCases,
        {
          id: `case-${Date.now()}`,
          name: '新用例',
          enabled: true,
          tone: draft.tonePresets[0] ?? '',
          newsTitle: '',
          newsSummary: '',
          newsTags: [],
          productIds: draft.products[0] ? [draft.products[0].id] : [],
        },
      ],
    })
  }

  const seedFromWorkbench = () => {
    const seeds = draft.products.slice(0, 3).map((p, i) => ({
      id: `seed-${Date.now()}-${i}`,
      name: `种子 · ${p.name}`,
      enabled: true,
      tone: draft.tonePresets[i % draft.tonePresets.length] ?? '热点借势',
      newsTitle: `热点联动：${p.category}相关话题走热`,
      newsSummary: `围绕 ${p.name} 的运营场景构造测试用例。`,
      newsTags: [p.category, '测试'],
      productIds: [p.id],
    }))
    onChange({ ...draft, evalCases: [...draft.evalCases, ...seeds] })
  }

  const runPool = async <T,>(
    tasks: Array<() => Promise<T>>,
    limit: number,
    onOne: (value: T) => void,
  ) => {
    let i = 0
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length && !abortRef.current) {
        const cur = i++
        const value = await tasks[cur]!()
        onOne(value)
      }
    })
    await Promise.all(workers)
  }

  const startRun = async () => {
    abortRef.current = false
    setRunning(true)
    setRows([])
    setProgress(0)
    const styles = draft.creativeStyles.filter((s) => selectedStyles.has(s.id))
    const tasks: Array<() => Promise<EvalRow>> = []

    for (const c of enabledCases) {
      for (const style of styles) {
        for (let r = 0; r < repeats; r++) {
          tasks.push(async () => {
            const products = draft.products.filter((p) =>
              c.productIds.includes(p.id),
            )
            const user = buildMaterialPrompt(draft.prompts.materialTemplate, {
              newsTitle: c.newsTitle,
              newsSummary: c.newsSummary,
              newsTags: c.newsTags,
              tone: c.tone,
              styleName: style.name,
              styleInstruction: style.instruction,
              products,
              productItemFormat: draft.prompts.productItemFormat,
            })
            const started = performance.now()
            let copy = ''
            let tokens = 0
            try {
              const result = await callChatModel(draft.model, [
                { role: 'system', content: draft.prompts.systemRole },
                { role: 'user', content: user },
              ])
              copy = result.content
              tokens = result.usage?.totalTokens ?? 0
            } catch (err) {
              copy = `生成失败：${err instanceof Error ? err.message : '未知错误'}`
            }
            const material = materialFromProducts(products, c.newsTags)
            const machine = runMachineChecks(copy, material, draft.eval)
            let review: ReviewScores | null = null
            if (enableReview) {
              review = await reviewCopyWithModel(draft, copy, {
                newsTitle: c.newsTitle,
                productNames: products.map((p) => p.name).join('、'),
              })
            }
            const total = composeTotalScore(
              machine,
              review,
              draft.eval.machineWeight,
              draft.eval.reviewWeight,
              enableReview,
            )
            return {
              caseId: c.id,
              caseName: c.name,
              styleId: style.id,
              styleName: style.name,
              repeat: r + 1,
              copy,
              machine,
              review,
              total,
              tokens,
              latencyMs: Math.round(performance.now() - started),
            }
          })
        }
      }
    }

    let done = 0
    const collected: EvalRow[] = []
    await runPool(tasks, concurrency, (row) => {
      collected.push(row)
      setRows([...collected])
      done++
      setProgress(Math.round((done / tasks.length) * 100))
    })

    if (!abortRef.current && collected.length) {
      const record: RunRecord = {
        id: `run-${Date.now()}`,
        shortId: `P${Date.now().toString(36).slice(-5).toUpperCase()}`,
        at: new Date().toLocaleString('zh-CN'),
        promptSnapshot: { ...draft.prompts },
        rows: collected,
        summary: summarize(collected),
      }
      const next = [record, ...history]
      setHistory(next)
      saveHistory(next)
    }
    setRunning(false)
  }

  const runDemoViolation = () => {
    const products = draft.products.slice(0, 1)
    const bad = `全网最低价！最佳选择！¥99999元超值优惠！${'极限词汇'.repeat(40)}`
    const material = materialFromProducts(products, ['测试', '示例'])
    const result = runMachineChecks(bad, material, draft.eval)
    setDemoCheck(result)
  }

  const runOneClickFix = async () => {
    const products = draft.products.slice(0, 1)
    if (!products.length) return
    const bad = `全网最低！¥99999元特价！${'极限词汇堆码'.repeat(30)}`
    setReworkLog('返工中…')
    const result = await autoReworkCopy({
      config: draft,
      copy: bad,
      products,
      newsTags: ['测试'],
      newsTitle: '测试热点标题',
      newsSummary: '测试热点摘要内容',
      tone: '热点借势',
      styleName: draft.creativeStyles[0]?.name ?? '',
      styleInstruction: draft.creativeStyles[0]?.instruction ?? '',
      maxRounds: 2,
    })
    const lines = result.rounds.map(
      (r) =>
        `第 ${r.round} 轮：${r.beforeScore}→${r.afterScore} ${r.accepted ? '✓ 通过' : '✗ 未通过'} 修复：${r.fixedIds.join(',') || '无'} 剩余：${r.remainingIds.join(',') || '无'}`,
    )
    setReworkLog(
      [
        `最终机检分 ${result.machine.score}`,
        ...lines,
        '—— 最终文案 ——',
        result.content,
      ].join('\n'),
    )
  }

  const summary = useMemo(() => summarize(rows), [rows])

  const cmp = useMemo(() => {
    const a = history.find((h) => h.id === compareA)
    const b = history.find((h) => h.id === compareB)
    if (!a || !b) return null
    const promptDiff = [
      a.promptSnapshot.systemRole !== b.promptSnapshot.systemRole
        ? '角色规范变更'
        : null,
      a.promptSnapshot.materialTemplate !== b.promptSnapshot.materialTemplate
        ? '素材模板变更'
        : null,
      a.promptSnapshot.productItemFormat !==
      b.promptSnapshot.productItemFormat
        ? '商品格式变更'
        : null,
    ].filter(Boolean)

    const byKey = (evalRows: EvalRow[]) => {
      const m = new Map<string, number>()
      for (const r of evalRows) {
        const k = `${r.caseId}:${r.styleId}`
        m.set(k, (m.get(k) ?? 0) + r.total)
      }
      const counts = new Map<string, number>()
      for (const r of evalRows) {
        const k = `${r.caseId}:${r.styleId}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      for (const [k, v] of m) {
        m.set(k, v / (counts.get(k) ?? 1))
      }
      return m
    }
    const ma = byKey(a.rows)
    const mb = byKey(b.rows)
    const keys = new Set([...ma.keys(), ...mb.keys()])
    const caseDiffs = [...keys].map((k) => {
      const sa = ma.get(k) ?? 0
      const sb = mb.get(k) ?? 0
      return { key: k, a: sa, b: sb, delta: sb - sa, worse: sb < sa }
    })
    return {
      a,
      b,
      promptDiff,
      caseDiffs,
      summaryDelta: {
        total: b.summary.totalAvg - a.summary.totalAvg,
        machine: b.summary.machinePass - a.summary.machinePass,
        review: b.summary.reviewAvg - a.summary.reviewAvg,
        forbidden: b.summary.forbiddenHits - a.summary.forbiddenHits,
        price: b.summary.priceHits - a.summary.priceHits,
      },
    }
  }, [history, compareA, compareB])

  return (
    <>
      <AdminSectionCard
        id="cases"
        title="用例管理"
        description="每条用例包含热点素材与关联商品，可启用/禁用后参与跑评"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border px-2 py-1 text-xs font-semibold"
              onClick={seedFromWorkbench}
            >
              从商品库生成
            </button>
            <button
              type="button"
              className="rounded-lg bg-brand-500 px-2 py-1 text-xs font-semibold text-white"
              onClick={addCase}
            >
              新增用例
            </button>
          </div>
        }
      >
        <ul className="space-y-2">
          {draft.evalCases.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-surface-200 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) =>
                    patchCase(c.id, { enabled: e.target.checked })
                  }
                />
                <input
                  value={c.name}
                  onChange={(e) => patchCase(c.id, { name: e.target.value })}
                  className="rounded border px-2 py-1 font-semibold"
                />
                <select
                  value={c.tone}
                  onChange={(e) => patchCase(c.id, { tone: e.target.value })}
                  className="rounded border px-2 py-1"
                >
                  {draft.tonePresets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ml-auto text-xs text-rose-600"
                  onClick={() =>
                    onChange({
                      ...draft,
                      evalCases: draft.evalCases.filter((x) => x.id !== c.id),
                    })
                  }
                >
                  删除
                </button>
              </div>
              <input
                value={c.newsTitle}
                onChange={(e) =>
                  patchCase(c.id, { newsTitle: e.target.value })
                }
                placeholder="热点标题"
                className="mt-2 w-full rounded border px-2 py-1"
              />
              <textarea
                value={c.newsSummary}
                onChange={(e) =>
                  patchCase(c.id, { newsSummary: e.target.value })
                }
                placeholder="热点摘要"
                rows={2}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </li>
          ))}
        </ul>
      </AdminSectionCard>

      <AdminSectionCard
        id="run"
        title="跑评测"
        description="按用例 × 风格 × 重复次数批量生成并打分"
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <label>
            并发
            <input
              type="number"
              min={1}
              max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
              className="ml-1 w-16 rounded border px-2 py-1"
            />
          </label>
          <label>
            重复次数
            <input
              type="number"
              min={1}
              max={5}
              value={repeats}
              onChange={(e) => setRepeats(Number(e.target.value) || 1)}
              className="ml-1 w-16 rounded border px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={enableReview}
              onChange={(e) => setEnableReview(e.target.checked)}
            />
            启用模型评审
          </label>
          <label>
            机检权重
            <input
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={draft.eval.machineWeight}
              onChange={(e) =>
                onChange({
                  ...draft,
                  eval: {
                    ...draft.eval,
                    machineWeight: Number(e.target.value),
                  },
                })
              }
              className="ml-1 w-16 rounded border px-2 py-1"
            />
          </label>
          <label>
            评审权重
            <input
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={draft.eval.reviewWeight}
              onChange={(e) =>
                onChange({
                  ...draft,
                  eval: {
                    ...draft.eval,
                    reviewWeight: Number(e.target.value),
                  },
                })
              }
              className="ml-1 w-16 rounded border px-2 py-1"
            />
          </label>
          <label>
            单价
            <input
              type="number"
              step={0.0001}
              value={draft.eval.unitPrice}
              onChange={(e) =>
                onChange({
                  ...draft,
                  eval: { ...draft.eval, unitPrice: Number(e.target.value) },
                })
              }
              className="ml-1 w-24 rounded border px-2 py-1"
            />
            <span className="ml-1 text-[11px] text-surface-700/55">
              （用于估算成本，不影响实际调用）
            </span>
          </label>
        </div>

        <div className="mt-2 text-xs text-surface-700/70">
          参与风格：
          {draft.creativeStyles.map((s) => (
            <label key={s.id} className="ml-2 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={selectedStyles.has(s.id)}
                onChange={(e) => {
                  setSelectedStyles((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(s.id)
                    else next.delete(s.id)
                    return next
                  })
                }}
              />
              {s.name}
            </label>
          ))}
        </div>

        <p className="mt-2 text-sm">
          预计任务 <strong>{taskEstimate}</strong> 条 ·
          成本估算 ¥
          {costEstimate.toFixed(4)} · 模型{' '}
          {draft.model.modelName || '未配置'}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={running || taskEstimate === 0}
            onClick={() => void startRun()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {running ? '跑评中…' : '开始跑评'}
          </button>
          <button
            type="button"
            disabled={!running}
            onClick={() => {
              abortRef.current = true
            }}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
          >
            中止
          </button>
          <button
            type="button"
            onClick={runDemoViolation}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
          >
            演示违规检测
          </button>
          <button
            type="button"
            onClick={() => void runOneClickFix()}
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
          >
            一键返工修复
          </button>
        </div>

        {running && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-200">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {demoCheck && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
            <div className="font-semibold">
              演示文案机检结果：总分 {demoCheck.score}
            </div>
            <ul className="mt-1 space-y-1">
              {demoCheck.items
                .filter((i) => !i.passed)
                .map((i) => (
                  <li key={i.id}>
                    [{i.severity === 'hard' ? '硬性' : '软性'}]{' '}
                    {i.label}：{i.reason}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {reworkLog && (
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-50 p-3 text-xs">
            {reworkLog}
          </pre>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <MiniStat label="总分" value={summary.totalAvg.toFixed(1)} />
              <MiniStat
                label="机检通过率"
                value={`${(summary.machinePass * 100).toFixed(0)}%`}
              />
              <MiniStat
                label="评审均分"
                value={summary.reviewAvg.toFixed(2)}
              />
              <MiniStat
                label="极限词命中"
                value={String(summary.forbiddenHits)}
              />
              <MiniStat
                label="价格违规"
                value={String(summary.priceHits)}
              />
              <MiniStat label="总 tokens" value={String(summary.tokens)} />
              <MiniStat
                label="总耗时"
                value={`${(summary.latency / 1000).toFixed(1)}s`}
              />
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-surface-700/60">
                  <tr>
                    <th className="p-2">用例</th>
                    <th className="p-2">风格</th>
                    <th className="p-2">总分</th>
                    <th className="p-2">机检</th>
                    <th className="p-2">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const key = `${r.caseId}-${r.styleId}-${r.repeat}-${idx}`
                    return (
                      <Fragment key={key}>
                        <tr className="border-t border-surface-100">
                          <td className="p-2">{r.caseName}</td>
                          <td className="p-2">{r.styleName}</td>
                          <td className="p-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-semibold ${scoreColor(r.total)}`}
                            >
                              {r.total}
                            </span>
                          </td>
                          <td className="p-2 text-xs">
                            {r.machine.passed ? '✓' : '✗'} ·{' '}
                            {r.machine.score}
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-brand-600"
                              onClick={() =>
                                setExpanded(expanded === key ? null : key)
                              }
                            >
                              {expanded === key ? '收起' : '展开'}
                            </button>
                          </td>
                        </tr>
                        {expanded === key && (
                          <tr>
                            <td colSpan={5} className="bg-surface-50 p-3 text-xs">
                              <pre className="whitespace-pre-wrap">{r.copy}</pre>
                              <ul className="mt-2 space-y-1">
                                {r.machine.items.map((i) => (
                                  <li key={i.id}>
                                    {i.passed ? '✓' : '✗'} {i.label}
                                    {i.reason ? ` · ${i.reason}` : ''}
                                  </li>
                                ))}
                              </ul>
                              {r.review && (
                                <p className="mt-2">
                                  评审：关联 {r.review.relevance} / 忠
                                  实 {r.review.fidelity} / 吸引{' '}
                                  {r.review.appeal} / 自然{' '}
                                  {r.review.naturalness} · {r.review.comment}
                                </p>
                              )}
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRows((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? { ...x, feedback: 'up' }
                                          : x,
                                      ),
                                    )
                                  }}
                                >
                                  赞
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRows((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? { ...x, feedback: 'down' }
                                          : x,
                                      ),
                                    )
                                  }}
                                >
                                  踩
                                </button>
                                <input
                                  placeholder="备注"
                                  className="rounded border px-2 py-0.5"
                                  value={r.note ?? ''}
                                  onChange={(e) => {
                                    const note = e.target.value
                                    setRows((prev) =>
                                      prev.map((x, i) =>
                                        i === idx ? { ...x, note } : x,
                                      ),
                                    )
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        id="history"
        title="历史与对比"
        description="最近 20 次跑评记录，可选择两次做 A/B 对比"
      >
        <ul className="mb-3 space-y-1 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex gap-2">
              <span className="font-mono text-xs font-semibold text-brand-700">
                {h.shortId}
              </span>
              <span>{h.at}</span>
              <span className="text-surface-700/60">
                均分 {h.summary.totalAvg.toFixed(1)} · {h.rows.length}{' '}
                条
              </span>
            </li>
          ))}
          {!history.length && (
            <li className="text-surface-700/55">
              暂无历史记录，完成一次跑评后会自动保存
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2 text-sm">
          <select
            value={compareA}
            onChange={(e) => setCompareA(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="">对比 A</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {h.shortId} · {h.at}
              </option>
            ))}
          </select>
          <select
            value={compareB}
            onChange={(e) => setCompareB(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="">对比 B</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {h.shortId} · {h.at}
              </option>
            ))}
          </select>
        </div>
        {cmp && (
          <div className="mt-3 rounded-lg border border-surface-200 p-3 text-sm">
            <p className="text-xs text-surface-700/70">
              提示词差异：
              {cmp.promptDiff.join('、') || '无变更'}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Delta label="总分" value={cmp.summaryDelta.total} />
              <Delta
                label="机检通过率"
                value={cmp.summaryDelta.machine * 100}
                suffix="%"
              />
              <Delta label="评审均分" value={cmp.summaryDelta.review} />
              <Delta
                label="极限词"
                value={cmp.summaryDelta.forbidden}
                invert
              />
              <Delta
                label="价格违规"
                value={cmp.summaryDelta.price}
                invert
              />
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {cmp.caseDiffs.map((d) => (
                <li
                  key={d.key}
                  className={
                    d.worse ? 'rounded bg-rose-50 px-2 py-1' : 'px-2 py-1'
                  }
                >
                  {d.key}：{d.a.toFixed(1)} → {d.b.toFixed(1)} (
                  {d.delta >= 0 ? '+' : ''}
                  {d.delta.toFixed(1)})
                  {d.worse ? ' · 退化' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminSectionCard>
    </>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-200 px-2 py-2">
      <div className="text-[10px] text-surface-700/55">{label}</div>
      <div className="font-display text-base font-semibold">{value}</div>
    </div>
  )
}

function Delta({
  label,
  value,
  suffix = '',
  invert,
}: {
  label: string
  value: number
  suffix?: string
  invert?: boolean
}) {
  const good = invert ? value < 0 : value > 0
  const bad = invert ? value > 0 : value < 0
  return (
    <div className="rounded-lg bg-surface-50 px-2 py-1.5 text-xs">
      <div className="text-surface-700/55">{label}</div>
      <div
        className={
          good
            ? 'font-semibold text-emerald-700'
            : bad
              ? 'font-semibold text-rose-700'
              : ''
        }
      >
        {value > 0 ? '✓' : value < 0 ? '✗' : '—'}{' '}
        {value > 0 ? '+' : ''}
        {value.toFixed(2)}
        {suffix}
      </div>
    </div>
  )
}
