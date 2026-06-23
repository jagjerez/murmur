import { useId, useState } from 'react';
import { canonicalizeAccelerator } from '@murmur/core';
import { HotkeyError } from '@murmur/shared';
import type { ConfigClient } from '../config/config-client';
import { CONFIG_DEFAULTS } from '../config/config-client';

/** Pide permiso de micrófono. Inyectable: en tests se mockea (sin hardware). */
export type RequestMic = () => Promise<MediaStream>;

export interface OnboardingProps {
  config: ConfigClient;
  /** Solicitud de permiso de micrófono. Por defecto `navigator.mediaDevices.getUserMedia`. */
  requestMic?: RequestMic;
  /** Se invoca al terminar (con la config ya guardada). */
  onComplete: () => void;
}

type Step = 'welcome' | 'api-key' | 'mic' | 'hotkey';

const STEP_ORDER: Step[] = ['welcome', 'api-key', 'mic', 'hotkey'];

function defaultRequestMic(): Promise<MediaStream> {
  const media = globalThis.navigator?.mediaDevices;
  if (!media || typeof media.getUserMedia !== 'function') {
    return Promise.reject(new Error('getUserMedia no disponible'));
  }
  return media.getUserMedia({ audio: true });
}

/**
 * Onboarding por pasos: bienvenida → API key → permiso de micrófono → atajo → listo.
 * Guarda todo vía `ConfigClient` (la key nunca toca el repo). Accesible: cada paso es
 * un `<section>` con su encabezado; el primero es `<h1>` para anclar el foco del lector
 * de pantalla; los errores se anuncian con `role="alert"`.
 */
export function Onboarding({
  config,
  requestMic = defaultRequestMic,
  onComplete,
}: OnboardingProps) {
  const ids = { key: useId(), hotkey: useId() };
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  const [hotkey, setHotkey] = useState<string>(CONFIG_DEFAULTS.hotkey);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  const goTo = (next: Step): void => setStep(next);

  const handleSaveKey = async (): Promise<void> => {
    if (apiKey.trim().length === 0) return; // no avanza con la clave vacía
    await config.setOpenAiKey(apiKey.trim());
    goTo('mic');
  };

  const handleRequestMic = async (): Promise<void> => {
    setMicBusy(true);
    setMicError(null);
    try {
      const stream = await requestMic();
      // Liberamos el stream: solo queríamos el permiso, no capturar todavía.
      for (const track of stream.getTracks()) track.stop();
      goTo('hotkey');
    } catch {
      setMicError(
        'Permiso de micrófono denegado. Habilítalo en los ajustes del sistema y vuelve a intentarlo.',
      );
    } finally {
      setMicBusy(false);
    }
  };

  const handleSaveHotkey = async (): Promise<void> => {
    try {
      const canonical = canonicalizeAccelerator(hotkey);
      setHotkeyError(null);
      await config.setHotkey(canonical);
      onComplete();
    } catch (err) {
      setHotkeyError(err instanceof HotkeyError ? err.message : 'Atajo inválido');
    }
  };

  return (
    <main className="onboarding" aria-label="Configuración inicial de murmur">
      <ol className="onboarding__progress" aria-hidden="true">
        {STEP_ORDER.map((s, i) => (
          <li key={s} data-active={i === stepIndex} data-done={i < stepIndex} />
        ))}
      </ol>

      {step === 'welcome' && (
        <section className="onboarding__step" aria-labelledby="onb-welcome">
          <h1 id="onb-welcome">Bienvenido a murmur</h1>
          <p>
            Tu compañero de voz, cálido y cercano. Vamos a configurarlo en unos pasos: tu clave de
            OpenAI, el micrófono y un atajo para invocarlo.
          </p>
          <button type="button" onClick={() => goTo('api-key')}>
            Empezar
          </button>
        </section>
      )}

      {step === 'api-key' && (
        <section className="onboarding__step" aria-labelledby="onb-key">
          <h1 id="onb-key">Tu clave de OpenAI</h1>
          <p>murmur la guarda en tu equipo, nunca se comparte. La necesitas para conversar.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveKey();
            }}
          >
            <label htmlFor={ids.key}>API key</label>
            <input
              id={ids.key}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button type="submit" disabled={apiKey.trim().length === 0}>
              Guardar y continuar
            </button>
          </form>
        </section>
      )}

      {step === 'mic' && (
        <section className="onboarding__step" aria-labelledby="onb-mic">
          <h1 id="onb-mic">Permiso de micrófono</h1>
          <p>murmur necesita escucharte. Concede el acceso al micrófono para continuar.</p>
          <button type="button" onClick={() => void handleRequestMic()} disabled={micBusy}>
            Permitir el micrófono
          </button>
          {micError !== null && (
            <p className="onboarding__error" role="alert">
              {micError}
            </p>
          )}
        </section>
      )}

      {step === 'hotkey' && (
        <section className="onboarding__step" aria-labelledby="onb-hotkey">
          <h1 id="onb-hotkey">Elige tu atajo</h1>
          <p>Pulsa este atajo en cualquier momento para hablar con murmur.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveHotkey();
            }}
          >
            <label htmlFor={ids.hotkey}>Atajo global</label>
            <input
              id={ids.hotkey}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={hotkey}
              aria-invalid={hotkeyError !== null}
              onChange={(e) => {
                setHotkey(e.target.value);
                setHotkeyError(null);
              }}
            />
            <button type="submit">Guardar y listo</button>
            {hotkeyError !== null && (
              <p className="onboarding__error" role="alert">
                {hotkeyError}
              </p>
            )}
          </form>
        </section>
      )}
    </main>
  );
}
