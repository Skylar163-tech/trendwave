import { DEFAULT_APP_CONFIG } from './defaults'
import { mergeWithDefaults, validateConfigForWrite, validateImportPayload } from './merge'
import type { AppConfig, ConfigSource, LoadedConfig } from './types'

const LOCAL_KEY = 'trendwave.appconfig.v1'
const API_BASE = '/api'

export function cloneConfig(config: AppConfig): AppConfig {
  return structuredClone(config)
}

export function loadLocalConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    return mergeWithDefaults(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveLocalConfig(config: AppConfig): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(config))
}

export function wipeLocalConfig(): void {
  localStorage.removeItem(LOCAL_KEY)
}

/** 尝试从服务端读取；失败返回 null */
export async function fetchServerConfig(): Promise<AppConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    return mergeWithDefaults(data)
  } catch {
    return null
  }
}

export async function probeServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 三级读取：服务端 → 本机 → 内置默认。
 */
export async function loadConfigTiered(): Promise<LoadedConfig> {
  const server = await fetchServerConfig()
  if (server) {
    // 本机密钥覆盖服务端（密钥不进服务端文件时）
    const local = loadLocalConfig()
    if (local?.model.apiKey) {
      server.model.apiKey = local.model.apiKey
    }
    return { config: server, source: 'server' }
  }
  const local = loadLocalConfig()
  if (local) return { config: local, source: 'local' }
  return { config: cloneConfig(DEFAULT_APP_CONFIG), source: 'default' }
}

export type SaveResult = {
  ok: true
  source: ConfigSource
  message: string
} | {
  ok: false
  error: string
}

/**
 * 优先写服务端；失败则写本机。
 * 密钥始终同步到本机，方便离线使用。
 */
export async function saveConfigTiered(config: AppConfig): Promise<SaveResult> {
  const err = validateConfigForWrite(config)
  if (err) return { ok: false, error: err }

  // 始终备份密钥到本机
  const localCopy = cloneConfig(config)
  saveLocalConfig(localCopy)

  try {
    const payload = cloneConfig(config)
    // 服务端不强制存浏览器密钥时可清空；这里仍提交完整配置便于中转
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      return {
        ok: true,
        source: 'server',
        message: '已保存到服务端（本机同步备份）',
      }
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    // 服务端拒绝（如空列表）要原样报错，不要静默落到本机成功
    if (res.status === 400) {
      return { ok: false, error: body?.error ?? '服务端拒绝写入' }
    }
  } catch {
    // 网络不可达 → 本机
  }

  return {
    ok: true,
    source: 'local',
    message: '服务端不可用，已保存到本机浏览器',
  }
}

export function exportConfigFile(config: AppConfig, filename = 'trendwave-config.json') {
  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function importConfigFile(file: File): Promise<
  { ok: true; config: AppConfig } | { ok: false; error: string }
> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: '无法读取文件' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON 解析失败，请确认文件格式' }
  }
  return validateImportPayload(parsed)
}

export function sourceLabel(source: ConfigSource): string {
  switch (source) {
    case 'server':
      return '服务端'
    case 'local':
      return '本机浏览器'
    default:
      return '内置默认'
  }
}
