import { describe, it, expect, vi } from 'vitest';
import type { Message } from '@murmur/shared';
import { createMockChatProvider, type ChatMessage } from './chat';
import type { NewMemoryItem } from './providers';
import { createSessionSummarizer } from './summarizer';

function msg(sessionId: string, role: Message['role'], text: string): Message {
  return { id: `${role}-${text}`, sessionId, role, text, createdAt: 1 };
}

/** Stub mínimo de ConversationStore: sólo `getMessages`. */
function stubConversation(messages: Message[]): { getMessages(sessionId: string): Message[] } {
  return {
    getMessages(sessionId: string): Message[] {
      return messages.filter((m) => m.sessionId === sessionId);
    },
  };
}

describe('createSessionSummarizer', () => {
  it('llama al chat con el transcript y devuelve el resumen', async () => {
    const seen: ChatMessage[][] = [];
    const chat = createMockChatProvider((messages) => {
      seen.push(messages);
      return 'resumen de la sesión';
    });
    const conversation = stubConversation([
      msg('s1', 'user', 'hola, me llamo Ana'),
      msg('s1', 'assistant', 'encantado, Ana'),
    ]);
    const summarizer = createSessionSummarizer({ chat, conversation });

    const out = await summarizer.summarize('s1');

    expect(out).toBe('resumen de la sesión');
    expect(seen).toHaveLength(1);
    // Hay un mensaje de sistema (instrucción de resumen) y el transcript va incluido.
    const prompt = seen[0]!;
    expect(prompt[0]?.role).toBe('system');
    const joined = prompt.map((m) => m.content).join('\n');
    expect(joined).toContain('hola, me llamo Ana');
    expect(joined).toContain('encantado, Ana');
  });

  it('guarda un session_summary con el sessionId correcto vía sink y devuelve el texto', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => 'el usuario se llama Ana');
    const conversation = stubConversation([msg('s1', 'user', 'me llamo Ana')]);
    const summarizer = createSessionSummarizer({
      chat,
      conversation,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
    });

    const out = await summarizer.summarize('s1');

    expect(out).toBe('el usuario se llama Ana');
    expect(saved).toHaveLength(1);
    const item = saved[0]!;
    expect(item.type).toBe('session_summary');
    expect(item.content).toBe('el usuario se llama Ana');
    expect(item.sessionId).toBe('s1');
    expect(typeof item.id).toBe('string');
    expect(item.id.length).toBeGreaterThan(0);
  });

  it('usa el reloj inyectado para createdAt', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => 'resumen');
    const conversation = stubConversation([msg('s1', 'user', 'algo')]);
    const summarizer = createSessionSummarizer({
      chat,
      conversation,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
      now: () => 4242,
    });

    await summarizer.summarize('s1');

    expect(saved[0]?.createdAt).toBe(4242);
  });

  it('sesión vacía: no llama al chat ni guarda, devuelve cadena vacía', async () => {
    const chatSpy = vi.fn().mockReturnValue('no debería llamarse');
    const chat = createMockChatProvider(chatSpy);
    const saved: NewMemoryItem[] = [];
    const conversation = stubConversation([]);
    const summarizer = createSessionSummarizer({
      chat,
      conversation,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
    });

    const out = await summarizer.summarize('vacia');

    expect(out).toBe('');
    expect(chatSpy).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('por defecto usa memory.add como sink', async () => {
    const added: NewMemoryItem[] = [];
    const memory = {
      add: (item: NewMemoryItem): Promise<void> => {
        added.push(item);
        return Promise.resolve();
      },
    };
    const chat = createMockChatProvider(() => 'resumen por defecto');
    const conversation = stubConversation([msg('s1', 'user', 'hola')]);
    const summarizer = createSessionSummarizer({ chat, conversation, memory });

    await summarizer.summarize('s1');

    expect(added).toHaveLength(1);
    expect(added[0]?.type).toBe('session_summary');
    expect(added[0]?.sessionId).toBe('s1');
  });
});
