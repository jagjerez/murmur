import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { createMockAudioDeviceManager } from '@murmur/audio';
import { createMockConfigClient } from '../config/config-client';
import { Settings } from './Settings';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

function devices() {
  return createMockAudioDeviceManager([
    { id: 'mic-1', label: 'Micrófono integrado', kind: 'input' },
    { id: 'mic-2', label: 'Auriculares USB', kind: 'input' },
    { id: 'spk-1', label: 'Altavoces', kind: 'output' },
  ]);
}

describe('Settings', () => {
  it('lista solo los micrófonos del device manager inyectado', async () => {
    render(<Settings config={createMockConfigClient()} devices={devices()} connection="idle" />);
    const select = await screen.findByLabelText(/micrófono/i);
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toContain('Micrófono integrado');
    expect(labels).toContain('Auriculares USB');
    expect(labels).not.toContain('Altavoces');
  });

  it('cambia la voz y persiste vía ConfigClient', async () => {
    const config = createMockConfigClient();
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const voice = await screen.findByLabelText(/voz/i);
    fireEvent.change(voice, { target: { value: 'sol' } });
    await waitFor(async () => expect((await config.get()).voice).toBe('sol'));
  });

  it('cambia el modelo y persiste', async () => {
    const config = createMockConfigClient();
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const model = await screen.findByLabelText(/modelo/i);
    fireEvent.change(model, { target: { value: 'gpt-realtime-mini' } });
    await waitFor(async () => expect((await config.get()).model).toBe('gpt-realtime-mini'));
  });

  it('cambia el tema, persiste y aplica data-theme', async () => {
    const config = createMockConfigClient();
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const theme = await screen.findByLabelText(/tema/i);
    fireEvent.change(theme, { target: { value: 'light' } });
    await waitFor(async () => expect((await config.get()).theme).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('guarda un hotkey válido (canonicalizado) y persiste', async () => {
    const config = createMockConfigClient();
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const hotkey = await screen.findByLabelText(/atajo|hotkey/i);
    fireEvent.change(hotkey, { target: { value: 'cmdorctrl+shift+m' } });
    fireEvent.submit(hotkey.closest('form')!);
    await waitFor(async () => expect((await config.get()).hotkey).toBe('CommandOrControl+Shift+M'));
  });

  it('rechaza un hotkey inválido sin persistir y muestra error', async () => {
    const config = createMockConfigClient({ hotkey: 'CommandOrControl+Shift+Space' });
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const hotkey = await screen.findByLabelText(/atajo|hotkey/i);
    // Solo un modificador, sin tecla: inválido.
    fireEvent.change(hotkey, { target: { value: 'Shift+' } });
    fireEvent.submit(hotkey.closest('form')!);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // No se persistió: sigue el valor inicial.
    expect((await config.get()).hotkey).toBe('CommandOrControl+Shift+Space');
  });

  it('muestra el estado de conexión', async () => {
    render(
      <Settings config={createMockConfigClient()} devices={devices()} connection="connected" />,
    );
    expect(await screen.findByText(/conectad/i)).toBeInTheDocument();
  });

  it('carga los valores iniciales desde el ConfigClient', async () => {
    const config = createMockConfigClient({
      voice: 'sol',
      model: 'gpt-realtime-mini',
      theme: 'dark',
    });
    render(<Settings config={config} devices={devices()} connection="idle" />);
    const voice = (await screen.findByLabelText(/voz/i)) as HTMLSelectElement;
    expect(voice.value).toBe('sol');
    const model = screen.getByLabelText(/modelo/i) as HTMLSelectElement;
    expect(model.value).toBe('gpt-realtime-mini');
  });
});
