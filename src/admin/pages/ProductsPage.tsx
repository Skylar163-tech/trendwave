import { useMemo, useRef, useState } from 'react'
import type { AppConfig, CatalogProduct } from '../../config/types'
import {
  ECOMMERCE_ICONS,
  GRADIENT_PRESETS,
} from '../../config/defaults'
import {
  parseProductsJson,
  productsToCsv,
  productsToJson,
  importProductSpreadsheet,
  CSV_IMPORT_HINT,
} from '../../services/productCsv'
import { AdminSectionCard, FieldError } from '../shared'
import { ProductCardView } from '../components/ProductCardView'

interface Props {
  draft: AppConfig
  onChange: (next: AppConfig) => void
}

type SortKey = 'price-asc' | 'price-desc' | 'category'

export function ProductsPage({ draft, onChange }: Props) {
  const [view, setView] = useState<'table' | 'card'>('card')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('全部')
  const [sort, setSort] = useState<SortKey>('price-desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<CatalogProduct | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [importReport, setImportReport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'csv' | 'json'>('csv')

  const categories = useMemo(() => {
    const set = new Set(draft.products.map((p) => p.category))
    return ['全部', ...[...set].sort()]
  }, [draft.products])

  const filtered = useMemo(() => {
    let list = [...draft.products]
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sellingPoints.some((s) => s.toLowerCase().includes(query)) ||
          p.brand.toLowerCase().includes(query),
      )
    }
    if (category !== '全部') {
      list = list.filter((p) => p.category === category)
    }
    list.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price
      if (sort === 'price-desc') return b.price - a.price
      return a.category.localeCompare(b.category, 'zh')
    })
    return list
  }, [draft.products, q, category, sort])

  const stats = useMemo(() => {
    const list = draft.products
    const cats = new Set(list.map((p) => p.category))
    const prices = list.map((p) => p.price)
    const min = prices.length ? Math.min(...prices) : 0
    const max = prices.length ? Math.max(...prices) : 0
    const discounts = list
      .filter((p) => p.originalPrice && p.originalPrice > 0)
      .map((p) => 1 - p.price / p.originalPrice!)
    const avgDiscount = discounts.length
      ? discounts.reduce((a, b) => a + b, 0) / discounts.length
      : 0
    return {
      total: list.length,
      categories: cats.size,
      min,
      max,
      avgDiscount,
    }
  }, [draft.products])

  const setProducts = (products: CatalogProduct[]) => {
    onChange({ ...draft, products })
  }

  const openCreate = () => {
    const id = nextProductId(draft.products)
    setIsNew(true)
    setFieldErrors({})
    setEditor({
      id,
      name: '',
      brand: '',
      icon: '🛍️',
      price: 99,
      originalPrice: 129,
      sellingPoints: [],
      category: categories.find((c) => c !== '全部') ?? '未分类',
      imageTone: GRADIENT_PRESETS[0]!,
      stock: 1000,
    })
  }

  const openEdit = (p: CatalogProduct) => {
    setIsNew(false)
    setFieldErrors({})
    setEditor({ ...p, sellingPoints: [...p.sellingPoints] })
  }

  const validateEditor = (p: CatalogProduct): Record<string, string> => {
    const err: Record<string, string> = {}
    if (!p.name.trim()) err.name = '请填写商品名称'
    if (!(p.price > 0)) err.price = '售价须大于 0'
    if (p.originalPrice != null) {
      if (!(p.originalPrice > 0)) err.originalPrice = '原价须大于 0'
      else if (p.originalPrice < p.price)
        err.originalPrice = '原价不能低于售价'
    }
    if (!p.category.trim()) err.category = '请填写品类'
    if (isNew && draft.products.some((x) => x.id === p.id)) {
      err.id = '该 ID 已存在'
    }
    return err
  }

  const saveEditor = () => {
    if (!editor) return
    const err = validateEditor(editor)
    setFieldErrors(err)
    if (Object.keys(err).length) return
    const brand = editor.brand.trim() || editor.name.slice(0, 2)
    const next = { ...editor, brand, name: editor.name.trim() }
    if (isNew) setProducts([...draft.products, next])
    else
      setProducts(draft.products.map((p) => (p.id === next.id ? next : p)))
    setEditor(null)
  }

  const countRefs = (productId: string) => {
    let n = 0
    for (const ids of Object.values(draft.newsRecommendations)) {
      if (ids.includes(productId)) n++
    }
    return n
  }

  const deleteProducts = (ids: string[]) => {
    const refNotes = ids
      .map((id) => {
        const p = draft.products.find((x) => x.id === id)
        const n = countRefs(id)
        return n > 0
          ? `「${p?.name ?? id}」在 ${n} 条热点推荐中被引用，删除后将自动移除关联`
          : null
      })
      .filter(Boolean)

    const msg = [
      `确认删除 ${ids.length} 件商品？`,
      ...refNotes,
    ].join('\n')
    if (!window.confirm(msg)) return

    const idSet = new Set(ids)
    const products = draft.products.filter((p) => !idSet.has(p.id))
    const newsRecommendations: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(draft.newsRecommendations)) {
      newsRecommendations[k] = v.filter((id) => !idSet.has(id))
    }
    onChange({ ...draft, products, newsRecommendations })
    setSelected(new Set())
    window.alert(`已删除 ${ids.length} 件`)
  }

  const batchCategory = () => {
    if (!selected.size) return
    const cat = window.prompt('输入新品类名称')
    if (!cat?.trim()) return
    let ok = 0
    const products = draft.products.map((p) => {
      if (!selected.has(p.id)) return p
      ok++
      return { ...p, category: cat.trim() }
    })
    setProducts(products)
    window.alert(`已更新 ${ok} 件，跳过 0 件`)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleImportFile = async (file: File) => {
    setImportReport(null)
    if (importMode === 'json') {
      const text = await file.text()
      const parsed = parseProductsJson(text)
      if (!parsed.ok) {
        setImportReport(
          `解析失败：${parsed.error}，请检查 JSON 格式`,
        )
        return
      }
      if (!parsed.products.length) {
        setImportReport('文件中没有有效商品，未导入任何数据')
        return
      }
      setProducts(parsed.products)
      setImportReport(`已导入 ${parsed.products.length} 件商品（覆盖当前列表）`)
      return
    }
    const { issues, rows, mappedHeaders, format } =
      await importProductSpreadsheet(file)
    if (!rows.length) {
      setImportReport(
        `校验失败，未导入任何数据：\n` +
          (issues.length
            ? issues.map((i) => `第 ${i.row} 行：${i.reason}`).join('\n')
            : '没有有效商品行'),
      )
      return
    }
    const products: CatalogProduct[] = rows.map((r, i) => ({
      id: nextProductId(draft.products, i),
      name: r.name,
      brand: r.brand?.trim() || r.name.slice(0, 2),
      icon: r.icon,
      price: r.price,
      originalPrice: r.originalPrice,
      sellingPoints: r.sellingPoints,
      category: r.category,
      imageTone: GRADIENT_PRESETS[i % GRADIENT_PRESETS.length]!,
      stock: 1000,
      monthlySales: r.monthlySales,
      returnRate: r.returnRate,
      grossMargin: r.grossMargin,
    }))
    setProducts(products)
    const warn =
      issues.length > 0
        ? `\n注意（已跳过/忽略部分行）：\n` +
          issues.map((i) => `第 ${i.row} 行：${i.reason}`).join('\n')
        : ''
    const mapHint = mappedHeaders.length
      ? `\n列映射：${mappedHeaders.join('，')}`
      : ''
    setImportReport(
      `已导入 ${products.length} 件商品（${format === 'xlsx' ? 'Excel' : 'CSV'}，覆盖当前列表）${mapHint}${warn}`,
    )
  }

  const exportCsv = () => {
    const blob = new Blob([productsToCsv(draft.products)], {
      type: 'text/csv;charset=utf-8',
    })
    downloadBlob(blob, 'trendwave-products.csv')
  }

  const exportJson = () => {
    const blob = new Blob([productsToJson(draft.products)], {
      type: 'application/json',
    })
    downloadBlob(blob, 'trendwave-products.json')
  }

  return (
    <>
      <AdminSectionCard
        id="stats"
        title="统计概览"
        description="当前商品库数据摘要"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="商品总数" value={String(stats.total)} />
          <Stat label="品类数" value={String(stats.categories)} />
          <Stat
            label="价格区间"
            value={`¥${stats.min}～${stats.max}`}
          />
          <Stat
            label="平均折扣"
            value={`${(stats.avgDiscount * 100).toFixed(1)}%`}
          />
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        id="list"
        title="商品列表"
        description="卡片/表格视图、搜索筛选与批量操作"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
              onClick={openCreate}
            >
              新增商品
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
              onClick={() => setView(view === 'card' ? 'table' : 'card')}
            >
              {view === 'card' ? '表格视图' : '卡片视图'}
            </button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索名称 / 卖点"
            className="rounded-lg border border-surface-300 px-3 py-1.5 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-surface-300 px-2 py-1.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-surface-300 px-2 py-1.5 text-sm"
          >
            <option value="price-desc">售价降序</option>
            <option value="price-asc">售价升序</option>
            <option value="category">按品类</option>
          </select>
          {selected.size > 0 && (
            <>
              <button
                type="button"
                className="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                onClick={batchCategory}
              >
                批量改品类（{selected.size}）
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-300 px-2 py-1.5 text-xs font-semibold text-rose-700"
                onClick={() => deleteProducts([...selected])}
              >
                批量删除
              </button>
            </>
          )}
        </div>

        {view === 'card' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div key={p.id} className="relative">
                <label className="absolute left-2 top-2 z-10">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                  />
                </label>
                <ProductCardView
                  product={p}
                  onClick={() => openEdit(p)}
                  showCategory
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-surface-700/60">
                <tr>
                  <th className="p-2">选</th>
                  <th className="p-2">图标</th>
                  <th className="p-2">名称</th>
                  <th className="p-2">品类</th>
                  <th className="p-2">售价</th>
                  <th className="p-2">原价</th>
                  <th className="p-2">卖点</th>
                  <th className="p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-surface-100">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="p-2 text-lg">{p.icon}</td>
                    <td className="p-2 font-medium">{p.name}</td>
                    <td className="p-2">{p.category}</td>
                    <td className="p-2">¥{p.price}</td>
                    <td className="p-2">
                      {p.originalPrice != null ? `¥${p.originalPrice}` : '—'}
                    </td>
                    <td className="p-2 text-xs text-surface-700/70">
                      {p.sellingPoints.join('、')}
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-600"
                        onClick={() => openEdit(p)}
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        id="import"
        title="导入导出"
        description={CSV_IMPORT_HINT}
      >
        <div className="flex flex-wrap gap-2">
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'csv' | 'json')}
            className="rounded-lg border px-2 py-1.5 text-sm"
          >
            <option value="csv">导入 Excel / CSV</option>
            <option value="json">导入 JSON</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept={
              importMode === 'csv'
                ? '.csv,.tsv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
                : '.json'
            }
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            onClick={() => fileRef.current?.click()}
          >
            选择文件
          </button>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            onClick={exportCsv}
          >
            导出 CSV
          </button>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            onClick={exportJson}
          >
            导出 JSON
          </button>
        </div>
        {importReport && (
          <pre
            className={[
              'mt-3 whitespace-pre-wrap rounded-lg p-3 text-xs',
              importReport.startsWith('已导入')
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-surface-50 text-rose-700',
            ].join(' ')}
          >
            {importReport}
          </pre>
        )}
      </AdminSectionCard>

      {editor && (
        <ProductEditorModal
          product={editor}
          categories={categories.filter((c) => c !== '全部')}
          fieldErrors={fieldErrors}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          onDelete={
            isNew
              ? undefined
              : () => {
                  deleteProducts([editor.id])
                  setEditor(null)
                }
          }
        />
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50/80 px-3 py-3">
      <div className="text-[11px] text-surface-700/55">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold">{value}</div>
    </div>
  )
}

function nextProductId(products: CatalogProduct[], offset = 0): string {
  let n = products.length + 1 + offset
  let id = `p${n}`
  const ids = new Set(products.map((p) => p.id))
  while (ids.has(id)) {
    n++
    id = `p${n}`
  }
  return id
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function ProductEditorModal({
  product,
  categories,
  fieldErrors,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  product: CatalogProduct
  categories: string[]
  fieldErrors: Record<string, string>
  onChange: (p: CatalogProduct) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  const [tagInput, setTagInput] = useState('')
  const discount =
    product.originalPrice && product.originalPrice > 0
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : null

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (product.sellingPoints.includes(t)) {
      setTagInput('')
      return
    }
    onChange({
      ...product,
      sellingPoints: [...product.sellingPoints, t],
    })
    setTagInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="grid max-h-[90vh] w-full max-w-4xl grid-cols-1 gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl md:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-semibold">编辑商品</h3>
          <p className="text-xs text-surface-700/60">
            ID {product.id} · 右侧实时预览
          </p>
          <FieldError message={fieldErrors.id} />

          <label className="mt-3 block text-sm">
            名称
            <input
              value={product.name}
              onChange={(e) => onChange({ ...product, name: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <FieldError message={fieldErrors.name} />
          </label>

          <label className="mt-3 block text-sm">
            品牌
            <input
              value={product.brand}
              onChange={(e) => onChange({ ...product, brand: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          <div className="mt-3 text-sm">
            图标
            <div className="mt-1 flex flex-wrap gap-1">
              {ECOMMERCE_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={[
                    'rounded-md border px-2 py-1 text-lg',
                    product.icon === ic
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200',
                  ].join(' ')}
                  onClick={() => onChange({ ...product, icon: ic })}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              value={product.icon}
              onChange={(e) => onChange({ ...product, icon: e.target.value })}
              className="mt-2 w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="mt-3 text-sm">
            卡片底色
            <div className="mt-1 grid grid-cols-6 gap-1.5">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g}
                  type="button"
                  title={g}
                  onClick={() => onChange({ ...product, imageTone: g })}
                  className={[
                    'h-8 rounded-md bg-gradient-to-br',
                    g,
                    product.imageTone === g
                      ? 'ring-2 ring-brand-500 ring-offset-1'
                      : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              售价
              <input
                type="number"
                value={product.price}
                onChange={(e) =>
                  onChange({ ...product, price: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
              <FieldError message={fieldErrors.price} />
            </label>
            <label className="text-sm">
              原价
              <input
                type="number"
                value={product.originalPrice ?? ''}
                onChange={(e) =>
                  onChange({
                    ...product,
                    originalPrice: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
              <FieldError message={fieldErrors.originalPrice} />
            </label>
          </div>
          {discount != null && (
            <p className="mt-1 text-xs text-brand-700">
              折扣约 {discount}%
            </p>
          )}

          <label className="mt-3 block text-sm">
            品类
            <input
              list="cat-list"
              value={product.category}
              onChange={(e) =>
                onChange({ ...product, category: e.target.value })
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <datalist id="cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldError message={fieldErrors.category} />
          </label>

          <div className="mt-3 text-sm">
            卖点标签（建议 2～4 个）
            <div className="mt-1 flex flex-wrap gap-1">
              {product.sellingPoints.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...product,
                        sellingPoints: product.sellingPoints.filter(
                          (x) => x !== s,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              className="mt-2 w-full rounded-lg border px-3 py-2"
              placeholder="输入后回车添加"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
            >
              保存商品
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              取消
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700"
              >
                删除
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-surface-700">
            卡片预览
          </div>
          <ProductCardView product={product} showCategory />
        </div>
      </div>
    </div>
  )
}
