import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { ASSISTANT_STATES } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';
import { Capsule } from './Capsule';

afterEach(cleanup);

const noop = () => {};

function renderCapsule(props: Partial<Parameters<typeof Capsule>[0]> = {}) {
  return render(
    <Capsule
      state="idle"
      mode="push-to-talk"
      anchor="bottom-center"
      capturing={false}
      onPress={noop}
      onRelease={noop}
      onCancel={noop}
      {...props}
    />,
  );
}

describe('Capsule — accesibilidad y estado', () => {
  it('expone role=status con aria-live polite', () => {
    renderCapsule();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('es arrastrable vía data-tauri-drag-region', () => {
    renderCapsule();
    expect(screen.getByRole('status')).toHaveAttribute('data-tauri-drag-region');
  });

  it.each(ASSISTANT_STATES)('estado %s: aria-label, color del punto y animación', (state) => {
    renderCapsule({ state });
    const visual = stateVisuals[state];

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', expect.stringContaining(visual.label));

    const dot = status.querySelector('.dot');
    expect(dot).not.toBeNull();
    // El color se aplica inline (jsdom no resuelve variables CSS de tokens).
    expect(dot).toHaveStyle({ background: visual.color });
    if (visual.animation !== 'none') {
      expect(dot).toHaveClass(`dot--${visual.animation}`);
    }
  });

  it('muestra el ecualizador activo en listening y speaking', () => {
    for (const state of ['listening', 'speaking'] as const) {
      cleanup();
      renderCapsule({ state });
      const eq = screen.getByRole('status').querySelector('.eq');
      expect(eq).not.toBeNull();
      expect(eq).toHaveAttribute('data-active', 'true');
    }
  });

  it('mantiene el ecualizador quieto en idle, thinking y error', () => {
    for (const state of ['idle', 'thinking', 'error'] as const) {
      cleanup();
      renderCapsule({ state });
      const eq = screen.getByRole('status').querySelector('.eq');
      expect(eq).toHaveAttribute('data-active', 'false');
    }
  });
});

describe('Capsule — interacción', () => {
  it('modo toggle: cuerpo es un button con aria-pressed que refleja la captura', () => {
    const { rerender } = renderCapsule({ mode: 'toggle', capturing: false });
    const button = within(screen.getByRole('status')).getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <Capsule
        state="listening"
        mode="toggle"
        anchor="bottom-center"
        capturing={true}
        onPress={noop}
        onRelease={noop}
        onCancel={noop}
      />,
    );
    expect(within(screen.getByRole('status')).getByRole('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('modo toggle: pulsar el button dispara onPress', () => {
    const onPress = vi.fn();
    renderCapsule({ mode: 'toggle', onPress });
    fireEvent.click(within(screen.getByRole('status')).getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('modo PTT: mantener pulsado dispara onPress y soltar onRelease', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    renderCapsule({ mode: 'push-to-talk', onPress, onRelease });
    const button = within(screen.getByRole('status')).getByRole('button');
    fireEvent.pointerDown(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('teclado: Space dispara la captura', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    renderCapsule({ mode: 'push-to-talk', onPress, onRelease });
    const button = within(screen.getByRole('status')).getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key: ' ' });
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});
