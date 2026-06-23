import { describe, it, expect } from 'vitest';
import { createMockChatProvider } from './chat';
import type { NewMemoryItem } from './providers';
import { createFactExtractor } from './facts';

describe('createFactExtractor', () => {
  it('respuesta ["a","b"] → 2 facts guardados como long_term_fact y devueltos', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => '["a","b"]');
    const extractor = createFactExtractor({
      chat,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
    });

    const out = await extractor.extract('texto cualquiera');

    expect(out).toEqual(['a', 'b']);
    expect(saved).toHaveLength(2);
    expect(saved.every((i) => i.type === 'long_term_fact')).toBe(true);
    expect(saved.map((i) => i.content)).toEqual(['a', 'b']);
    expect(saved.every((i) => typeof i.id === 'string' && i.id.length > 0)).toBe(true);
  });

  it('tolera fences ```json y prosa alrededor', async () => {
    const chat = createMockChatProvider(
      () =>
        'Claro, aquí tienes los hechos:\n```json\n["el usuario vive en Madrid", "le gusta el café"]\n```\nEspero que sirva.',
    );
    const extractor = createFactExtractor({ chat });

    const out = await extractor.extract('algo');

    expect(out).toEqual(['el usuario vive en Madrid', 'le gusta el café']);
  });

  it('extrae el primer array JSON válido aunque venga rodeado de prosa sin fences', async () => {
    const chat = createMockChatProvider(
      () => 'Los hechos relevantes son ["uno", "dos", "tres"] y nada más.',
    );
    const extractor = createFactExtractor({ chat });

    const out = await extractor.extract('algo');

    expect(out).toEqual(['uno', 'dos', 'tres']);
  });

  it('respuesta sin JSON → [] (no lanza) y no guarda nada', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => 'No he encontrado hechos que extraer.');
    const extractor = createFactExtractor({
      chat,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
    });

    const out = await extractor.extract('algo');

    expect(out).toEqual([]);
    expect(saved).toHaveLength(0);
  });

  it('array vacío → [] y no guarda nada', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => '[]');
    const extractor = createFactExtractor({
      chat,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
    });

    const out = await extractor.extract('algo');

    expect(out).toEqual([]);
    expect(saved).toHaveLength(0);
  });

  it('ignora elementos no-string y descarta strings vacíos/espacios', async () => {
    const chat = createMockChatProvider(() => '["válido", 42, "  ", "  otro  ", null, ""]');
    const extractor = createFactExtractor({ chat });

    const out = await extractor.extract('algo');

    expect(out).toEqual(['válido', 'otro']);
  });

  it('usa el reloj inyectado y un id por hecho', async () => {
    const saved: NewMemoryItem[] = [];
    const chat = createMockChatProvider(() => '["a","b"]');
    const extractor = createFactExtractor({
      chat,
      sink: (item) => {
        saved.push(item);
        return Promise.resolve();
      },
      now: () => 999,
    });

    await extractor.extract('algo');

    expect(saved.every((i) => i.createdAt === 999)).toBe(true);
    expect(new Set(saved.map((i) => i.id)).size).toBe(2);
  });

  it('por defecto usa memory.add como sink', async () => {
    const added: NewMemoryItem[] = [];
    const memory = {
      add: (item: NewMemoryItem): Promise<void> => {
        added.push(item);
        return Promise.resolve();
      },
    };
    const chat = createMockChatProvider(() => '["hecho 1"]');
    const extractor = createFactExtractor({ chat, memory });

    await extractor.extract('algo');

    expect(added).toHaveLength(1);
    expect(added[0]?.type).toBe('long_term_fact');
    expect(added[0]?.content).toBe('hecho 1');
  });

  it('pasa el texto a extraer al chat dentro del prompt', async () => {
    let captured = '';
    const chat = createMockChatProvider((messages) => {
      captured = messages.map((m) => m.content).join('\n');
      return '[]';
    });
    const extractor = createFactExtractor({ chat });

    await extractor.extract('Ana vive en Madrid y trabaja de noche');

    expect(captured).toContain('Ana vive en Madrid y trabaja de noche');
  });
});
