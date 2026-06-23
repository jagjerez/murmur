import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, within } from '@testing-library/react';
import { createMemoryHotkeyManager } from '@murmur/core';
import { createMockAudioDeviceManager } from '@murmur/audio';
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

describe('App — dispositivos de audio en el panel dev', () => {
  it('lista los dispositivos de entrada del AudioDeviceManager inyectado', async () => {
    const hk = createMemoryHotkeyManager();
    const devices = createMockAudioDeviceManager([
      { id: 'mic-1', label: 'Micrófono integrado', kind: 'input' },
      { id: 'mic-2', label: 'Auriculares USB', kind: 'input' },
      { id: 'spk-1', label: 'Altavoces', kind: 'output' },
    ]);
    render(<App hotkeys={hk} devices={devices} />);

    const select = await screen.findByLabelText('Micrófono');
    const options = within(select).getAllByRole('option');
    // Solo entradas (2), no la salida.
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('Micrófono integrado');
    expect(labels).toContain('Auriculares USB');
    expect(labels).not.toContain('Altavoces');
  });

  it('sin dispositivos de entrada muestra un mensaje de vacío', async () => {
    const hk = createMemoryHotkeyManager();
    const devices = createMockAudioDeviceManager([]);
    render(<App hotkeys={hk} devices={devices} />);
    expect(await screen.findByText(/sin dispositivos de entrada/i)).toBeInTheDocument();
  });
});
