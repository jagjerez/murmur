import type { AssistantState } from '@murmur/shared';
import { stateVisuals, type StateAnimation } from '@murmur/design-system';

/** Visual derivado de un estado: la única fuente de verdad es `stateVisuals`. */
export interface CapsuleVisual {
  color: string;
  animation: StateAnimation;
  label: string;
  /** El ecualizador es protagonista solo cuando hay flujo de audio. */
  showEq: boolean;
}

/** Deriva color/animación/etiqueta del estado y si el ecualizador debe verse activo. */
export function deriveVisual(state: AssistantState): CapsuleVisual {
  const visual = stateVisuals[state];
  return {
    color: visual.color,
    animation: visual.animation,
    label: visual.label,
    showEq: state === 'listening' || state === 'speaking',
  };
}
