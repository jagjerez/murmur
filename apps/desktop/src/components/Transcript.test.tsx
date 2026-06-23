import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Transcript, type TranscriptLine } from './Transcript';

afterEach(cleanup);

const lines: TranscriptLine[] = [
  { role: 'user', text: 'hola, ¿qué tal?' },
  { role: 'assistant', text: 'muy bien, ¿y tú?' },
];

describe('Transcript', () => {
  it('muestra las líneas de usuario y asistente', () => {
    render(<Transcript lines={lines} />);
    expect(screen.getByText('hola, ¿qué tal?')).toBeInTheDocument();
    expect(screen.getByText('muy bien, ¿y tú?')).toBeInTheDocument();
  });

  it('distingue el rol de cada línea (data-role)', () => {
    render(<Transcript lines={lines} />);
    const log = screen.getByRole('log');
    const items = within(log).getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-role', 'user');
    expect(items[1]).toHaveAttribute('data-role', 'assistant');
  });

  it('usa aria-live para anunciar el avance de la conversación', () => {
    render(<Transcript lines={lines} />);
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('sin líneas muestra un estado vacío', () => {
    render(<Transcript lines={[]} />);
    expect(screen.getByText(/aún no hay|todavía no|vacío|nada/i)).toBeInTheDocument();
  });

  it('puede ocultarse cuando no está visible', () => {
    const { container } = render(<Transcript lines={lines} visible={false} />);
    // No renderiza el log cuando está oculto.
    expect(container.querySelector('[role="log"]')).toBeNull();
  });

  it('por defecto es visible', () => {
    render(<Transcript lines={lines} />);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });
});
