import { useCallback, useEffect, useMemo, useState } from 'react'

export type AdminPageId =
  | 'prompts'
  | 'model'
  | 'products'
  | 'sources'
  | 'eval'

export type AppRoute =
  | { area: 'workbench' }
  | { area: 'admin'; page: AdminPageId }

const ADMIN_PAGES: AdminPageId[] = [
  'prompts',
  'model',
  'products',
  'sources',
  'eval',
]

function parseHash(hash: string): AppRoute {
  const h = hash.replace(/^#/, '') || '/'
  if (h.startsWith('/admin')) {
    const part = h.split('/')[2] as AdminPageId | undefined
    const page = part && ADMIN_PAGES.includes(part) ? part : 'prompts'
    return { area: 'admin', page }
  }
  return { area: 'workbench' }
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseHash(window.location.hash),
  )

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((next: AppRoute) => {
    if (next.area === 'workbench') {
      window.location.hash = '#/'
    } else {
      window.location.hash = `#/admin/${next.page}`
    }
  }, [])

  return { route, navigate }
}

export const ADMIN_NAV: {
  id: AdminPageId
  title: string
  desc: string
}[] = [
  { id: 'prompts', title: '提示词与风格', desc: '角色规范、模板、风格语调' },
  { id: 'model', title: '模型接入', desc: '服务商、密钥、温度与连通性' },
  { id: 'products', title: '商品库', desc: '商品维护、导入导出' },
  { id: 'sources', title: '抓取来源', desc: '热榜与订阅源' },
  { id: 'eval', title: '评测台', desc: '用例、跑分、对比与返工' },
]

export function useAdminSections(page: AdminPageId) {
  return useMemo(() => {
    switch (page) {
      case 'prompts':
        return [
          { id: 'role', title: '角色与写作规范' },
          { id: 'material', title: '素材拼装模板' },
          { id: 'product-format', title: '单件商品格式' },
          { id: 'styles', title: '创作风格' },
          { id: 'tones', title: '语调预设' },
          { id: 'preview', title: '实时预览与试运行' },
          { id: 'rewrite', title: '返工与评审提示词' },
        ]
      case 'model':
        return [
          { id: 'access', title: '接入方式' },
          { id: 'provider', title: '服务商与模型' },
          { id: 'params', title: '温度与流式' },
          { id: 'test', title: '测试连接' },
        ]
      case 'products':
        return [
          { id: 'stats', title: '统计概览' },
          { id: 'list', title: '商品列表' },
          { id: 'import', title: '导入导出' },
        ]
      case 'sources':
        return [
          { id: 'list', title: '来源列表' },
          { id: 'compliance', title: '合规与风险说明' },
          { id: 'test', title: '测试抓取' },
        ]
      case 'eval':
        return [
          { id: 'cases', title: '用例管理' },
          { id: 'run', title: '跑评测' },
          { id: 'history', title: '历史与对比' },
        ]
    }
  }, [page])
}
