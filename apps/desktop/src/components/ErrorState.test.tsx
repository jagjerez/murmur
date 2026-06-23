import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorState, type ErrorKind } from './ErrorState';

afterEach(cleanup);

const KINDS: ErrorKind[] = ['no-api-key', 'no-mic', 'no-network', 'mic-denied'];

describe('ErrorState', () => {
  it('renderiza un mensaje y una acción de recuperación para cada enum', () => {
    for (const kind of KINDS) {
      const onAction = vi.fn();
      const { unmount } = render(<ErrorState kind={kind} onAction={onAction} />);
      // Mensaje no vacío.
      const alert = screen.getByRole('alert');
      expect(alert.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      // Acción de recuperación presente y operable.
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(onAction).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('no-api-key invita a configurar la clave', () => {
    render(<ErrorState kind="no-api-key" onAction={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/clave|api key/i);
    expect(screen.getByRole('button').textContent).toMatch(/configurar|añadir|introducir/i);
  });

  it('mic-denied explica el permiso denegado y ofrece reintentar', () => {
    render(<ErrorState kind="mic-denied" onAction={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/permiso|micrófono|denegad/i);
    expect(screen.getByRole('button').textContent).toMatch(/reintentar|permitir|volver/i);
  });

  it('no-network menciona la conexión', () => {
    render(<ErrorState kind="no-network" onAction={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/conexión|red|internet/i);
  });

  it('no-mic menciona la ausencia de micrófono', () => {
    render(<ErrorState kind="no-mic" onAction={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/micrófono/i);
  });

  it('usa role=alert para anunciarse a lectores de pantalla', () => {
    render(<ErrorState kind="no-network" onAction={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('permite personalizar la etiqueta de la acción', () => {
    render(<ErrorState kind="no-mic" onAction={() => {}} actionLabel="Elegir otro" />);
    expect(screen.getByRole('button').textContent).toBe('Elegir otro');
  });
});
