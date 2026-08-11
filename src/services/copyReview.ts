import type { AppConfig } from '../config/types'
import {
  materialFromProducts,
  runMachineChecks,
  type CheckItem,
  type MachineCheckResult,
} from './copyQA'
import { callChatModel, FriendlyLlmError, resolveSceneTemperature } from './llmClient'
import type { CatalogProduct } from '../config/types'
import { buildMaterialPrompt } from './promptEngine'

export interface ReviewScores {
  relevance: number
  fidelity: number
  appeal: number
  naturalness: number
  comment: string
  failed?: boolean
  raw?: string
}

export function averageReview(scores: ReviewScores): number {
  if (scores.failed) return 0
  const vals = [
    scores.relevance,
    scores.fidelity,
    scores.appeal,
    scores.naturalness,
  ]
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** 从模型输出中捞结构化评审结果 */
export function parseReviewPayload(text: string): ReviewScores {
  const tryParse = (s: string): ReviewScores | null => {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>
      const num = (k: string) => {
        const v = Number(obj[k])
        if (!Number.isFinite(v)) return null
        return Math.min(5, Math.max(1, Math.round(v)))
      }
      const relevance = num('relevance')
      const fidelity = num('fidelity')
      const appeal = num('appeal')
      const naturalness = num('naturalness')
      if (
        relevance == null ||
        fidelity == null ||
        appeal == null ||
        naturalness == null
      ) {
        return null
      }
      return {
        relevance,
        fidelity,
        appeal,
        naturalness,
        comment: typeof obj.comment === 'string' ? obj.comment : '',
      }
    } catch {
      return null
    }
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [
    fenced?.[1]?.trim(),
    text.trim(),
    text.match(/\{[\s\S]*\}/)?.[0],
  ].filter(Boolean) as string[]

  for (const c of candidates) {
    const parsed = tryParse(c)
    if (parsed) return parsed
  }
  return {
    relevance: 0,
    fidelity: 0,
    appeal: 0,
    naturalness: 0,
    comment: '评审结果解析失败',
    failed: true,
    raw: text,
  }
}

export async function reviewCopyWithModel(
  config: AppConfig,
  copy: string,
  meta: { newsTitle: string; productNames: string },
): Promise<ReviewScores> {
  try {
    const result = await callChatModel(
      config.model,
      [
        { role: 'system', content: config.prompts.reviewPrompt },
        {
          role: 'user',
          content: `热点：${meta.newsTitle}\n商品：${meta.productNames}\n文案：\n${copy}`,
        },
      ],
      { temperature: resolveSceneTemperature(config.model, 'review') },
    )
    return parseReviewPayload(result.content)
  } catch (err) {
    const msg =
      err instanceof FriendlyLlmError
        ? err.message
        : err instanceof Error
          ? err.message
          : '评审调用失败'
    return {
      relevance: 0,
      fidelity: 0,
      appeal: 0,
      naturalness: 0,
      comment: msg,
      failed: true,
    }
  }
}

export function composeTotalScore(
  machine: MachineCheckResult,
  review: ReviewScores | null,
  machineWeight: number,
  reviewWeight: number,
  enableReview: boolean,
): number {
  if (!enableReview || !review || review.failed) {
    return machine.score
  }
  const mw = machineWeight
  const rw = reviewWeight
  const sum = mw + rw || 1
  const review100 = (averageReview(review) / 5) * 100
  return Math.round((machine.score * mw + review100 * rw) / sum)
}

export interface ReworkRound {
  round: number
  beforeScore: number
  afterScore: number
  accepted: boolean
  fixedIds: string[]
  remainingIds: string[]
  content: string
}

export interface ReworkResult {
  content: string
  machine: MachineCheckResult
  rounds: ReworkRound[]
  improved: boolean
}

function formatFailures(items: CheckItem[]): string {
  return items
    .map((i) => `- [${i.label}] ${i.reason ?? '未通过'}`)
    .join('\n')
}

/**
 * 自动返工：只送可修问题；分数没涨则保留上一版。
 */
export async function autoReworkCopy(opts: {
  config: AppConfig
  copy: string
  products: CatalogProduct[]
  newsTags: string[]
  newsTitle: string
  newsSummary: string
  tone: string
  styleName: string
  styleInstruction: string
  maxRounds?: number
}): Promise<ReworkResult> {
  const maxRounds = opts.maxRounds ?? 2
  let current = opts.copy
  const material = materialFromProducts(opts.products, opts.newsTags)
  let machine = runMachineChecks(current, material, opts.config.eval)
  const rounds: ReworkRound[] = []

  for (let r = 1; r <= maxRounds; r++) {
    const todo = machine.reworkableFailures
    if (todo.length === 0) break

    const beforeScore = machine.score
    const beforeIds = new Set(todo.map((i) => i.id))

    const userPrompt = [
      opts.config.prompts.rewriteInstructions,
      '',
      '需要修改的问题：',
      formatFailures(todo),
      '',
      '素材参考：',
      buildMaterialPrompt(opts.config.prompts.materialTemplate, {
        newsTitle: opts.newsTitle,
        newsSummary: opts.newsSummary,
        newsTags: opts.newsTags,
        tone: opts.tone,
        styleName: opts.styleName,
        styleInstruction: opts.styleInstruction,
        products: opts.products,
        productItemFormat: opts.config.prompts.productItemFormat,
      }),
      '',
      '原文：',
      current,
    ].join('\n')

    let nextContent: string
    try {
      const result = await callChatModel(
        opts.config.model,
        [
          { role: 'system', content: opts.config.prompts.systemRole },
          { role: 'user', content: userPrompt },
        ],
        { temperature: resolveSceneTemperature(opts.config.model, 'review') },
      )
      nextContent = result.content.trim()
    } catch {
      break
    }

    const nextMachine = runMachineChecks(nextContent, material, opts.config.eval)
    const accepted = nextMachine.score >= beforeScore
    const afterIds = new Set(
      nextMachine.reworkableFailures.map((i) => i.id),
    )
    const fixedIds = [...beforeIds].filter((id) => !afterIds.has(id))
    const remainingIds = [...afterIds]

    if (accepted) {
      current = nextContent
      machine = nextMachine
    }

    rounds.push({
      round: r,
      beforeScore,
      afterScore: nextMachine.score,
      accepted,
      fixedIds,
      remainingIds: accepted ? remainingIds : [...beforeIds],
      content: accepted ? nextContent : current,
    })

    if (accepted && nextMachine.reworkableFailures.length === 0) break
  }

  return {
    content: current,
    machine,
    rounds,
    improved: rounds.some((r) => r.accepted && r.afterScore > r.beforeScore),
  }
}
