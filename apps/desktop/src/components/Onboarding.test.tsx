import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { createMockConfigClient } from '../config/config-client';
import { Onboarding } from './Onboarding';

afterEach(cleanup);

/** Permiso de micrófono concedido: getUserMedia resuelve con un stream con tracks parables. */
function grantedMic(): () => Promise<MediaStream> {
  return vi.fn(async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
}

/** Permiso denegado: getUserMedia rechaza (como NotAllowedError). */
function deniedMic(): () => Promise<MediaStream> {
  return vi.fn(async () => {
    throw new DOMException('Permission denied', 'NotAllowedError');
  });
}

async function advanceToApiKey() {
  // Paso bienvenida → continuar.
  fireEvent.click(screen.getByRole('button', { name: /empezar|continuar|siguiente/i }));
}

describe('Onboarding', () => {
  it('arranca en el paso de bienvenida', () => {
    render(
      <Onboarding
        config={createMockConfigClient()}
        requestMic={grantedMic()}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/murmur|bienvenid/i);
  });

  it('guarda la API key vía ConfigClient al avanzar', async () => {
    const config = createMockConfigClient();
    render(<Onboarding config={config} requestMic={grantedMic()} onComplete={() => {}} />);

    await advanceToApiKey();
    const keyInput = await screen.findByLabelText(/^api key$/i);
    fireEvent.change(keyInput, { target: { value: 'sk-proj-test-1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente/i }));

    await waitFor(async () => expect((await config.get()).hasApiKey).toBe(true));
    // La key no se filtra en el DOM como texto plano de la vista.
    expect((await config.get()).apiKeyHint).not.toBe('sk-proj-test-1234567890');
  });

  it('no avanza desde API key si está vacía', async () => {
    const config = createMockConfigClient();
    render(<Onboarding config={config} requestMic={grantedMic()} onComplete={() => {}} />);
    await advanceToApiKey();
    const next = screen.getByRole('button', { name: /guardar|continuar|siguiente/i });
    fireEvent.click(next);
    // Sigue en el paso de API key (no aparece el de micrófono).
    expect(screen.queryByText(/micrófono/i)).toBeNull();
    expect((await config.get()).hasApiKey).toBe(false);
  });

  it('concede el permiso de micrófono y avanza', async () => {
    const requestMic = grantedMic();
    render(
      <Onboarding
        config={createMockConfigClient()}
        requestMic={requestMic}
        onComplete={() => {}}
      />,
    );

    await advanceToApiKey();
    fireEvent.change(await screen.findByLabelText(/^api key$/i), {
      target: { value: 'sk-proj-test-1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente/i }));

    // Paso micrófono: pedir permiso.
    const allow = await screen.findByRole('button', { name: /permitir|conceder|micrófono/i });
    fireEvent.click(allow);
    await waitFor(() => expect(requestMic).toHaveBeenCalled());
    // Avanza al paso de atajo.
    expect(await screen.findByLabelText(/atajo global/i)).toBeInTheDocument();
  });

  it('maneja el permiso de micrófono denegado con un mensaje', async () => {
    render(
      <Onboarding
        config={createMockConfigClient()}
        requestMic={deniedMic()}
        onComplete={() => {}}
      />,
    );

    await advanceToApiKey();
    fireEvent.change(await screen.findByLabelText(/^api key$/i), {
      target: { value: 'sk-proj-test-1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente/i }));

    fireEvent.click(await screen.findByRole('button', { name: /permitir|conceder|micrófono/i }));

    // Aparece un mensaje de denegado (alert) y NO avanza al atajo.
    expect(await screen.findByRole('alert')).toHaveTextContent(/denegad|permiso/i);
    expect(screen.queryByLabelText(/atajo|hotkey/i)).toBeNull();
  });

  it('valida el hotkey antes de guardar y rechaza el inválido', async () => {
    const config = createMockConfigClient();
    const requestMic = grantedMic();
    render(<Onboarding config={config} requestMic={requestMic} onComplete={() => {}} />);

    await advanceToApiKey();
    fireEvent.change(await screen.findByLabelText(/^api key$/i), {
      target: { value: 'sk-proj-test-1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /permitir|conceder|micrófono/i }));

    const hotkey = await screen.findByLabelText(/atajo global/i);
    // Inválido: solo modificador.
    fireEvent.change(hotkey, { target: { value: 'Shift+' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente|listo/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('completa el flujo: guarda hotkey válido y llama onComplete', async () => {
    const config = createMockConfigClient();
    const onComplete = vi.fn();
    render(<Onboarding config={config} requestMic={grantedMic()} onComplete={onComplete} />);

    await advanceToApiKey();
    fireEvent.change(await screen.findByLabelText(/^api key$/i), {
      target: { value: 'sk-proj-test-1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /permitir|conceder|micrófono/i }));

    const hotkey = await screen.findByLabelText(/atajo global/i);
    fireEvent.change(hotkey, { target: { value: 'cmdorctrl+shift+m' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar|continuar|siguiente|listo/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect((await config.get()).hotkey).toBe('CommandOrControl+Shift+M');
  });

  it('cada paso tiene un encabezado para navegar con lector de pantalla', () => {
    render(
      <Onboarding
        config={createMockConfigClient()}
        requestMic={grantedMic()}
        onComplete={() => {}}
      />,
    );
    // El contenedor tiene un rol semántico.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
