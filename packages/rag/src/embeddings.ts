import { ModelError } from '@murmur/shared';
import type { EmbeddingProvider } from './providers';

// Providers de embedding. Dos implementaciones:
//  - `createOpenAIEmbeddingProvider`: real, HTTP inyectable, sin red en tests.
//  - `createMockEmbeddingProvider`: determinista y normalizado, para tests/offline.

const DEFAULT_MOCK_DIM = 64;

/** Tokeniza en minúsculas por caracteres no alfanuméricos (Unicode). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** FNV-1a de 32 bits sobre una cadena. Determinista y estable. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // hash *= 16777619 con aritmética de 32 bits sin desbordar el doble.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Provider mock determinista: proyecta cada token a un componente (bag-of-tokens
 * con signo derivado del hash) y normaliza el vector resultante. Mismo texto → mismo
 * vector; textos que comparten tokens comparten dirección. Sin red.
 */
export function createMockEmbeddingProvider(options: { dim?: number } = {}): EmbeddingProvider {
  const dim = options.dim ?? DEFAULT_MOCK_DIM;

  function embedOne(text: string): number[] {
    const vec = new Array<number>(dim).fill(0);
    const tokens = tokenize(text);
    for (const token of tokens) {
      const h = fnv1a(token);
      const slot = h % dim;
      // Signo estable a partir de un bit alto del hash, para que tokens distintos
      // no se cancelen sistemáticamente.
      const sign = (h & 0x80000000) !== 0 ? -1 : 1;
      vec[slot] = (vec[slot] as number) + sign;
    }
    // Si el texto no aporta tokens, deja un componente fijo para evitar el vector cero.
    if (tokens.length === 0) {
      vec[0] = 1;
    }
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    if (norm === 0) {
      vec[0] = 1;
      return vec;
    }
    return vec.map((x) => x / norm);
  }

  return {
    id: 'mock',
    embed(texts: string[]): Promise<number[][]> {
      return Promise.resolve(texts.map(embedOne));
    },
  };
}

interface OpenAIEmbeddingResponse {
  data?: { embedding: number[]; index: number }[];
}

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  /** Modelo de embeddings. Por defecto `text-embedding-3-small`. */
  model?: string;
  /** `fetch` inyectable. Por defecto `globalThis.fetch`. */
  fetchFn?: typeof globalThis.fetch;
  /** Endpoint base. Por defecto el oficial de OpenAI. */
  endpoint?: string;
}

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/embeddings';

/**
 * Provider OpenAI. `POST {endpoint}` con `Authorization: Bearer <key>` y body
 * `{ model, input }`. Parsea `data[].embedding` ordenando por `index`. Cualquier
 * fallo de red, HTTP o parseo se mapea a `ModelError`. La API key nunca se loguea
 * ni se incluye en los mensajes de error.
 */
export function createOpenAIEmbeddingProvider(options: OpenAIEmbeddingOptions): EmbeddingProvider {
  const { apiKey } = options;
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  const endpoint = options.endpoint ?? DEFAULT_OPENAI_ENDPOINT;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  return {
    id: `openai:${model}`,
    async embed(texts: string[]): Promise<number[][]> {
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, input: texts }),
        });
      } catch {
        // No propagamos la causa para no arrastrar la key si quedara en algún detalle.
        throw new ModelError('Fallo de red al solicitar embeddings a OpenAI.');
      }

      if (!response.ok) {
        let detail = '';
        try {
          detail = await response.text();
        } catch {
          detail = '';
        }
        throw new ModelError(
          `OpenAI embeddings respondió ${response.status}.${detail ? ` ${detail}` : ''}`,
        );
      }

      let parsed: OpenAIEmbeddingResponse;
      try {
        parsed = (await response.json()) as OpenAIEmbeddingResponse;
      } catch {
        throw new ModelError('Respuesta de OpenAI embeddings no es JSON válido.');
      }

      const data = parsed.data;
      if (!Array.isArray(data) || data.length === 0) {
        throw new ModelError('Respuesta de OpenAI embeddings sin campo `data`.');
      }

      const ordered = [...data].sort((a, b) => a.index - b.index);
      return ordered.map((entry) => {
        if (!Array.isArray(entry.embedding)) {
          throw new ModelError('Entrada de embedding de OpenAI sin vector válido.');
        }
        return entry.embedding;
      });
    },
  };
}
