// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1B — Provider adapter (server-side only)
//
// Keeps the model provider behind a single interface so the Worker never hard-
// codes an AI vendor. Two modes:
//   * 'openai'  — any OpenAI-compatible /chat/completions endpoint (configured
//                 entirely via Worker secrets; keys NEVER reach the browser).
//   * 'fixture' — deterministic, offline portfolio for dev/test. FAILS CLOSED in
//                 production so fake personas can never ship to real creators.
//
// This module is server-only (imported by worker/index.ts). It shares the pure
// contract in src/lib/persona-portfolio.ts for the fixture + prompt shape.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildDeterministicPortfolio,
  PORTFOLIO_DIRECTIVE,
  PORTFOLIO_SIZE,
  RANK_LABEL,
  type CreatorGenerationContext,
  type PortfolioSource,
} from '../src/lib/persona-portfolio.ts';

export interface ProviderEnv {
  PERSONA_PROVIDER?: string;
  PERSONA_PROVIDER_BASE_URL?: string;
  PERSONA_PROVIDER_API_KEY?: string;
  PERSONA_MODEL?: string;
  PERSONA_APP_ENV?: string;
}

export interface ProviderDeps {
  fetch: typeof fetch;
}

export interface ProviderResult {
  raw: unknown;
  provider: string;
  model: string;
  method: 'ai_provider' | 'fixture';
}

export class ProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

const PROVIDER_TIMEOUT_MS = 60_000;

/** Which method the configured environment resolves to (used for provenance + gating). */
export function resolveProviderMethod(env: ProviderEnv): 'ai_provider' | 'fixture' {
  const configured = (env.PERSONA_PROVIDER || '').trim().toLowerCase();
  return configured === 'fixture' ? 'fixture' : 'ai_provider';
}

function isProduction(env: ProviderEnv): boolean {
  return (env.PERSONA_APP_ENV || '').trim().toLowerCase() === 'production';
}

/** The JSON shape the model must return, described in-prompt (provider-agnostic). */
function schemaHint(): string {
  return [
    '{',
    '  "personas": [',
    '    {',
    '      "source_variation_id": "<one of the provided source ids>",',
    '      "display_name": "string",',
    '      "persona_title": "string",',
    '      "one_line_premise": "string",',
    '      "apparent_age_or_life_stage": "string",',
    '      "backstory": "string",',
    '      "current_situation": "string",',
    '      "personality_traits": ["string", "..."],',
    '      "what_she_wants": "string",',
    '      "audience_relationship": "string",',
    '      "visual_world": "string",',
    '      "typical_locations": ["string", "..."],',
    '      "wardrobe_direction": "string",',
    '      "recurring_story_hooks": ["string", "..."],',
    '      "content_boundaries": ["string", "..."],',
    '      "story_progression": "string"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

export function buildMessages(args: {
  sources: PortfolioSource[];
  context: CreatorGenerationContext;
  lockedArchetypes: { primary: string; secondary: string; third: string };
}): { system: string; user: string } {
  const { sources, context, lockedArchetypes } = args;
  const creatorName = (context.display_name || context.model_name || 'the creator').trim();

  const system = [
    'You are a senior creator-strategy director for a professional creator-management product.',
    `You design coherent persona portfolios. ${PORTFOLIO_DIRECTIVE}`,
    'Each persona is a distinct, authentic facet of the SAME creator — different enough to carry its own storyline and audience proposition, yet unmistakably the same person.',
    'Write professional, brand-safe strategy copy. Do NOT write sexually explicit content. Keep everything suitable for a creator-facing strategy product.',
    'Return ONLY valid JSON matching the requested schema. No markdown, no commentary.',
  ].join(' ');

  const sourceLines = sources
    .map(
      s =>
        `  ${s.portfolio_position}. [${RANK_LABEL[s.rank]} · ${s.archetype}] source_variation_id=${s.variation_id} — "${s.name}": ${s.description || '(no description)'}`,
    )
    .join('\n');

  const user = [
    `Creator: ${creatorName}.`,
    `Locked archetype basis — primary: ${lockedArchetypes.primary}; secondary: ${lockedArchetypes.secondary}; third: ${lockedArchetypes.third}.`,
    '',
    `Build EXACTLY ${PORTFOLIO_SIZE} personas — one per source below, weighted 3 primary / 2 secondary / 1 third:`,
    sourceLines,
    '',
    'Rules:',
    `- Produce exactly one persona object per source_variation_id listed above (${PORTFOLIO_SIZE} total).`,
    '- Echo back the exact source_variation_id on each persona.',
    '- Every persona is a facet of the same creator; keep a shared throughline while making each distinct.',
    '- Fill every field. Arrays must have at least two concise entries.',
    '',
    'Return JSON in exactly this shape:',
    schemaHint(),
  ].join('\n');

  return { system, user };
}

async function callOpenAiCompatible(
  env: ProviderEnv,
  messages: { system: string; user: string },
  deps: ProviderDeps,
): Promise<ProviderResult> {
  const baseUrl = (env.PERSONA_PROVIDER_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.PERSONA_PROVIDER_API_KEY || '';
  const model = env.PERSONA_MODEL || '';
  if (!baseUrl || !apiKey || !model) {
    throw new ProviderError('provider_not_configured', 'AI provider is not fully configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await deps.fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Never surface the raw error (may embed the URL/headers). Sanitised only.
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new ProviderError(
      aborted ? 'provider_timeout' : 'provider_request_failed',
      aborted ? 'The AI provider timed out.' : 'The AI provider request failed.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ProviderError('provider_http_error', `The AI provider returned status ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProviderError('provider_bad_json', 'The AI provider returned non-JSON.');
  }

  const content = (body as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ProviderError('provider_empty', 'The AI provider returned an empty completion.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new ProviderError('provider_bad_json', 'The AI provider completion was not valid JSON.');
  }

  return { raw, provider: 'openai', model, method: 'ai_provider' };
}

/**
 * Produce a raw portfolio for the given source set. Chooses fixture vs live
 * provider from the environment; fixture is refused in production.
 */
export async function generatePortfolio(
  args: {
    env: ProviderEnv;
    sources: PortfolioSource[];
    context: CreatorGenerationContext;
    lockedArchetypes: { primary: string; secondary: string; third: string };
  },
  deps: ProviderDeps = { fetch: globalThis.fetch },
): Promise<ProviderResult> {
  const method = resolveProviderMethod(args.env);

  if (method === 'fixture') {
    if (isProduction(args.env)) {
      throw new ProviderError('fixture_disabled_in_production', 'Fixture provider is disabled in production.');
    }
    return {
      raw: buildDeterministicPortfolio(args.sources, args.context),
      provider: 'fixture',
      model: 'deterministic-fixture',
      method: 'fixture',
    };
  }

  const messages = buildMessages({
    sources: args.sources,
    context: args.context,
    lockedArchetypes: args.lockedArchetypes,
  });
  return callOpenAiCompatible(args.env, messages, deps);
}
