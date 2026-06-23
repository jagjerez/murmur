import { randomUUID } from 'node:crypto';
import type { ChatProvider } from './chat';
import type { MemoryStore, NewMemoryItem } from './providers';
import type { FactExtractor } from './providers';
import type { MemorySink } from './summarizer';

// `FactExtractor` sobre un `ChatProvider` inyectable. Pide al LLM una lista JSON de hechos
// atómicos, la parsea de forma ROBUSTA (tolerando fences ```json y prosa alrededor) y guarda
// cada hecho como `long_term_fact` vía un `sink` (default `memory.add`).

export interface FactExtractorOptions {
  chat: ChatProvider;
  /** Destino de los items generados. Por defecto, `memory.add` si se pasa `memory`. */
  sink?: MemorySink;
  /** Store de memoria cuyo `add` se usa como `sink` por defecto. */
  memory?: Pick<MemoryStore, 'add'>;
  /** Reloj inyectable para `createdAt`. Por defecto `Date.now`. */
  now?: () => number;
}

const SYSTEM_PROMPT =
  'Eres un extractor de hechos. A partir del texto del usuario, extrae los hechos atómicos, ' +
  'persistentes y verificables sobre el usuario o el mundo (preferencias, datos personales, ' +
  'decisiones). Ignora lo efímero o conversacional. Responde EXCLUSIVAMENTE con un array JSON ' +
  'de cadenas, sin texto adicional. Si no hay hechos, responde [].';

/**
 * Extrae el primer array JSON válido contenido en `text`. Escanea buscando un `[` y avanza
 * con un contador de profundidad que respeta cadenas y escapes; al cerrar el array intenta
 * parsearlo. Si parsea como array, lo devuelve; si no, continúa con el siguiente `[`. Tolera
 * prosa y fences ```json alrededor. Devuelve `null` si no hay ningún array JSON válido.
 */
function extractFirstJsonArray(text: string): unknown[] | null {
  for (let start = text.indexOf('['); start !== -1; start = text.indexOf('[', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i]!;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            const parsed: unknown = JSON.parse(candidate);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // Candidato no parseable: rompe el bucle interno y prueba el siguiente `[`.
          }
          break;
        }
      }
    }
  }
  return null;
}

/** Normaliza el array crudo a hechos: sólo strings no vacías (recortadas). */
function toFacts(raw: unknown[]): string[] {
  const facts: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        facts.push(trimmed);
      }
    }
  }
  return facts;
}

/**
 * Crea un `FactExtractor`. `extract(text)` pide al LLM una lista JSON de hechos, la parsea de
 * forma robusta, guarda cada hecho como `long_term_fact` vía el `sink` y devuelve `string[]`.
 * Si no hay hechos (o la respuesta no contiene un array JSON), devuelve `[]` sin lanzar.
 */
export function createFactExtractor(options: FactExtractorOptions): FactExtractor {
  const { chat } = options;
  const now = options.now ?? Date.now;
  const sink: MemorySink =
    options.sink ??
    (options.memory ? (item) => options.memory!.add(item) : () => Promise.resolve());

  return {
    async extract(text: string): Promise<string[]> {
      const response = await chat.complete([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ]);

      const raw = extractFirstJsonArray(response);
      if (raw === null) {
        return [];
      }
      const facts = toFacts(raw);

      for (const content of facts) {
        const item: NewMemoryItem = {
          id: randomUUID(),
          type: 'long_term_fact',
          content,
          createdAt: now(),
        };
        await sink(item);
      }

      return facts;
    },
  };
}
