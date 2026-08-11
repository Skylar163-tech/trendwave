import { CURRENT_USER } from '../../data/mock'
import { useIntegration } from '../../context/IntegrationContext'
import { useAppConfig } from '../../context/AppConfigContext'
import { maskSecret } from '../../types/integration'
import { accessModeLabel } from '../../services/llmClient'
import { SourceBadge } from '../../admin/shared'

export function TopHeader() {
  const { openSettings, config } = useIntegration()
  const { source, config: appConfig } = useAppConfig()
  const modeLabel = accessModeLabel(appConfig.model.mode)
  const isMock = appConfig.model.mode === 'mock'

  return (
    <header className="panel sticky top-0 z-30 flex h-14 items-center justify-between border-b border-surface-200/80 px-5 shadow-[0_1px_0_rgba(255,255,255,0.6)]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm shadow-brand-500/30">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
            <path
              d="M7 18c3-6 6-9 9-9s6 3 9 9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="16" cy="21" r="2.2" fill="#7DD3FC" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-tight text-surface-900">
            TrendWave
          </div>
          <div className="text-[11px] text-surface-700/70">电商媒体热点营销工作台</div>
        </div>
        <SourceBadge source={source} />
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <a
          href="#/admin/prompts"
          className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-semibold text-surface-800 transition hover:border-brand-400 hover:bg-brand-50/50"
        >
          运营后台
        </a>
        <button
          type="button"
          onClick={openSettings}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-semibold text-surface-800 transition hover:border-brand-400 hover:bg-brand-50/50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 13a7.7 7.7 0 0 0 .05-1l2-1.15-2-3.46-2.2.7a7.6 7.6 0 0 0-1.7-1L15.2 4h-4l-.35 2.1a7.6 7.6 0 0 0-1.7 1l-2.2-.7-2 3.46L6.9 12a7.7 7.7 0 0 0 0 2l-1.95 1.15 2 3.46 2.2-.7a7.6 7.6 0 0 0 1.7 1L11.2 21h4l.35-2.1a7.6 7.6 0 0 0 1.7-1l2.2.7 2-3.46L19.4 13Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          集成配置
          <span
            className={[
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              isMock
                ? 'bg-surface-100 text-surface-700'
                : 'bg-emerald-100 text-emerald-700',
            ].join(' ')}
          >
            {modeLabel}
          </span>
        </button>

        {config.apiKey && (
          <span
            className="hidden text-[10px] text-surface-700/50 lg:inline"
            title="密钥已脱敏显示"
          >
            Key {maskSecret(config.apiKey)}
          </span>
        )}

        <div className="hidden items-center gap-2 rounded-full bg-surface-100 px-3 py-1 text-xs text-surface-700 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {CURRENT_USER.loggedIn ? '已登录' : '未登录'}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-semibold text-white">
            {CURRENT_USER.avatarInitials}
          </div>
          <div className="hidden leading-tight md:block">
            <div className="text-sm font-semibold text-surface-900">{CURRENT_USER.name}</div>
            <div className="text-[11px] text-surface-700/65">{CURRENT_USER.account}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
