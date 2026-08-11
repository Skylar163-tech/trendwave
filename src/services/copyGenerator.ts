import type { AppConfig, CatalogProduct, CreativeStyle } from '../config/types'
import type { CopyVariant, NewsItem, Product } from '../types/workflow'
import { buildMaterialPrompt } from './promptEngine'
import {
  accessModeLabel,
  callChatModel,
  FriendlyLlmError,
  resolveSceneTemperature,
} from './llmClient'
import { runCozeWorkflow } from './cozeWorkflow'
import type { IntegrationConfig } from '../types/integration'
import { isIntegrationReady } from '../types/integration'
import { autoReworkCopy } from './copyReview'
import { materialFromProducts, runMachineChecks } from './copyQA'

export type CopySource = 'mock' | 'workflow' | 'llm' | 'proxy' | 'direct'

export interface GenerateCopyResult {
  variants: CopyVariant[]
  source: CopySource
  warning?: string
  reworkNotes?: string[]
}

function toCatalog(product: Product): CatalogProduct {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    icon: (product as Product & { icon?: string }).icon ?? '🛍️',
    price: product.price,
    originalPrice: product.originalPrice,
    sellingPoints: product.sellingPoints,
    category: product.category,
    imageTone: product.imageTone,
    stock: product.stock,
  }
}

/**
 * 文案生成：按创作风格各跑一遍；优先使用 AppConfig 提示词与模型设置。
 */
export async function generateWeiboCopy(
  news: NewsItem,
  product: Product,
  integration: IntegrationConfig | null | undefined,
  appConfig?: AppConfig,
  opts?: { tone?: string; enableRework?: boolean },
): Promise<GenerateCopyResult> {
  const tone = opts?.tone ?? '热点借势'
  const enableRework = opts?.enableRework ?? true

  // 无 AppConfig 时回退旧逻辑（兼容）；主路径始终带 AppConfig
  if (!appConfig) {
    return legacyGenerate(
      news,
      product,
      integration ?? {
        mode: 'mock',
        workflowUrl: '',
        workflowId: '',
        workflowInputKey: 'input',
        llmBaseUrl: '',
        llmModel: '',
        apiKey: '',
      },
    )
  }

  const styles =
    appConfig.creativeStyles.length > 0
      ? appConfig.creativeStyles
      : [
          {
            id: 'fallback',
            name: '默认',
            instruction: '生成一条微博营销文案',
          } satisfies CreativeStyle,
        ]

  // 主路径：运营后台 AppConfig（提示词 + 模型），不经扣子工作流
  if (appConfig.model.mode === 'mock') {
    return {
      variants: await buildMockFromStyles(news, product, styles, tone),
      source: 'mock',
    }
  }

  const catalog = toCatalog(product)
  const variants: CopyVariant[] = []
  const reworkNotes: string[] = []
  let lastSource: CopySource = appConfig.model.mode

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i]!
    const user = buildMaterialPrompt(appConfig.prompts.materialTemplate, {
      newsTitle: news.title,
      newsSummary: news.summary,
      newsTags: news.tags,
      tone,
      styleName: style.name,
      styleInstruction: style.instruction,
      products: [catalog],
      productItemFormat: appConfig.prompts.productItemFormat,
    })

    try {
      const result = await callChatModel(
        appConfig.model,
        [
          { role: 'system', content: appConfig.prompts.systemRole },
          { role: 'user', content: user },
        ],
        { temperature: resolveSceneTemperature(appConfig.model, 'creative') },
      )
      lastSource = result.mode
      let content = result.content.trim()

      if (enableRework) {
        const material = materialFromProducts([catalog], news.tags)
        const check = runMachineChecks(content, material, appConfig.eval)
        if (check.reworkableFailures.length) {
          const rework = await autoReworkCopy({
            config: appConfig,
            copy: content,
            products: [catalog],
            newsTags: news.tags,
            newsTitle: news.title,
            newsSummary: news.summary,
            tone,
            styleName: style.name,
            styleInstruction: style.instruction,
            maxRounds: 2,
          })
          content = rework.content
          if (rework.rounds.length) {
            reworkNotes.push(
              `${style.name}：返工 ${rework.rounds.length} 轮，最终机检 ${rework.machine.score}`,
            )
          }
        }
      }

      variants.push({
        id: `gen-${i + 1}`,
        label: `版本 ${String.fromCharCode(65 + i)} · ${style.name}`,
        tone: style.name,
        content,
      })
    } catch (err) {
      const msg =
        err instanceof FriendlyLlmError
          ? err.message
          : err instanceof Error
            ? err.message
            : '生成失败'
      variants.push({
        id: `gen-${i + 1}`,
        label: `版本 ${String.fromCharCode(65 + i)} · ${style.name}`,
        tone: style.name,
        content: `【生成失败：${msg}】可检查模型配置后重试。`,
      })
    }
  }

  return {
    variants,
    source: lastSource,
    reworkNotes,
    warning:
      lastSource === 'mock'
        ? undefined
        : reworkNotes.length
          ? reworkNotes.join('；')
          : undefined,
  }
}

async function legacyGenerate(
  news: NewsItem,
  product: Product,
  config: IntegrationConfig,
): Promise<GenerateCopyResult> {
  if (config.mode === 'mock' || !isIntegrationReady(config)) {
    return {
      variants: await buildMockFromStyles(
        news,
        product,
        [
          { id: 'a', name: '热点借势', instruction: '' },
          { id: 'b', name: '种草种心', instruction: '' },
          { id: 'c', name: '互动引导', instruction: '' },
        ],
        '热点借势',
      ),
      source: 'mock',
      warning:
        config.mode !== 'mock'
          ? '集成配置不完整，已回退到本地模拟文案'
          : undefined,
    }
  }
  try {
    if (config.mode === 'workflow') {
      const { texts } = await runCozeWorkflow(news, product, config)
      return {
        variants: texts.slice(0, 3).map((content, i) => ({
          id: `live-${i + 1}`,
          label: `版本 ${String.fromCharCode(65 + i)}`,
          tone: '自定义',
          content: content.trim() || fallbackLine(news, product),
        })),
        source: 'workflow',
      }
    }
    // llm via integration fields
    const result = await callChatModel(
      {
        mode: 'direct',
        provider: 'custom',
        baseUrl: config.llmBaseUrl,
        modelName: config.llmModel,
        apiKey: config.apiKey,
        temperature: 0.8,
        temperatures: {
          creative: 0.8,
          newsGate: 0.1,
          productMatch: 0.2,
          review: 0.2,
        },
        stream: false,
        workflowUrl: config.workflowUrl,
        workflowId: config.workflowId,
        workflowInputKey: config.workflowInputKey,
      },
      [
        { role: 'system', content: '你是专业的中文电商社媒文案助手。' },
        {
          role: 'user',
          content: `热点：${news.title}\n商品：${product.brand} ${product.name}\n请生成 1 条微博文案`,
        },
      ],
      { temperature: 0.8 },
    )
    return {
      variants: [
        {
          id: 'llm-1',
          label: '版本 A',
          tone: '自定义',
          content: result.content,
        },
      ],
      source: 'llm',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '外部接口调用失败'
    return {
      variants: await buildMockFromStyles(
        news,
        product,
        [{ id: 'a', name: '热点借势', instruction: '' }],
        '热点借势',
      ),
      source: 'mock',
      warning: `${message}，已回退到本地模拟文案`,
    }
  }
}

async function buildMockFromStyles(
  news: NewsItem,
  product: Product,
  styles: CreativeStyle[],
  tone: string,
): Promise<CopyVariant[]> {
  await delay(800)
  const tag = news.tags[0] ?? news.category
  const priceTag =
    product.originalPrice != null
      ? `活动价 ¥${product.price}（原价 ¥${product.originalPrice}）`
      : `到手价 ¥${product.price}`

  return styles.map((style, i) => ({
    id: `v${i + 1}`,
    label: `版本 ${String.fromCharCode(65 + i)} · ${style.name}`,
    tone: style.name || tone,
    content: `#${tag}# 借着热点「${news.title}」聊聊【${product.brand} ${product.name}】${(product as Product & { icon?: string }).icon ?? '✨'}
${product.sellingPoints.map((p) => `· ${p}`).join('\n')}
${priceTag}
风格要点：${style.instruction || style.name}
你怎么看？评论区告诉我 💬`,
  }))
}

function fallbackLine(news: NewsItem, product: Product): string {
  return `#${news.tags[0] ?? '热点'}# ${product.brand} ${product.name}，借势「${news.title}」火速种草～`
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export { accessModeLabel }
