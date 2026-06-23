import type { AssistantState } from '@murmur/shared';

const BAR_COUNT = 5;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => i);

export interface WaveformProps {
  /** Cuando es false las barras quedan quietas (sin animación). */
  active: boolean;
  /** Estado actual; tiñe las barras con el color del estado. */
  state: AssistantState;
  color: string;
}

/**
 * Ecualizador decorativo: N barras que animan solo cuando `active`.
 * Es `aria-hidden` porque el cambio de estado ya se anuncia vía role=status.
 */
export function Waveform({ active, state, color }: WaveformProps) {
  return (
    <span
      className={`eq${active ? ' eq--active' : ''}`}
      data-state={state}
      data-active={active}
      aria-hidden="true"
    >
      {BARS.map((i) => (
        <span
          key={i}
          className="eq-bar"
          style={{ background: color, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </span>
  );
}
