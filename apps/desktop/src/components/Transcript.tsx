/**
 * Transcripción de la conversación: líneas usuario/asistente alimentadas por
 * `orchestrator.onTranscript`. Accesible: `role="log"` + `aria-live="polite"` para
 * que un lector de pantalla anuncie cada turno nuevo sin robar el foco. Alternable
 * vía `visible` (cuando se oculta no renderiza el log, no se anuncia nada).
 */

export interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface TranscriptProps {
  lines: readonly TranscriptLine[];
  /** Si `false`, no se muestra ni se anuncia. Por defecto visible. */
  visible?: boolean;
}

export function Transcript({ lines, visible = true }: TranscriptProps) {
  if (!visible) return null;

  return (
    <ul className="transcript" role="log" aria-live="polite" aria-label="Transcripción">
      {lines.length === 0 ? (
        <li className="transcript__empty" data-role="empty">
          Aún no hay nada que mostrar. Pulsa para hablar.
        </li>
      ) : (
        lines.map((line, i) => (
          <li key={i} className="transcript__line" data-role={line.role}>
            <span className="transcript__who">{line.role === 'user' ? 'Tú' : 'murmur'}</span>
            <span className="transcript__text">{line.text}</span>
          </li>
        ))
      )}
    </ul>
  );
}
