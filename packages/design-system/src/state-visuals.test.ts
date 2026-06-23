import { describe, it, expect } from 'vitest';
import { ASSISTANT_STATES } from '@murmur/shared';
import { stateVisuals } from './state-visuals';

describe('stateVisuals', () => {
  it('cubre todos los AssistantState', () => {
    for (const state of ASSISTANT_STATES) {
      expect(stateVisuals[state]).toBeDefined();
    }
  });

  it('mapea listening a coral con respiración', () => {
    expect(stateVisuals.listening.color).toBe('#E0916B');
    expect(stateVisuals.listening.animation).toBe('breathe');
  });

  it('mapea error a rojo con shake', () => {
    expect(stateVisuals.error.color).toBe('#D8584E');
    expect(stateVisuals.error.animation).toBe('shake');
  });
});
