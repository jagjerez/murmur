import type { AssistantState } from '@murmur/shared';

const BAR_COUNT = 5;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => i);

export interface WaveformProps {
  /** Cuando es false las barras quedan quietas (sin animación). */
  active: boolean;
  /** Estado actual; tiñe las barras con el color del estado. */
  state: AssistantState;
  color: string;
  /**
   * Nivel de audio real 0..1 (RMS). Cuando se proporciona, escala la altura
   * de las barras; si no, las barras usan solo la animación CSS por defecto.
   */
  level?: number;
}

/**
 * Ecualizador protagonista: N barras que animan solo cuando `active`.
 * Es `aria-hidden` porque el cambio de estado ya se anuncia vía role=status.
 * Si recibe `level` (Fase 4), refleja el volumen real escalando las barras.
 */
export function Waveform({ active, state, color, level }: WaveformProps) {
  const hasLevel = typeof level === 'number';
  // Escala suave: nunca por debajo de un mínimo para que las barras no
  // desaparezcan, ni por encima de 1.
  const scale = hasLevel ? Math.max(0.15, Math.min(1, level!)) : undefined;
  return (
    <span
      className={`eq${active ? ' eq--active' : ''}`}
      data-state={state}
      data-active={active}
      data-level={hasLevel ? scale!.toFixed(2) : undefined}
      aria-hidden="true"
    >
      {BARS.map((i) => (
        <span
          key={i}
          className="eq-bar"
          style={{
            background: color,
            animationDelay: `${i * 90}ms`,
            ...(scale !== undefined ? { transform: `scaleY(${scale})` } : {}),
          }}
        />
      ))}
    </span>
  );
}
