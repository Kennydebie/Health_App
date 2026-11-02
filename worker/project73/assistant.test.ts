import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseIntentWithRules, resolveIngredientWord } from '../../src/lib/project73/assistantIntents';
import { handleAssistant, validateModelOutput } from './assistant';
import { resetRateLimits } from './http';

const context = { today: '2026-11-02', kcalTarget: 1800, proteinTarget: 140, horizonDays: 3, pantry: [], plannedRecipes: [], availableRecipes: [] };

function post(message: string) {
  return new Request('https://p73.example/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, context }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetRateLimits();
});

describe('assistant intent parsing (Dutch, deterministic fallback)', () => {
  it.each([
    ['Plan mijn eten voor drie dagen.', { intent: 'plan_meals', days: 3 }],
    ['Ik wil deze week minder uitgeven.', { intent: 'reduce_cost' }],
    ['Vervang zalm door kip.', { intent: 'replace_ingredient', from: 'zalm', to: 'kip' }],
    ['Ik heb nog rijst en eieren thuis.', { intent: 'pantry_add', items: ['rijst', 'eieren'] }],
    ['Ik wil vandaag niet koken.', { intent: 'no_cooking', scope: 'today' }],
    ['Waarom val ik niet af?', { intent: 'explain_progress' }],
    ['Maak de boodschappenlijst goedkoper.', { intent: 'reduce_cost' }],
    ['Zorg dat ik 140 gram eiwit binnenkrijg.', { intent: 'protein_focus', grams: 140 }],
    ['Wat is het weer?', { intent: 'unknown' }],
  ])('%s', (message, expected) => {
    expect(parseIntentWithRules(message)).toEqual(expected);
  });

  it('maps Dutch ingredient words', () => {
    expect(resolveIngredientWord('zalm')).toBe('zalmfilet');
    expect(resolveIngredientWord('Kip')).toBe('kipfilet');
    expect(resolveIngredientWord('onbekend')).toBeNull();
  });
});

describe('assistant endpoint', () => {
  it('uses the rule parser when no AI provider is configured', async () => {
    const response = await handleAssistant(post('Vervang zalm door kip'), {}, 'user');
    expect(await response.json()).toMatchObject({ source: 'rules', action: { intent: 'replace_ingredient' } });
  });

  it('accepts validated structured output from the provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ reply: 'Ik plan drie dagen.', action: { intent: 'plan_meals', days: 3, from: null, to: null, items: null, scope: null, grams: null } }) }), { status: 200 })));
    const response = await handleAssistant(post('plan 3 dagen'), { OPENAI_API_KEY: 'sk-test' }, 'user');
    expect(await response.json()).toEqual({ source: 'ai', reply: 'Ik plan drie dagen.', action: { intent: 'plan_meals', days: 3 } });
  });

  it('falls back to rules when the provider returns invalid output or fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ reply: 'x', action: { intent: 'place_order' } }) }), { status: 200 })));
    expect(await (await handleAssistant(post('Ik wil vandaag niet koken'), { OPENAI_API_KEY: 'sk' }, 'user')).json()).toMatchObject({ source: 'rules', action: { intent: 'no_cooking' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await (await handleAssistant(post('Ik wil vandaag niet koken'), { OPENAI_API_KEY: 'sk' }, 'user')).json()).toMatchObject({ source: 'rules' });
  });

  it('rejects intents outside the schema', () => {
    expect(validateModelOutput({ reply: 'ok', action: { intent: 'checkout' } })).toBeNull();
    expect(validateModelOutput({ reply: '', action: { intent: 'reduce_cost' } })).toBeNull();
  });
});
