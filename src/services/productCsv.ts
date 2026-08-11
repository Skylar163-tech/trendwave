import type { CatalogProduct } from '../config/types'

export interface CsvIssue {
  row: number
  reason: string
}

export interface ParsedProductRow {
  name: string
  price: number
  originalPrice?: number
  category: string
  sellingPoints: string[]
  icon: string
  brand?: string
  monthlySales?: number
  returnRate?: number
  grossMargin?: number
}

/** 逻辑字段 → 可接受的表头别名（含运营常见表头） */
const HEADER_ALIASES: Record<keyof ParsedProductRow | 'id', string[]> = {
  id: ['id', '商品id', '商品ID', 'sku', 'SKU'],
  name: ['名称', '商品名称', '品名', '商品名', 'name', 'title'],
  price: ['售价', '价格', '现价', '单价', 'price'],
  originalPrice: ['原价', '划线价', '市场价', 'originalprice', 'list_price'],
  category: ['品类', '分类', '类目', 'category'],
  sellingPoints: [
    '卖点',
    '详情',
    '描述',
    '商品详情',
    '亮点',
    'sellingpoints',
    'detail',
    'description',
  ],
  icon: ['图标', 'icon', 'emoji'],
  brand: ['品牌', 'brand'],
  monthlySales: [
    '近月销量',
    '最近一个月销量',
    '最近一个月销售额',
    '月销量',
    '销量',
    '销售额',
    'monthlysales',
    'sales',
  ],
  returnRate: ['退货率', '退货', 'returnrate', 'return_rate'],
  grossMargin: ['毛利率', '毛利', 'grossmargin', 'gross_margin', 'margin'],
}

const EXPORT_HEADERS = [
  '名称',
  '售价',
  '原价',
  '品类',
  '卖点',
  '图标',
  '品牌',
  '近月销量',
  '退货率',
  '毛利率',
] as const

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, '')
}

function resolveColumnIndex(
  header: string[],
  aliases: string[],
): number {
  const normalized = header.map(normalizeHeader)
  const aliasNorm = aliases.map(normalizeHeader)
  for (const a of aliasNorm) {
    const i = normalized.indexOf(a)
    if (i >= 0) return i
  }
  // 模糊：表头包含别名（如「最近一个月销售额(元)」）
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!
    if (aliasNorm.some((a) => a && (h.includes(a) || a.includes(h)))) {
      return i
    }
  }
  return -1
}

function detectDelimiter(firstLine: string): ',' | '\t' | ';' {
  const commas = (firstLine.match(/,/g) || []).length
  const tabs = (firstLine.match(/\t/g) || []).length
  const semis = (firstLine.match(/;/g) || []).length
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t'
  if (semis > commas && semis > 0) return ';'
  return ','
}

/** 解析 CSV / TSV（支持引号包裹与字段内分隔符） */
export function parseCsv(text: string, delimiter?: ',' | '\t' | ';'): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/)[0] ?? ''
  const sep = delimiter ?? detectDelimiter(firstLine)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

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
    if (ch === sep) {
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
  const lines = products.map((p) => {
    const cells = [
      p.name,
      String(p.price),
      p.originalPrice != null ? String(p.originalPrice) : '',
      p.category,
      p.sellingPoints.join('、'),
      p.icon,
      p.brand,
      p.monthlySales != null ? String(p.monthlySales) : '',
      p.returnRate != null ? String(p.returnRate) : '',
      p.grossMargin != null ? String(p.grossMargin) : '',
    ]
    return cells.map(escapeCsv).join(',')
  })
  return [EXPORT_HEADERS.join(','), ...lines].join('\n')
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function parseNumber(raw: string): number | undefined {
  const t = raw.trim().replace(/,/g, '').replace(/%$/, '')
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** 退货率 / 毛利率：0.45 或 45% → 存 0～1 */
function parseRate(raw: string): number | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const hasPercent = t.includes('%')
  const n = parseNumber(t)
  if (n == null) return undefined
  if (hasPercent || n > 1) return Math.min(1, Math.max(0, n / 100))
  return Math.min(1, Math.max(0, n))
}

function cell(line: string[], index: number): string {
  if (index < 0) return ''
  return (line[index] ?? '').trim()
}

/**
 * 宽松校验二维表（首行为表头）。
 */
export function validateProductTable(table: string[][]): {
  issues: CsvIssue[]
  rows: ParsedProductRow[]
  mappedHeaders: string[]
} {
  const issues: CsvIssue[] = []
  const mappedHeaders: string[] = []
  if (table.length === 0) {
    return { issues: [{ row: 0, reason: '文件为空' }], rows: [], mappedHeaders }
  }

  const header = table[0]!.map((h) => String(h ?? '').trim())
  const joinedHead = header.join('')
  if (/^PK[\x03\x04\x05\x06\x07\x08]/.test(joinedHead) || header[0] === 'PK') {
    return {
      issues: [
        {
          row: 1,
          reason:
            '检测到 Excel 二进制（.xlsx）。请直接选择 .xlsx 导入，或另存为 CSV UTF-8。',
        },
      ],
      rows: [],
      mappedHeaders,
    }
  }

  const col = {
    name: resolveColumnIndex(header, HEADER_ALIASES.name),
    price: resolveColumnIndex(header, HEADER_ALIASES.price),
    originalPrice: resolveColumnIndex(header, HEADER_ALIASES.originalPrice),
    category: resolveColumnIndex(header, HEADER_ALIASES.category),
    sellingPoints: resolveColumnIndex(header, HEADER_ALIASES.sellingPoints),
    icon: resolveColumnIndex(header, HEADER_ALIASES.icon),
    brand: resolveColumnIndex(header, HEADER_ALIASES.brand),
    monthlySales: resolveColumnIndex(header, HEADER_ALIASES.monthlySales),
    returnRate: resolveColumnIndex(header, HEADER_ALIASES.returnRate),
    grossMargin: resolveColumnIndex(header, HEADER_ALIASES.grossMargin),
  }

  if (col.name < 0) {
    issues.push({
      row: 1,
      reason:
        '缺少名称列（可用：名称 / 商品名称 / 品名）。当前表头：' +
        header.join('、'),
    })
  }
  if (col.price < 0) {
    issues.push({
      row: 1,
      reason:
        '缺少价格列（可用：售价 / 价格 / 现价）。当前表头：' +
        header.join('、'),
    })
  }
  if (issues.length) return { issues, rows: [], mappedHeaders }

  const describe = (key: string, index: number) => {
    if (index >= 0) mappedHeaders.push(`${key}←${header[index]}`)
  }
  describe('名称', col.name)
  describe('售价', col.price)
  describe('原价', col.originalPrice)
  describe('品类', col.category)
  describe('卖点/详情', col.sellingPoints)
  describe('图标', col.icon)
  describe('品牌', col.brand)
  describe('近月销量', col.monthlySales)
  describe('退货率', col.returnRate)
  describe('毛利率', col.grossMargin)

  const rows: ParsedProductRow[] = []

  for (let r = 1; r < table.length; r++) {
    const line = table[r]!.map((c) => String(c ?? ''))
    const rowNum = r + 1
    const name = cell(line, col.name)
    const priceRaw = cell(line, col.price)
    const originalRaw = cell(line, col.originalPrice)
    const category = cell(line, col.category) || '未分类'
    const pointsRaw = cell(line, col.sellingPoints)
    const icon = cell(line, col.icon) || '🛍️'
    const brand = cell(line, col.brand)

    if (!name) {
      issues.push({ row: rowNum, reason: '名称为必填项，已跳过' })
      continue
    }
    const price = parseNumber(priceRaw)
    if (price == null || price <= 0) {
      issues.push({
        row: rowNum,
        reason: `售价非法（${priceRaw || '空'}），须为正数，已跳过`,
      })
      continue
    }

    let originalPrice: number | undefined
    if (originalRaw) {
      const op = parseNumber(originalRaw)
      if (op == null || op <= 0) {
        issues.push({
          row: rowNum,
          reason: `原价非法（${originalRaw}），已忽略原价`,
        })
      } else if (op < price) {
        issues.push({
          row: rowNum,
          reason: `原价（${op}）低于售价（${price}），已忽略原价`,
        })
      } else {
        originalPrice = op
      }
    }

    rows.push({
      name,
      price,
      originalPrice,
      category,
      sellingPoints: pointsRaw
        ? pointsRaw.split(/[、,，;/｜|]/).map((s) => s.trim()).filter(Boolean)
        : [],
      icon,
      brand: brand || undefined,
      monthlySales: parseNumber(cell(line, col.monthlySales)),
      returnRate: parseRate(cell(line, col.returnRate)),
      grossMargin: parseRate(cell(line, col.grossMargin)),
    })
  }

  return { issues, rows, mappedHeaders }
}

export function validateProductCsv(text: string): {
  issues: CsvIssue[]
  rows: ParsedProductRow[]
  mappedHeaders: string[]
} {
  return validateProductTable(parseCsv(text))
}

function looksLikeZip(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 2) return false
  const u8 = new Uint8Array(buf)
  return u8[0] === 0x50 && u8[1] === 0x4b
}

function decodeTextBuffer(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(u8.subarray(3))
  }
  const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(u8)
  const bad = (asUtf8.match(/\uFFFD/g) || []).length
  if (bad > 2 || /Ã.|å.|æ.|ä./.test(asUtf8.slice(0, 80))) {
    try {
      return new TextDecoder('gb18030').decode(u8)
    } catch {
      return asUtf8
    }
  }
  return asUtf8
}

async function sheetToTable(buf: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    { header: 1, defval: '', raw: false },
  )
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => String(c ?? '').trim()),
  )
}

/** 支持 .xlsx / .xls / .csv / .tsv；报「表头：PK」即 Excel 被当文本读 */
export async function importProductSpreadsheet(file: File): Promise<{
  issues: CsvIssue[]
  rows: ParsedProductRow[]
  mappedHeaders: string[]
  format: 'xlsx' | 'csv'
}> {
  const buf = await file.arrayBuffer()
  const name = file.name.toLowerCase()
  const isExcelExt =
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsm')
  const isZip = looksLikeZip(buf)

  if (isExcelExt || isZip) {
    try {
      const table = await sheetToTable(buf)
      return { ...validateProductTable(table), format: 'xlsx' }
    } catch (err) {
      return {
        issues: [
          {
            row: 0,
            reason:
              '无法解析 Excel：' +
              (err instanceof Error ? err.message : String(err)),
          },
        ],
        rows: [],
        mappedHeaders: [],
        format: 'xlsx',
      }
    }
  }

  return { ...validateProductCsv(decodeTextBuffer(buf)), format: 'csv' }
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
        row.originalPrice != null && Number.isFinite(Number(row.originalPrice))
          ? Number(row.originalPrice)
          : undefined,
      sellingPoints: Array.isArray(row.sellingPoints)
        ? row.sellingPoints.map(String)
        : [],
      category: String(row.category ?? '未分类'),
      imageTone: String(row.imageTone ?? 'from-sky-500 to-blue-700'),
      stock: Number(row.stock ?? 1000),
      monthlySales:
        row.monthlySales != null && Number.isFinite(Number(row.monthlySales))
          ? Number(row.monthlySales)
          : undefined,
      returnRate:
        row.returnRate != null && Number.isFinite(Number(row.returnRate))
          ? Number(row.returnRate)
          : undefined,
      grossMargin:
        row.grossMargin != null && Number.isFinite(Number(row.grossMargin))
          ? Number(row.grossMargin)
          : undefined,
    })
  }
  return { ok: true, products }
}

/** 导入说明文案 */
export const CSV_IMPORT_HINT =
  '可直接导入 Excel（.xlsx）或 CSV。必填：商品名称、价格。可选：分类、详情/卖点、近月销量、退货率、毛利率等。'
