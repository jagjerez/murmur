/**
 * Estado de error/vacío dirigido por enum. Cada caso ofrece un mensaje claro y una
 * **acción de recuperación** (un botón). Accesible: `role="alert"` lo anuncia a
 * lectores de pantalla y el botón es operable por teclado.
 */

export type ErrorKind = 'no-api-key' | 'no-mic' | 'no-network' | 'mic-denied';

export interface ErrorStateProps {
  kind: ErrorKind;
  /** Acción de recuperación (reintentar, abrir ajustes, configurar la clave…). */
  onAction: () => void;
  /** Etiqueta opcional para sobrescribir la acción por defecto. */
  actionLabel?: string;
}

interface ErrorCopy {
  title: string;
  message: string;
  action: string;
}

const COPY: Record<ErrorKind, ErrorCopy> = {
  'no-api-key': {
    title: 'Falta tu clave de OpenAI',
    message: 'murmur necesita una API key para conversar. Añádela para empezar.',
    action: 'Configurar la clave',
  },
  'no-mic': {
    title: 'No hay micrófono disponible',
    message: 'No se ha encontrado ningún micrófono. Conecta uno o elige otra entrada.',
    action: 'Elegir micrófono',
  },
  'no-network': {
    title: 'Sin conexión',
    message: 'murmur no puede llegar a internet ahora mismo. Revisa tu conexión de red.',
    action: 'Reintentar',
  },
  'mic-denied': {
    title: 'Permiso de micrófono denegado',
    message:
      'Necesitamos tu permiso para escucharte. Permite el acceso al micrófono y vuelve a intentarlo.',
    action: 'Reintentar',
  },
};

export function ErrorState({ kind, onAction, actionLabel }: ErrorStateProps) {
  const copy = COPY[kind];
  return (
    <div className="error-state" role="alert" data-kind={kind}>
      <p className="error-state__title">{copy.title}</p>
      <p className="error-state__message">{copy.message}</p>
      <button type="button" className="error-state__action" onClick={onAction}>
        {actionLabel ?? copy.action}
      </button>
    </div>
  );
}
