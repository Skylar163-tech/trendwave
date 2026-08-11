import type { CatalogProduct } from '../config/types'

export interface CsvIssue {
  row: number
  reason: string
}

export interface CsvParseResult {
  products: Omit<CatalogProduct, 'id' | 'brand' | 'imageTone' | 'stock'>[] &
    Partial<CatalogProduct>[]
  issues: CsvIssue[]
  headersOk: boolean
}

const REQUIRED_HEADERS = ['名称', '售价', '原价', '品类', '卖点', '图标'] as const

/** 解析 CSV（支持引号包裹与字段内逗号） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    const next = src[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

export function productsToCsv(products: CatalogProduct[]): string {
  const header = REQUIRED_HEADERS.join(',')
  const lines = products.map((p) => {
    const cells = [
      p.name,
      String(p.price),
      p.originalPrice != null ? String(p.originalPrice) : '',
      p.category,
      p.sellingPoints.join('、'),
      p.icon,
    ]
    return cells.map(escapeCsv).join(',')
  })
  return [header, ...lines].join('\n')
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function validateProductCsv(text: string): {
  issues: CsvIssue[]
  rows: Array<{
    name: string
    price: number
    originalPrice?: number
    category: string
    sellingPoints: string[]
    icon: string
  }>
} {
  const table = parseCsv(text)
  const issues: CsvIssue[] = []
  if (table.length === 0) {
    return { issues: [{ row: 0, reason: '文件为空' }], rows: [] }
  }
  const header = table[0]!.map((h) => h.trim())
  for (const h of REQUIRED_HEADERS) {
    if (!header.includes(h)) {
      issues.push({ row: 1, reason: `缺少表头列「${h}」` })
    }
  }
  if (issues.length) return { issues, rows: [] }

  const idx = (name: string) => header.indexOf(name)
  const rows: Array<{
    name: string
    price: number
    originalPrice?: number
    category: string
    sellingPoints: string[]
    icon: string
  }> = []

  for (let r = 1; r < table.length; r++) {
    const line = table[r]!
    const rowNum = r + 1
    const name = (line[idx('名称')] ?? '').trim()
    const priceRaw = (line[idx('售价')] ?? '').trim()
    const originalRaw = (line[idx('原价')] ?? '').trim()
    const category = (line[idx('品类')] ?? '').trim()
    const pointsRaw = (line[idx('卖点')] ?? '').trim()
    const icon = (line[idx('图标')] ?? '').trim() || '🛍️'

    if (!name) {
      issues.push({ row: rowNum, reason: '名称为必填项' })
      continue
    }
    const price = Number(priceRaw)
    if (!Number.isFinite(price) || price <= 0) {
      issues.push({
        row: rowNum,
        reason: `售价非法（${priceRaw || '空'}），须为正数`,
      })
      continue
    }
    let originalPrice: number | undefined
    if (originalRaw) {
      const op = Number(originalRaw)
      if (!Number.isFinite(op) || op <= 0) {
        issues.push({ row: rowNum, reason: `原价非法（${originalRaw}）` })
        continue
      }
      if (op < price) {
        issues.push({
          row: rowNum,
          reason: `原价（${op}）不能低于售价（${price}）`,
        })
        continue
      }
      originalPrice = op
    }
    if (!category) {
      issues.push({ row: rowNum, reason: '品类为必填项' })
      continue
    }
    rows.push({
      name,
      price,
      originalPrice,
      category,
      sellingPoints: pointsRaw
        ? pointsRaw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
        : [],
      icon,
    })
  }

  return { issues, rows }
}

export function productsToJson(products: CatalogProduct[]): string {
  return JSON.stringify({ version: 1, products }, null, 2)
}

export function parseProductsJson(text: string): {
  ok: true
  products: CatalogProduct[]
} | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON 解析失败' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '根节点必须是对象' }
  }
  const obj = parsed as { products?: unknown }
  if (!Array.isArray(obj.products)) {
    return { ok: false, error: '缺少 products 数组' }
  }
  const products: CatalogProduct[] = []
  for (let i = 0; i < obj.products.length; i++) {
    const p = obj.products[i]
    if (!p || typeof p !== 'object') {
      return { ok: false, error: `第 ${i + 1} 条商品不是对象` }
    }
    const row = p as Record<string, unknown>
    const name = String(row.name ?? '')
    const price = Number(row.price)
    if (!name || !Number.isFinite(price) || price <= 0) {
      return { ok: false, error: `第 ${i + 1} 条商品名称或售价非法` }
    }
    products.push({
      id: String(row.id ?? `import-${i + 1}`),
      name,
      brand: String(row.brand ?? name.slice(0, 2)),
      icon: String(row.icon ?? '🛍️'),
      price,
      originalPrice:
        row.originalPrice != null ? Number(row.originalPrice) : undefined,
      sellingPoints: Array.isArray(row.sellingPoints)
        ? row.sellingPoints.map(String)
        : [],
      category: String(row.category ?? '未分类'),
      imageTone: String(row.imageTone ?? 'from-sky-500 to-blue-700'),
      stock: Number(row.stock ?? 1000),
    })
  }
  return { ok: true, products }
}
