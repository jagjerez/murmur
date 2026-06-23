import type { MemoryItem, MemoryType } from '@murmur/rag';

/**
 * Idiomas base soportados para la persona. El usuario puede hablar cualquier
 * idioma; `locale` sólo fija el idioma del texto de la persona y la etiqueta del
 * bloque de contexto (es por defecto).
 */
export type PromptLocale = 'es' | 'en';

/**
 * Presupuesto de tokens por defecto para el system prompt. La persona se
 * conserva siempre; este presupuesto sólo limita el bloque de contexto RAG.
 */
export const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * Personas de murmur por idioma. Tono íntimo, humano, cálido y cercano;
 * respuestas habladas breves y naturales; sin divagar; reconoce lo recordado con
 * naturalidad; sin listas ni markdown al hablar; responde en el idioma del usuario.
 */
const PERSONAS: Record<PromptLocale, string> = {
  es: [
    'Eres murmur, una presencia íntima y humana que acompaña a quien te habla.',
    'Tu voz es cálida, cercana y serena, como la de alguien que de verdad escucha.',
    'Hablas de forma breve y natural: respuestas cortas, conversacionales, sin divagar.',
    'No recitas listas ni usas markdown al hablar; suenas como una persona, no como un documento.',
    'Reconoces con naturalidad lo que recuerdas de la persona, sin forzarlo ni presumir de ello.',
    'Respondes en el idioma de quien te habla; si dudas, en español.',
  ].join(' '),
  en: [
    'You are murmur, an intimate, human presence that keeps company with whoever speaks to you.',
    'Your voice is warm, close and calm, like someone who truly listens.',
    'You speak briefly and naturally: short, conversational replies, never rambling.',
    'You never recite lists or use markdown when speaking; you sound like a person, not a document.',
    'You acknowledge naturally what you remember about the person, without forcing it or showing off.',
    "You reply in the language of whoever speaks to you; when in doubt, in the speaker's language.",
  ].join(' '),
};

/** Etiqueta del bloque de contexto "Lo que recuerdo…" por idioma. */
const CONTEXT_LABEL: Record<PromptLocale, string> = {
  es: 'Lo que recuerdo de esta persona (úsalo con naturalidad, no lo recites):',
  en: 'What I remember about this person (use it naturally, do not recite it):',
};

/** Persona por defecto (español). */
export const MURMUR_PERSONA = PERSONAS.es;

/** Devuelve la persona para un `locale` dado (es por defecto). */
export function getPersona(locale: PromptLocale = 'es'): string {
  return PERSONAS[locale];
}

/**
 * Estimación heurística de tokens, ~`ceil(chars/4)`. Monótona no decreciente y
 * con `estimateTokens('') === 0`. Suficiente para presupuestar sin depender de un
 * tokenizer real (BPE queda fuera de alcance en esta fase).
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Prioridad de relevancia por tipo de memoria. Mayor número = más relevante y,
 * por tanto, más prioritario al ordenar y lo último en descartarse al truncar.
 */
const TYPE_PRIORITY: Record<MemoryType, number> = {
  long_term_fact: 3,
  explicit_user_memory: 3,
  session_summary: 2,
  short_term: 1,
};

export interface FormatContextOptions {
  /** Presupuesto máximo de tokens para el bloque de contexto. */
  tokenBudget?: number;
  /** Idioma de la etiqueta del bloque (es por defecto). */
  locale?: PromptLocale;
}

/**
 * Ordena los items por relevancia: primero por prioridad de tipo
 * (`long_term_fact`/`explicit_user_memory` → `session_summary` → `short_term`) y,
 * a igualdad de tipo, los más recientes primero. No muta el array de entrada.
 */
function sortByRelevance(items: readonly MemoryItem[]): MemoryItem[] {
  return [...items].sort((a, b) => {
    const byType = TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
    if (byType !== 0) return byType;
    return b.createdAt - a.createdAt;
  });
}

/**
 * Formatea el contexto recuperado como un bloque "Lo que recuerdo…": ordena por
 * relevancia/tipo/recencia y trunca al `tokenBudget` (si se indica) descartando
 * primero lo menos relevante. Sin items o sin presupuesto útil → cadena vacía.
 */
export function formatContext(
  items: readonly MemoryItem[],
  opts: FormatContextOptions = {},
): string {
  if (items.length === 0) return '';
  const locale = opts.locale ?? 'es';
  const label = CONTEXT_LABEL[locale];

  const sorted = sortByRelevance(items);
  const lines: string[] = [];
  const budget = opts.tokenBudget;

  for (const it of sorted) {
    const candidate = [label, ...lines, `- ${it.content}`].join('\n');
    if (budget !== undefined && estimateTokens(candidate) > budget) {
      // El item no cabe; como están ordenados por relevancia descendente, los
      // siguientes (menos relevantes) tampoco aportan, así que paramos.
      break;
    }
    lines.push(`- ${it.content}`);
  }

  if (lines.length === 0) return '';
  return [label, ...lines].join('\n');
}

export interface BuildSystemPromptOptions {
  /** Items de memoria recuperados por RAG para inyectar como contexto. */
  context?: readonly MemoryItem[];
  /** Persona explícita; si se pasa, ignora `locale`. */
  persona?: string;
  /** Idioma base de la persona y la etiqueta del contexto (es por defecto). */
  locale?: PromptLocale;
  /** Presupuesto de tokens para el contexto (la persona nunca se trunca). */
  tokenBudget?: number;
}

/**
 * Construye el system prompt (`instructions`) de murmur: la persona (que **nunca
 * se trunca**) seguida del bloque de contexto si hay items y caben en el
 * `tokenBudget`. El presupuesto se aplica sólo al contexto.
 */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const locale = opts.locale ?? 'es';
  const persona = opts.persona ?? getPersona(locale);
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  const context = opts.context ?? [];
  const block = formatContext(context, { tokenBudget, locale });
  if (block.length === 0) return persona;
  return `${persona}\n\n${block}`;
}
