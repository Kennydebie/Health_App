import { z } from 'zod';
import { ingredients } from '../../data/project73/ingredients';
import { normalizeText } from './grocery';

/**
 * Everything the assistant may propose. Each intent becomes a visible, confirmable action in the
 * app; none of them can place an order or pay.
 */
export const assistantIntentSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('plan_meals'), days: z.number().int().min(1).max(7).nullable() }),
  z.object({ intent: z.literal('reduce_cost') }),
  z.object({ intent: z.literal('replace_ingredient'), from: z.string().max(40), to: z.string().max(40) }),
  z.object({ intent: z.literal('pantry_add'), items: z.array(z.string().max(40)).min(1).max(12) }),
  z.object({ intent: z.literal('no_cooking'), scope: z.enum(['today', 'tomorrow']) }),
  z.object({ intent: z.literal('explain_progress') }),
  z.object({ intent: z.literal('protein_focus'), grams: z.number().int().min(60).max(300).nullable() }),
  z.object({ intent: z.literal('prepare_groceries') }),
  z.object({ intent: z.literal('unknown') }),
]);

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

export const assistantReplySchema = z.object({
  action: assistantIntentSchema,
  reply: z.string().min(1).max(500),
});

export type AssistantReply = z.infer<typeof assistantReplySchema> & { source: 'ai' | 'rules' };

const SYNONYMS: Record<string, string> = {
  kip: 'kipfilet', kipfilet: 'kipfilet', zalm: 'zalmfilet', vis: 'zalmfilet', gehakt: 'rundergehakt', rundergehakt: 'rundergehakt',
  tonijn: 'tonijn', ei: 'eieren', eieren: 'eieren', eitjes: 'eieren', kwark: 'magere_kwark', skyr: 'skyr', cottage: 'cottage_cheese',
  melk: 'halfvolle_melk', whey: 'whey', eiwitpoeder: 'whey', havermout: 'havermout', brood: 'volkorenbrood', wraps: 'volkoren_wraps', wrap: 'volkoren_wraps',
  rijst: 'rijst', pasta: 'volkoren_pasta', aardappel: 'krieltjes', aardappelen: 'krieltjes', krieltjes: 'krieltjes', 'zoete aardappel': 'zoete_aardappel',
  broccoli: 'broccoli', bimi: 'bimi', wokgroente: 'wokgroente', wokgroenten: 'wokgroente', sperziebonen: 'sperziebonen', paprika: 'paprika',
  ui: 'ui', uien: 'ui', tomaat: 'tomaat', tomaten: 'tomaat', komkommer: 'komkommer', sla: 'sla', spinazie: 'spinazie', aardbeien: 'aardbeien',
  bessen: 'blauwe_bessen', 'blauwe bessen': 'blauwe_bessen', banaan: 'banaan', bananen: 'banaan', appel: 'appel', appels: 'appel',
  hummus: 'hummus', tzatziki: 'tzatziki', passata: 'passata', kidneybonen: 'kidneybonen', mais: 'mais', kaas: 'kaas_30',
};

/** Maps a Dutch word ("zalm", "eieren") to an ingredient id, or null. */
export function resolveIngredientWord(word: string): string | null {
  const normalized = normalizeText(word).replace(/[^a-z ]/g, '').trim();
  if (!normalized) return null;
  if (SYNONYMS[normalized]) return SYNONYMS[normalized];
  const direct = ingredients.find((ingredient) => normalizeText(ingredient.name) === normalized || ingredient.id === normalized);
  return direct?.id ?? null;
}

const NUMBER_WORDS: Record<string, number> = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, week: 7 };

function findIngredientWords(text: string) {
  const found: string[] = [];
  const normalized = normalizeText(text);
  for (const phrase of Object.keys(SYNONYMS).filter((key) => key.includes(' '))) {
    if (normalized.includes(phrase)) found.push(SYNONYMS[phrase]);
  }
  for (const word of normalized.split(/[^a-z]+/)) {
    const id = SYNONYMS[word];
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}

/** Deterministic Dutch intent parser; used when no AI provider is configured or reachable. */
export function parseIntentWithRules(message: string): AssistantIntent {
  const text = normalizeText(message);
  const replace = /(?:vervang|wissel|ruil)\s+(?:de\s+|het\s+)?([a-z ]+?)\s+(?:door|voor|met|in)\s+([a-z ]+)/.exec(text);
  if (replace) return { intent: 'replace_ingredient', from: replace[1].trim(), to: replace[2].trim() };
  if (/(niet|geen zin om|geen tijd om)\s+(te\s+)?koken/.test(text)) return { intent: 'no_cooking', scope: /morgen/.test(text) ? 'tomorrow' : 'today' };
  if (/(nog|heb|liggen|staan).*(thuis|in huis|in de kast|over)/.test(text) || /^ik heb nog/.test(text)) {
    const items = findIngredientWords(text);
    if (items.length) return { intent: 'pantry_add', items };
  }
  if (/(waarom|hoe komt).*(niet af|val ik niet|blijf ik|stabiel|aankom)/.test(text) || /val ik (niet|nauwelijks) af/.test(text)) return { intent: 'explain_progress' };
  if (/(eiwit|proteine)/.test(text)) {
    const grams = /(\d{2,3})\s*(g|gram)/.exec(text);
    return { intent: 'protein_focus', grams: grams ? Number(grams[1]) : null };
  }
  if (/(goedkoper|minder uitgeven|budget|bespar|te duur|kosten)/.test(text)) return { intent: 'reduce_cost' };
  if (/(boodschappen|winkelmand|picnic|bestel)/.test(text) && !/plan/.test(text)) return { intent: 'prepare_groceries' };
  if (/(plan|maak|schema|eten voor|maaltijden)/.test(text)) {
    const digits = /(\d+)\s*dag/.exec(text);
    const word = Object.entries(NUMBER_WORDS).find(([key]) => new RegExp(`\\b${key}\\b`).test(text));
    const days = digits ? Math.min(7, Math.max(1, Number(digits[1]))) : word ? word[1] : null;
    return { intent: 'plan_meals', days };
  }
  return { intent: 'unknown' };
}

export function ruleReply(intent: AssistantIntent): string {
  switch (intent.intent) {
    case 'plan_meals': return `Ik maak een plan voor ${intent.days ?? 'de komende'} ${intent.days === 1 ? 'dag' : 'dagen'} dat past bij je doelen. Controleer het en pas aan waar je wilt.`;
    case 'reduce_cost': return 'Ik kijk naar goedkopere producten en maaltijden die ingrediënten delen, zonder je eiwit te verlagen.';
    case 'replace_ingredient': return `Ik zoek maaltijden zonder ${intent.from} en met ${intent.to}, en reken de dag opnieuw door.`;
    case 'pantry_add': return 'Ik zet dit in je voorraad, zodat het niet opnieuw op je boodschappenlijst komt.';
    case 'no_cooking': return `Ik vervang de maaltijden van ${intent.scope === 'today' ? 'vandaag' : 'morgen'} door opties zonder koken of door restjes.`;
    case 'explain_progress': return 'Hier is wat je gegevens laten zien.';
    case 'protein_focus': return 'Ik pas je plan aan zodat je eiwitdoel beter gehaald wordt.';
    case 'prepare_groceries': return 'Ik zet je boodschappen klaar. Je ziet eerst alles voordat er iets in je mandje gaat.';
    default: return 'Dat begrijp ik nog niet. Probeer bijvoorbeeld: “Plan mijn eten voor drie dagen”, “Vervang zalm door kip” of “Ik heb nog rijst thuis”.';
  }
}
