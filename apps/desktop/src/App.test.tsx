import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { createMemoryHotkeyManager, createMockRealtimeProvider } from '@murmur/core';
import { createMockVoiceInput, createMemoryVoiceOutput } from '@murmur/audio';
import { createMockConfigClient } from './config/config-client';
import { App, type AppProps } from './App';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

function grantedMic() {
  return vi.fn(async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
}

function baseProps(overrides: Partial<AppProps> = {}): AppProps {
  return {
    config: createMockConfigClient({ apiKey: 'sk-test-key-abcdef' }),
    realtime: createMockRealtimeProvider(),
    input: createMockVoiceInput([new Uint8Array([1])]),
    output: createMemoryVoiceOutput(),
    hotkey: createMemoryHotkeyManager(),
    requestMic: grantedMic(),
    ...overrides,
  };
}

describe('App shell — onboarding vs cápsula', () => {
  it('sin API key muestra el onboarding', async () => {
    const props = baseProps({ config: createMockConfigClient() });
    render(<App {...props} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/murmur|bienvenid/i);
    // No hay cápsula todavía.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('con API key (mock config) muestra la cápsula', async () => {
    render(<App {...baseProps()} />);
    expect(await screen.findByRole('status')).toHaveAttribute('data-state', 'idle');
  });

  it('el hotkey inyectado dispara la captura y la cápsula refleja el estado', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({
      apiKey: 'sk-test-key-abcdef',
      hotkey: 'CommandOrControl+Shift+Space',
    });
    render(<App {...baseProps({ hotkey, realtime, config })} />);

    await screen.findByRole('status');
    await waitFor(() => expect(hotkey.registered()).toContain('CommandOrControl+Shift+Space'));

    await act(async () => {
      hotkey.trigger('CommandOrControl+Shift+Space');
    });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'listening'),
    );

    // El estado del orchestrator se refleja en la cápsula.
    act(() => {
      realtime.emitState('thinking');
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'thinking'),
    );
  });

  it('al completar el onboarding aparece la cápsula', async () => {
    const config = createMockConfigClient();
    render(<App {...baseProps({ config })} />);

    // Bienvenida → API key.
    fireEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    fireEvent.change(await screen.findByLabelText(/^api key$/i), {
      target: { value: 'sk-proj-test-1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    // Micrófono.
    fireEvent.click(await screen.findByRole('button', { name: /permitir el micrófono/i }));
    // Atajo.
    const hotkey = await screen.findByLabelText(/atajo global/i);
    fireEvent.change(hotkey, { target: { value: 'cmdorctrl+shift+m' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar y listo/i }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('expone el acceso a los ajustes cuando hay API key', async () => {
    render(<App {...baseProps()} />);
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: /ajustes/i })).toBeInTheDocument();
  });

  it('no rompe sin deps (usa defaults: Tauri/Web, no-op fuera de Tauri)', () => {
    expect(() => render(<App />)).not.toThrow();
  });
});
