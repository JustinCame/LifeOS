// Model call for the passive-insight layer.
//
// Contract: call Anthropic with a narrow, pre-computed slice from a trigger.
// Get back either a validated {title, body, actions} object or null. Never
// let a model error propagate — passive insights are additive and must never
// break the app.
//
// Two null shapes matter:
//   - Model responded with `NONE` (or refusal) → no insight is worth showing
//     right now. Caller records the inputHash as "seen" so the same slice
//     doesn't fire another call.
//   - API failed (no key, network, 4xx/5xx) → don't record anything; a
//     retry on the next trigger fire should be free to try again.

import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from '../../db'
import { ANTHROPIC_KEY_SETTING } from '../anthropic'
import { BASE_PROMPT, COACH_CONFIG, type CoachModel } from '../coaches'
import type { InsightAction } from '../../db/types'

// Which coach's model tier to use. Passive layer routes to the same Claude
// versions the coaches use so there's no version drift between the two.
export type ModelTier = 'haiku' | 'sonnet' | 'opus'

// Maps to what's currently pinned in COACH_CONFIG. Update alongside the
// coach models if we ever move the whole app to Opus 5 / Sonnet 5.
const MODEL_BY_TIER: Record<ModelTier, CoachModel> = {
  // Alfred and Benson are on Haiku 4.5 today — reuse that ID.
  haiku: COACH_CONFIG.home.model,
  // Sebastian / Cornelius / Jarvis all run Sonnet 4.6.
  sonnet: COACH_CONFIG.fitness.model,
  // No coach uses Opus 4.7 for chat, but program_diff (Phase 6) will —
  // pinning it here so all model choices live in one place.
  opus: 'claude-opus-4-7',
}

const PASSIVE_MODE_BLOCK = `## Passive insight mode

You are not in a conversation. You are writing a single small card that will
appear inline in the app. The user did not ask you anything.

- title: max 60 chars, no trailing punctuation.
- body: 1-3 sentences, max 320 chars. Reference at least one exact number,
  date, or name from the data you were given.
- actions: ALWAYS output an empty array []. Do not include action buttons.
  Card action routing isn't wired up yet, so any button you invent would be
  a dead link that frustrates the user. The card has its own dismiss (X);
  don't duplicate it.
- If nothing in this data would change what the user does today, output
  exactly: NONE
- Emitting NONE is a success, not a failure. Most checks should produce NONE.
  Do not manufacture an observation to fill the card.
- Never repeat an observation listed under "recently dismissed".
`

// JSON schema for the model output. Uses `output_config.format` (structured
// outputs) so the model is guaranteed to return valid JSON matching this
// shape — no parse-failure fallback needed. Haiku 4.5 supports this natively.
//
// Note: structured outputs REQUIRE `additionalProperties: false` on every
// object schema, which means a free-form `payload: { type: 'object' }`
// isn't allowed. Actions here are label + kind only; when a future phase
// needs to carry structured payload data (navigation target, mutate params),
// either encode it in the label or add a per-kind schema branch (anyOf).
const INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body', 'actions'],
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'kind'],
        properties: {
          label: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['navigate', 'mutate', 'dismiss', 'snooze'],
          },
        },
      },
    },
  },
} as const

export interface GeneratedInsight {
  title: string
  body: string
  actions: InsightAction[]
}

export type GenerateOutcome =
  // Model returned a validated insight — insert it.
  | { kind: 'insight'; insight: GeneratedInsight }
  // Model explicitly said nothing's worth reporting for this slice. Record
  // the inputHash to skip so we don't ask again on the same data.
  | { kind: 'none' }
  // No API key (or model call failed). Do NOT record the inputHash so a
  // future call can retry once the user pastes a key / network recovers.
  | { kind: 'skipped'; reason: string }

interface GenerateArgs {
  tier: ModelTier
  promptHint: string
  slice: Record<string, unknown>
  // Titles of recently dismissed insights of this trigger kind. Injected so
  // the model doesn't keep suggesting the same thing. Max ~10 recommended.
  recentlyDismissedTitles: string[]
}

export async function generateInsight(
  args: GenerateArgs,
): Promise<GenerateOutcome> {
  const apiKey = await getApiKey()
  if (!apiKey) return { kind: 'skipped', reason: 'no_api_key' }

  const model = MODEL_BY_TIER[args.tier]
  const system = `${BASE_PROMPT}${PASSIVE_MODE_BLOCK}`
  const dismissedBlock =
    args.recentlyDismissedTitles.length > 0
      ? `\n\n## Recently dismissed (don't repeat these observations)\n${args.recentlyDismissedTitles.map((t) => `- ${t}`).join('\n')}`
      : ''
  const userMessage = `${args.promptHint}\n\n## Data\n\`\`\`json\n${JSON.stringify(args.slice, null, 2)}\n\`\`\`${dismissedBlock}`

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userMessage }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: INSIGHT_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    } as Parameters<typeof client.messages.create>[0])

    // Refusal → treat as "nothing to say" for this slice.
    if (response.stop_reason === 'refusal') return { kind: 'none' }

    // Collect text blocks. With structured outputs, the model returns a
    // single JSON string in a text block.
    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Model can still emit NONE (as prose) if it decides no insight fits —
    // structured outputs constrain the JSON shape but not the choice to
    // respond at all. Guard against both a literal "NONE" and empty output.
    if (!text || text.toUpperCase() === 'NONE') return { kind: 'none' }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Should not happen with structured outputs — but if the model
      // slipped, treat as NONE rather than crashing.
      console.warn('[insights] JSON parse failed', text)
      return { kind: 'none' }
    }

    const insight = validate(parsed)
    if (!insight) {
      console.warn('[insights] schema validation failed', parsed)
      return { kind: 'none' }
    }
    return { kind: 'insight', insight }
  } catch (err) {
    // Network / 4xx / 5xx / rate limit. Don't record inputHash — free retry
    // on the next trigger fire.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[insights] generate failed', msg)
    return { kind: 'skipped', reason: msg }
  }
}

async function getApiKey(): Promise<string | null> {
  const fromDb = await getSetting<string>(ANTHROPIC_KEY_SETTING)
  if (fromDb && fromDb.trim()) return fromDb.trim()
  const fromEnv = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim()
  return fromEnv || null
}

// Runtime schema validation. `output_config.format` should already guarantee
// shape, but the passive layer never renders unvalidated model output.
//
// Actions are currently stripped at the validate boundary — even if Haiku
// slips a "navigate" or "mutate" through the prompt guard, we drop it here.
// When per-trigger action routing lands (Phase 5+), this becomes an
// allowlist keyed to the trigger's declared supportedActionKinds.
function validate(x: unknown): GeneratedInsight | null {
  if (!x || typeof x !== 'object') return null
  const obj = x as Record<string, unknown>
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  const body = typeof obj.body === 'string' ? obj.body.trim() : ''
  if (!title || !body) return null
  if (title.length > 80) return null // hard cap; schema soft-limits at 60
  if (body.length > 400) return null

  // Actions are intentionally always empty for now — see PASSIVE_MODE_BLOCK.
  const actions: InsightAction[] = []
  return { title, body, actions }
}
