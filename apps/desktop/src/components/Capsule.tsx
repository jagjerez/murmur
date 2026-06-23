import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';
import type { AssistantState } from '@murmur/shared';
import { deriveVisual } from '../capsule/visual';
import { anchorStyle, type Anchor } from '../capsule/anchor';
import type { InteractionMode } from '../capsule/interaction';
import { Waveform } from './Waveform';

export interface CapsuleProps {
  state: AssistantState;
  mode: InteractionMode;
  anchor: Anchor;
  capturing: boolean;
  onPress: () => void;
  onRelease: () => void;
  onCancel: () => void;
}

function isActivationKey(key: string): boolean {
  return key === ' ' || key === 'Enter' || key === 'Spacebar';
}

/**
 * La cápsula cálida: indicador de estado (punto con color + animación),
 * ecualizador protagonista y etiqueta. Arrastrable (data-tauri-drag-region),
 * anclable (anchorStyle) y accesible (role=status, aria-live, aria-label).
 */
export function Capsule({
  state,
  mode,
  anchor,
  capturing,
  onPress,
  onRelease,
  onCancel,
}: CapsuleProps) {
  const visual = deriveVisual(state);
  const dotClass = visual.animation === 'none' ? 'dot' : `dot dot--${visual.animation}`;

  // PTT: mantener pulsado captura; soltar termina; salir cancela.
  const handlePointerDown = useCallback(() => onPress(), [onPress]);
  const handlePointerUp = useCallback(() => onRelease(), [onRelease]);
  const handlePointerLeave = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      // Solo cancela si el botón seguía pulsado al salir.
      if (e.buttons !== 0) onCancel();
    },
    [onCancel],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!isActivationKey(e.key) || e.repeat) return;
      e.preventDefault(); // evita scroll y el click sintético posterior
      onPress();
    },
    [onPress],
  );
  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      onRelease();
    },
    [onRelease],
  );

  const bodyLabel = `${visual.label}${mode === 'toggle' ? ' · toca para alternar' : ' · mantén para hablar'}`;

  const body =
    mode === 'toggle' ? (
      <button
        type="button"
        className="capsule-body"
        aria-pressed={capturing}
        aria-label={bodyLabel}
        onClick={onPress}
      >
        <span className={dotClass} style={{ background: visual.color }} />
        <Waveform active={visual.showEq} state={state} color={visual.color} />
        <span className="label">{visual.label}</span>
      </button>
    ) : (
      <button
        type="button"
        className="capsule-body"
        aria-label={bodyLabel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        <span className={dotClass} style={{ background: visual.color }} />
        <Waveform active={visual.showEq} state={state} color={visual.color} />
        <span className="label">{visual.label}</span>
      </button>
    );

  return (
    <div
      className="capsule"
      data-tauri-drag-region
      data-state={state}
      role="status"
      aria-live="polite"
      aria-label={`murmur: ${visual.label}`}
      style={anchorStyle(anchor)}
    >
      {body}
    </div>
  );
}
