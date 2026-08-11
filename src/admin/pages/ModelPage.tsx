import { useState } from 'react'
import type { AppConfig, ModelAccessMode, ModelTemperatures } from '../../config/types'
import {
  DEFAULT_MODEL_TEMPERATURES,
  PROVIDER_PRESETS,
} from '../../config/defaults'
import {
  accessModeLabel,
  FriendlyLlmError,
  testModelConnection,
} from '../../services/llmClient'
import { AdminSectionCard, FieldError } from '../shared'

interface Props {
  draft: AppConfig
  onChange: (next: AppConfig) => void
}

const MODES: { value: ModelAccessMode; label: string; hint: string }[] = [
  {
    value: 'mock',
    label: '本地模拟',
    hint: '不调用外部接口，适合演示',
  },
  {
    value: 'proxy',
    label: '本地服务中转',
    hint: '经本地开发服务转发，密钥可放服务端环境变量',
  },
  {
    value: 'direct',
    label: '浏览器直连',
    hint: '浏览器直接请求远端 API，可能受 CORS 限制',
  },
]

const TEMP_FIELDS: {
  key: keyof ModelTemperatures
  label: string
  hint: string
}[] = [
  {
    key: 'creative',
    label: '文案创作',
    hint: '工作台生成微博文案；建议 0.7～1.0',
  },
  {
    key: 'newsGate',
    label: '借势硬边界审核',
    hint: '新闻抓取后的合规判断；建议 0.1～0.3',
  },
  {
    key: 'productMatch',
    label: '商品智能匹配',
    hint: '建议匹配商品；建议 0.1～0.3',
  },
  {
    key: 'review',
    label: '返工与模型评审',
    hint: '机审失败后的改写、打分；建议 0.1～0.3',
  },
]

export function ModelPage({ draft, onChange }: Props) {
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<boolean | null>(null)

  const temps: ModelTemperatures = {
    ...DEFAULT_MODEL_TEMPERATURES,
    ...draft.model.temperatures,
    creative:
      draft.model.temperatures?.creative ??
      draft.model.temperature ??
      DEFAULT_MODEL_TEMPERATURES.creative,
  }

  const patch = (partial: Partial<AppConfig['model']>) => {
    onChange({ ...draft, model: { ...draft.model, ...partial } })
  }

  const patchTemp = (key: keyof ModelTemperatures, value: number) => {
    const next = { ...temps, [key]: value }
    patch({
      temperatures: next,
      // 兼容旧字段：创作温度同步到 temperature
      temperature: next.creative,
    })
  }

  const restoreDefaultTemps = () => {
    patch({
      temperatures: { ...DEFAULT_MODEL_TEMPERATURES },
      temperature: DEFAULT_MODEL_TEMPERATURES.creative,
    })
  }

  const applyProvider = (provider: string) => {
    const preset = PROVIDER_PRESETS[provider]
    if (!preset) {
      patch({ provider })
      return
    }
    patch({
      provider,
      baseUrl: preset.baseUrl || draft.model.baseUrl,
      modelName: preset.modelName || draft.model.modelName,
    })
  }

  const runTest = async () => {
    setTesting(true)
    setTestMsg(null)
    setTestOk(null)
    try {
      const result = await testModelConnection(draft.model)
      setTestOk(true)
      setTestMsg(
        `连接成功 · 延迟 ${result.latencyMs}ms · 模型 ${result.model} · ${accessModeLabel(result.mode)}${
          result.mocked ? '（模拟）' : ''
        }`,
      )
    } catch (err) {
      setTestOk(false)
      setTestMsg(
        err instanceof FriendlyLlmError
          ? err.message
          : err instanceof Error
            ? err.message
            : '连接失败',
      )
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <AdminSectionCard
        id="access"
        title="接入方式"
        description="选择模型调用通道，影响工作台生成与后台试运行"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => patch({ mode: m.value })}
              className={[
                'rounded-xl border p-3 text-left transition',
                draft.model.mode === m.value
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/30'
                  : 'border-surface-200 bg-white hover:border-brand-300',
              ].join(' ')}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="mt-1 text-[11px] text-surface-700/65">
                {m.hint}
              </div>
            </button>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="provider"
        title="服务商与模型"
        description="切换预设会自动填充 Base URL 与默认模型名，亦可手动修改"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            服务商
            <select
              value={draft.model.provider}
              onChange={(e) => applyProvider(e.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2"
            >
              {Object.entries(PROVIDER_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            模型名
            <input
              value={draft.model.modelName}
              onChange={(e) => patch({ modelName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2"
              placeholder="deepseek-chat"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            接口地址
            <input
              value={draft.model.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
              className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2"
              placeholder="https://api.deepseek.com"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            API 密钥
            <input
              type="password"
              value={draft.model.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value })}
              className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-amber-700">
              密钥仅存于浏览器本地或服务端环境变量，请勿提交到代码仓库。服务端中转推荐使用环境变量
              TRENDWAVE_LLM_KEY。
            </p>
          </label>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="params"
        title="分场景温度"
        description="各 LLM 调用独立温度；创作偏高更有创意，审核/匹配/评审偏低更稳定"
        actions={
          <button
            type="button"
            className="text-xs font-semibold text-brand-600"
            onClick={restoreDefaultTemps}
          >
            恢复默认温度
          </button>
        }
      >
        <div className="space-y-5">
          {TEMP_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-surface-900">
                  {f.label}
                  <span className="ml-2 font-mono text-brand-700">
                    {temps[f.key].toFixed(1)}
                  </span>
                </span>
                <span className="text-[11px] text-surface-700/55">{f.hint}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={temps[f.key]}
                onChange={(e) => patchTemp(f.key, Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
          ))}
        </div>
        <label className="mt-5 flex items-center gap-2 border-t border-surface-100 pt-4 text-sm">
          <input
            type="checkbox"
            checked={draft.model.stream}
            onChange={(e) => patch({ stream: e.target.checked })}
          />
          启用流式输出（部分服务商或代理不支持；当前主路径仍以非流式为主）
        </label>
      </AdminSectionCard>

      <AdminSectionCard
        id="test"
        title="测试连接"
        description="发送最小请求验证密钥、地址与网络是否可用"
      >
        <button
          type="button"
          disabled={testing}
          onClick={() => void runTest()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        {testMsg && (
          <p
            className={`mt-3 text-sm ${
              testOk ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {testMsg}
          </p>
        )}
        {testOk === false && (
          <FieldError message="请检查配置并重试，或切换接入方式" />
        )}
      </AdminSectionCard>
    </>
  )
}
