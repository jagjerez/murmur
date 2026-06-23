import { describe, it, expect } from 'vitest';
import { ASSISTANT_STATES } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';
import { deriveVisual } from './visual';

describe('deriveVisual', () => {
  it('deriva color, animación y etiqueta desde stateVisuals para los 5 estados', () => {
    for (const state of ASSISTANT_STATES) {
      const visual = deriveVisual(state);
      expect(visual.color).toBe(stateVisuals[state].color);
      expect(visual.animation).toBe(stateVisuals[state].animation);
      expect(visual.label).toBe(stateVisuals[state].label);
    }
  });

  it('muestra el ecualizador solo en listening y speaking', () => {
    expect(deriveVisual('listening').showEq).toBe(true);
    expect(deriveVisual('speaking').showEq).toBe(true);
    expect(deriveVisual('idle').showEq).toBe(false);
    expect(deriveVisual('thinking').showEq).toBe(false);
    expect(deriveVisual('error').showEq).toBe(false);
  });

  it('usa el color coral con breathe para listening', () => {
    const visual = deriveVisual('listening');
    expect(visual.color).toBe('#E0916B');
    expect(visual.animation).toBe('breathe');
  });

  it('usa shake para error', () => {
    expect(deriveVisual('error').animation).toBe('shake');
  });
});
