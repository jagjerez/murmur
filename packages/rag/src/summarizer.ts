import { randomUUID } from 'node:crypto';
import type { Message } from '@murmur/shared';
import type { ChatProvider } from './chat';
import type { MemoryStore, NewMemoryItem } from './providers';
import type { SessionSummarizer } from './providers';

// `SessionSummarizer` sobre un `ChatProvider` inyectable. Resume los mensajes de una sesión
// y guarda el resultado como `session_summary` vía un `sink` (default `memory.add`),
// desacoplando la generación de la indexación (F9 puede inyectar `retriever.index`).

/** Fuente de mensajes de una sesión. La satisface `ConversationStore`. */
export interface MessageSource {
  getMessages(sessionId: string): Message[];
}

/** Persiste un item de memoria generado. F9 puede pasar `retriever.index`. */
export type MemorySink = (item: NewMemoryItem) => Promise<void>;

export interface SessionSummarizerOptions {
  chat: ChatProvider;
  conversation: MessageSource;
  /** Destino de los items generados. Por defecto, `memory.add` si se pasa `memory`. */
  sink?: MemorySink;
  /** Store de memoria cuyo `add` se usa como `sink` por defecto. */
  memory?: Pick<MemoryStore, 'add'>;
  /** Reloj inyectable para `createdAt`. Por defecto `Date.now`. */
  now?: () => number;
}

const SYSTEM_PROMPT =
  'Eres un asistente que resume conversaciones. Resume de forma concisa y en tercera persona ' +
  'la siguiente sesión, conservando datos, decisiones y preferencias relevantes del usuario. ' +
  'Devuelve sólo el resumen, sin preámbulos.';

function transcript(messages: Message[]): string {
  return messages.map((m) => `${m.role}: ${m.text}`).join('\n');
}

/**
 * Crea un `SessionSummarizer`. `summarize(sessionId)` lee los mensajes de la sesión; si está
 * vacía, no llama al LLM y devuelve `''`. En caso contrario construye el prompt (sistema +
 * transcript), llama a `chat.complete`, guarda un `session_summary` (con `sessionId`) vía el
 * `sink` y devuelve el texto del resumen.
 */
export function createSessionSummarizer(options: SessionSummarizerOptions): SessionSummarizer {
  const { chat, conversation } = options;
  const now = options.now ?? Date.now;
  const sink: MemorySink =
    options.sink ??
    (options.memory ? (item) => options.memory!.add(item) : () => Promise.resolve());

  return {
    async summarize(sessionId: string): Promise<string> {
      const messages = conversation.getMessages(sessionId);
      if (messages.length === 0) {
        // Sesión vacía: no gastamos una llamada al LLM ni guardamos nada.
        return '';
      }

      const summary = await chat.complete([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript(messages) },
      ]);

      const item: NewMemoryItem = {
        id: randomUUID(),
        type: 'session_summary',
        content: summary,
        createdAt: now(),
        sessionId,
      };
      await sink(item);

      return summary;
    },
  };
}
