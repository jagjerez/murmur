import { describe, it, expect } from 'vitest';
import { tokens, color } from './tokens';

describe('tokens', () => {
  it('expone el acento base terracota', () => {
    expect(color.accent[400]).toBe('#E0916B');
  });

  it('define los 5 colores de estado', () => {
    expect(color.state).toEqual({
      idle: '#9A9088',
      listening: '#E0916B',
      thinking: '#B79BE8',
      speaking: '#E6B450',
      error: '#D8584E',
    });
  });

  it('agrupa todas las escalas en `tokens`', () => {
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining(['color', 'font', 'space', 'radius', 'shadow', 'motion']),
    );
  });
});
