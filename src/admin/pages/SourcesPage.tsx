import { useState } from 'react'
import type { AppConfig, NewsSourceConfig } from '../../config/types'
import {
  isValidSourceUrl,
  testAllSources,
  type SourceTestResult,
} from '../../services/newsSources'
import { AdminSectionCard, FieldError } from '../shared'

interface Props {
  draft: AppConfig
  onChange: (next: AppConfig) => void
}

export function SourcesPage({ draft, onChange }: Props) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<SourceTestResult[] | null>(null)

  const setSources = (sources: NewsSourceConfig[]) => {
    onChange({ ...draft, sources })
  }

  const toggle = (id: string) => {
    setSources(
      draft.sources.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    )
  }

  const remove = (id: string) => {
    const s = draft.sources.find((x) => x.id === id)
    if (s?.builtin) {
      window.alert('内置来源不可删除')
      return
    }
    setSources(draft.sources.filter((x) => x.id !== id))
  }

  const addRss = () => {
    setUrlError(null)
    if (!name.trim()) {
      setUrlError('请填写来源名称')
      return
    }
    if (!isValidSourceUrl(url.trim())) {
      setUrlError(
        '请输入有效 URL，以 http:// 或 https:// 开头',
      )
      return
    }
    setSources([
      ...draft.sources,
      {
        id: `rss-${Date.now()}`,
        name: name.trim(),
        kind: 'rss',
        endpoint: url.trim(),
        enabled: true,
        builtin: false,
      },
    ])
    setName('')
    setUrl('')
  }

  const runTest = async () => {
    setTesting(true)
    setResults(null)
    try {
      const r = await testAllSources(draft.sources)
      setResults(r)
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <AdminSectionCard
        id="list"
        title="来源列表"
        description="勾选启用的来源；内置源不可删除，可停用"
      >
        <ul className="space-y-2">
          {draft.sources.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() => toggle(s.id)}
                />
                {s.name}
              </label>
              <span className="rounded-md bg-surface-100 px-1.5 py-0.5 text-[10px] text-surface-700">
                {s.kind === 'builtin'
                  ? s.endpoint === 'toutiao'
                    ? '热榜·真实'
                    : '内置热榜·演示'
                  : 'RSS 订阅'}
              </span>
              <span className="truncate text-xs text-surface-700/55">
                {s.endpoint}
              </span>
              {!s.builtin && (
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-rose-600"
                  onClick={() => remove(s.id)}
                >
                  删除
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border border-dashed border-surface-300 p-3">
          <div className="text-sm font-semibold">添加 RSS 订阅</div>
          <p className="mt-1 text-xs leading-relaxed text-surface-700/70">
            需填写可公开访问的 RSS/Atom 地址。可用示例：
            <code className="mx-1 rounded bg-surface-100 px-1">
              https://www.36kr.com/feed
            </code>
            。今日头条请启用上方内置「今日头条热榜」（服务端拉取热榜 JSON），不要把头条号「内容源接入」规范页当成订阅地址——那是媒体向头条投稿用的 RSS 格式说明。
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名称"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.36kr.com/feed"
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <FieldError message={urlError ?? undefined} />
          <button
            type="button"
            onClick={addRss}
            className="mt-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            添加
          </button>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="compliance"
        title="合规与风险说明"
        description="请阅读并遵守以下项"
      >
        <div className="space-y-3 text-sm leading-relaxed text-surface-800">
          <p>
            <strong>重要声明：</strong>
            本平台抓取的热榜与 RSS 内容仅供运营选题参考，不代表官方立场，请自行核实后再用于对外发布。
          </p>
          <p>
            <strong>使用须知</strong>
          </p>
          <ul className="list-disc space-y-1 pl-5 text-surface-700">
            <li>
              <strong>数据来源：</strong>
              内置热榜与第三方 RSS 均受各平台服务条款约束，请遵守 robots 与频率限制。
            </li>
            <li>
              <strong>内容版权：</strong>
              摘引新闻标题与摘要时请注明出处，避免全文转载侵权。
            </li>
            <li>
              <strong>抓取频率：</strong>
              请勿高频轮询 RSS 或热榜接口，以免对源站造成压力或被封禁。
            </li>
          </ul>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="test"
        title="测试抓取"
        description="对当前启用的来源发起连通性检查"
      >
        <button
          type="button"
          disabled={testing}
          onClick={() => void runTest()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {testing ? '测试中…' : '测试全部来源'}
        </button>
        {results && (
          <ul className="mt-3 space-y-2">
            {results.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-surface-200 px-3 py-2 text-sm"
              >
                <span
                  className={
                    r.ok
                      ? 'font-semibold text-emerald-700'
                      : 'font-semibold text-rose-700'
                  }
                >
                  {r.ok ? '成功' : '失败'}
                </span>
                <span className="ml-2">{r.name}</span>
                <span className="ml-2 text-xs text-surface-700/60">
                  {r.ok
                    ? `${r.count} 条 · ${r.latencyMs}ms`
                    : `${r.error} · ${r.latencyMs}ms`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>
    </>
  )
}
