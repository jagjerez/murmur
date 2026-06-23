import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { createMemoryHotkeyManager } from '@murmur/core';
import { App, DEFAULT_HOTKEY } from './App';

afterEach(cleanup);

describe('App — cableado del hotkey global a la cápsula', () => {
  it('registra el hotkey por defecto y al dispararlo activa la captura de la cápsula', async () => {
    const hk = createMemoryHotkeyManager();
    render(<App hotkeys={hk} />);

    // El registro ocurre en un useEffect async; esperamos a que aparezca.
    await waitFor(() => expect(hk.registered()).toContain(DEFAULT_HOTKEY));

    const capsule = screen.getByRole('status');
    expect(capsule).toHaveAttribute('data-state', 'idle');

    act(() => {
      hk.trigger(DEFAULT_HOTKEY);
    });

    // En PTT, disparar el hotkey hace `press` → estado capturando (listening).
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'listening'),
    );
  });

  it('no rompe si no se inyecta manager (usa el de Tauri, no-op fuera de Tauri)', () => {
    // Sin runtime Tauri el manager por defecto degrada a no-op y no debe lanzar al montar.
    expect(() => render(<App />)).not.toThrow();
  });
});
