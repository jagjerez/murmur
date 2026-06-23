import { describe, it, expect } from 'vitest';
import type { MemoryItem } from '@murmur/rag';
import {
  MURMUR_PERSONA,
  getPersona,
  estimateTokens,
  formatContext,
  buildSystemPrompt,
} from './prompt';

// --- estimateTokens -----------------------------------------------------------

describe('estimateTokens', () => {
  it('la cadena vacía vale 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('es ~ceil(chars/4)', () => {
    expect(estimateTokens('a')).toBe(1); // ceil(1/4)
    expect(estimateTokens('abcd')).toBe(1); // ceil(4/4)
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4)
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('es monótona no decreciente al alargar el texto', () => {
    let prev = estimateTokens('');
    let acc = '';
    for (let i = 0; i < 50; i++) {
      acc += 'x';
      const cur = estimateTokens(acc);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

// --- getPersona / MURMUR_PERSONA ----------------------------------------------

describe('persona', () => {
  it('MURMUR_PERSONA es el texto en español por defecto', () => {
    expect(MURMUR_PERSONA).toBe(getPersona('es'));
  });

  it('la persona en español transmite calidez y brevedad', () => {
    const es = getPersona('es');
    expect(es).toMatch(/cálid|cercan|íntim|human/i);
    expect(es).toMatch(/brev|natural/i);
    // No divagar / evitar listas-markdown al hablar.
    expect(es).toMatch(/lista|markdown|divag/i);
  });

  it('la persona en inglés cambia el idioma base', () => {
    const en = getPersona('en');
    expect(en).toMatch(/warm|close|intimate|human/i);
    expect(en).toMatch(/brief|natural/i);
    expect(en).not.toBe(getPersona('es'));
  });
});

// --- formatContext ------------------------------------------------------------

const item = (
  type: MemoryItem['type'],
  content: string,
  createdAt = 0,
  id = `${type}-${content}`,
): MemoryItem => ({ id, type, content, createdAt });

describe('formatContext', () => {
  it('sin items devuelve cadena vacía', () => {
    expect(formatContext([])).toBe('');
  });

  it('etiqueta el bloque con "Lo que recuerdo"', () => {
    const out = formatContext([item('long_term_fact', 'le gusta el té')]);
    expect(out).toMatch(/Lo que recuerdo/i);
    expect(out).toContain('le gusta el té');
  });

  it('ordena por relevancia de tipo: facts/explicit antes que summary antes que short_term', () => {
    const items: MemoryItem[] = [
      item('short_term', 'CORTO'),
      item('session_summary', 'RESUMEN'),
      item('long_term_fact', 'HECHO'),
      item('explicit_user_memory', 'EXPLICITO'),
    ];
    const out = formatContext(items);
    const iFact = out.indexOf('HECHO');
    const iExplicit = out.indexOf('EXPLICITO');
    const iSummary = out.indexOf('RESUMEN');
    const iShort = out.indexOf('CORTO');
    expect(iFact).toBeGreaterThanOrEqual(0);
    expect(Math.max(iFact, iExplicit)).toBeLessThan(iSummary);
    expect(iSummary).toBeLessThan(iShort);
  });

  it('trunca al presupuesto descartando primero lo menos relevante', () => {
    const big = 'x'.repeat(200);
    const items: MemoryItem[] = [
      item('long_term_fact', `FACT-${big}`),
      item('short_term', `SHORT-${big}`),
    ];
    // Presupuesto pequeño: sólo cabe el item más relevante (el fact).
    const out = formatContext(items, { tokenBudget: 80 });
    expect(out).toContain('FACT-');
    expect(out).not.toContain('SHORT-');
    expect(estimateTokens(out)).toBeLessThanOrEqual(80);
  });

  it('con presupuesto 0 no incluye ningún item (bloque vacío)', () => {
    const items: MemoryItem[] = [item('long_term_fact', 'algo')];
    expect(formatContext(items, { tokenBudget: 0 })).toBe('');
  });
});

// --- buildSystemPrompt --------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('sin contexto devuelve sólo la persona', () => {
    const out = buildSystemPrompt({});
    expect(out).toBe(MURMUR_PERSONA);
    expect(out).not.toMatch(/Lo que recuerdo/i);
  });

  it('con contexto incluye persona + bloque de contexto', () => {
    const out = buildSystemPrompt({
      context: [item('long_term_fact', 'al usuario le gusta el té')],
    });
    expect(out).toMatch(/cálid|cercan|íntim|human/i);
    expect(out).toMatch(/Lo que recuerdo/i);
    expect(out).toContain('al usuario le gusta el té');
  });

  it('respeta el locale (cambia el idioma base de la persona)', () => {
    const en = buildSystemPrompt({ locale: 'en' });
    expect(en).toBe(getPersona('en'));
    expect(en).toMatch(/warm|close|intimate|human/i);
  });

  it('admite una persona personalizada', () => {
    const out = buildSystemPrompt({ persona: 'PERSONA-CUSTOM' });
    expect(out).toBe('PERSONA-CUSTOM');
  });

  it('el presupuesto recorta el contexto pero NUNCA la persona', () => {
    const big = 'y'.repeat(400);
    const context: MemoryItem[] = [
      item('long_term_fact', `FACT-${big}`),
      item('session_summary', `SUMMARY-${big}`),
      item('short_term', `SHORT-${big}`),
    ];
    const persona = getPersona('es');
    const out = buildSystemPrompt({ context, tokenBudget: 60 });
    // La persona se conserva íntegra.
    expect(out.startsWith(persona)).toBe(true);
    // El contexto se recortó: no caben todos los items grandes.
    expect(out).not.toContain('SHORT-');
  });

  it('aplica un tokenBudget por defecto razonable cuando no se pasa', () => {
    // Muchos items: el contexto se recorta aunque no pasemos tokenBudget.
    const big = 'z'.repeat(40);
    const context: MemoryItem[] = Array.from({ length: 500 }, (_, i) =>
      item('short_term', `S${i}-${big}`, i, `id-${i}`),
    );
    const out = buildSystemPrompt({ context });
    const persona = getPersona('es');
    const contextPart = out.slice(persona.length);
    // El contexto no debería contener los 500 items (presupuesto por defecto ~1500).
    expect(estimateTokens(contextPart)).toBeLessThanOrEqual(1500);
  });
});
