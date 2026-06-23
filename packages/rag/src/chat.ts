import { ModelError } from '@murmur/shared';

// Abstracción `ChatProvider` para completar conversaciones con un LLM de chat.
// Dos implementaciones:
//  - `createOpenAIChatProvider`: real, HTTP inyectable, sin red en tests.
//  - `createMockChatProvider`: determinista (delega en un responder), para tests/offline.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompleteOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatProvider {
  complete(messages: ChatMessage[], opts?: ChatCompleteOptions): Promise<string>;
}

/**
 * Provider determinista: delega cada `complete` en el `responder` inyectado. Sin red,
 * pensado para tests y uso offline. El mismo conjunto de mensajes produce la misma salida
 * si el `responder` es puro.
 */
export function createMockChatProvider(
  responder: (messages: ChatMessage[]) => string,
): ChatProvider {
  return {
    complete(messages: ChatMessage[]): Promise<string> {
      return Promise.resolve(responder(messages));
    },
  };
}

interface OpenAIChatResponse {
  choices?: { message?: { role?: string; content?: string } }[];
}

export interface OpenAIChatOptions {
  apiKey: string;
  /** Modelo de chat. Por defecto `gpt-4o-mini`. */
  model?: string;
  /** `fetch` inyectable. Por defecto `globalThis.fetch`. */
  fetchFn?: typeof globalThis.fetch;
  /** Endpoint base. Por defecto el oficial de OpenAI. */
  endpoint?: string;
}

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Provider OpenAI Chat Completions. `POST {endpoint}` con `Authorization: Bearer <key>` y
 * body `{ model, messages, temperature?, max_tokens? }`. Parsea `choices[0].message.content`.
 * Cualquier fallo de red, HTTP o parseo se mapea a `ModelError`. La API key nunca se loguea
 * ni se incluye en los mensajes de error.
 */
export function createOpenAIChatProvider(options: OpenAIChatOptions): ChatProvider {
  const { apiKey } = options;
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  const endpoint = options.endpoint ?? DEFAULT_OPENAI_ENDPOINT;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  return {
    async complete(messages: ChatMessage[], opts?: ChatCompleteOptions): Promise<string> {
      const payload: {
        model: string;
        messages: ChatMessage[];
        temperature?: number;
        max_tokens?: number;
      } = { model, messages };
      if (opts?.temperature !== undefined) {
        payload.temperature = opts.temperature;
      }
      if (opts?.maxTokens !== undefined) {
        payload.max_tokens = opts.maxTokens;
      }

      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // No propagamos la causa para no arrastrar la key si quedara en algún detalle.
        throw new ModelError('Fallo de red al solicitar chat completion a OpenAI.');
      }

      if (!response.ok) {
        let detail = '';
        try {
          detail = await response.text();
        } catch {
          detail = '';
        }
        throw new ModelError(
          `OpenAI chat completions respondió ${response.status}.${detail ? ` ${detail}` : ''}`,
        );
      }

      let parsed: OpenAIChatResponse;
      try {
        parsed = (await response.json()) as OpenAIChatResponse;
      } catch {
        throw new ModelError('Respuesta de OpenAI chat completions no es JSON válido.');
      }

      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new ModelError(
          'Respuesta de OpenAI chat completions sin `choices[0].message.content`.',
        );
      }
      return content;
    },
  };
}
