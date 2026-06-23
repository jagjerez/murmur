/**
 * `whisper.ts` — `TranscriptionProvider`s alternativos al realtime (F5).
 *
 * Provee tres implementaciones de la interfaz de F0
 * (`TranscriptionProvider { mode; transcribe(audio) }`):
 *
 *  - `createOpenAIWhisperProvider` (`whisper-api`): transcribe vía la Whisper
 *    API de OpenAI (`POST /v1/audio/transcriptions`, multipart `FormData`).
 *  - `createLocalWhisperProvider` (`local-whisper`): delega en un ejecutor
 *    `run(audio)` inyectable (ver nota más abajo).
 *  - `createMockTranscriptionProvider`: determinista para tests/orchestrator.
 *
 * y un selector `selectTranscriptionProvider(mode, deps)`.
 *
 * SEGURIDAD — la API key viaja en la cabecera `Authorization: Bearer …` y
 * NUNCA se loguea ni se incluye en los mensajes de error.
 *
 * SIN RED EN TESTS — `fetchFn` (whisper-api) y `run` (local-whisper) son
 * inyectables, de modo que toda la lógica se prueba sin tocar red.
 *
 * AUDIO — se reutiliza el PCM16 canónico de F4. Para la Whisper API los bytes
 * se envuelven en un `Blob` con un `content-type` configurable (`format`,
 * default `audio/wav`); en producción el llamante debe pasar bytes ya en un
 * contenedor que la API entienda (p. ej. WAV). El empaquetado fino del
 * contenedor queda fuera de esta fase.
 *
 * WHISPER LOCAL — `createLocalWhisperProvider` NO empaqueta ningún binario ni
 * modelo: recibe un `run(audio) => Promise<string>` que en producción invocará
 * un whisper local instalado por el usuario o provisto por una fase posterior
 * (F16). Aquí solo se define el enchufe y se valida que exista `run`.
 */

import { ModelError } from '@murmur/shared';
import type { TranscriptionMode, TranscriptionProvider } from './transcription-provider';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_FORMAT = 'audio/wav';
const DEFAULT_FILENAME = 'audio.wav';

/** `fetch` mínimo que usa el provider whisper-api (inyectable para tests). */
export type WhisperFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Ejecutor de whisper local: recibe los bytes de audio y devuelve el texto. */
export type LocalWhisperRun = (audio: Uint8Array) => Promise<string>;

export interface OpenAIWhisperOptions {
  /** API key de OpenAI. Solo se usa en la cabecera `Authorization`; no se loguea. */
  apiKey: string;
  /** Modelo de transcripción (default `whisper-1`). */
  model?: string;
  /** `fetch` inyectable (default `globalThis.fetch`). */
  fetchFn?: WhisperFetch;
  /** `content-type` del `Blob` enviado (default `audio/wav`). */
  format?: string;
}

export interface LocalWhisperOptions {
  /** Ejecutor del whisper local. Obligatorio. */
  run: LocalWhisperRun;
}

function defaultFetch(): WhisperFetch {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== 'function') {
    throw new ModelError('No hay fetch disponible en este entorno (globalThis.fetch).');
  }
  return (url, init) => (f as WhisperFetch)(url, init);
}

/** Extrae `{ text }` de la respuesta de la Whisper API; valida el tipo. */
function parseText(body: unknown): string {
  if (body !== null && typeof body === 'object' && 'text' in body) {
    const text = (body as { text?: unknown }).text;
    if (typeof text === 'string') {
      return text.trim();
    }
  }
  throw new ModelError('Respuesta inesperada de la Whisper API (falta el campo "text").');
}

/**
 * Provider `whisper-api`: transcribe vía la Whisper API de OpenAI.
 *
 * Construye un `FormData` con `file` (un `Blob` de los bytes con el
 * `content-type` indicado) y `model`, y hace `POST` con `Authorization: Bearer`.
 * Cualquier fallo de red, HTTP o de parseo se traduce a `ModelError` SIN
 * exponer la API key.
 */
export function createOpenAIWhisperProvider(options: OpenAIWhisperOptions): TranscriptionProvider {
  const model = options.model ?? DEFAULT_MODEL;
  const format = options.format ?? DEFAULT_FORMAT;
  const fetchFn = options.fetchFn ?? defaultFetch();

  return {
    mode: 'whisper-api',
    async transcribe(audio: Uint8Array): Promise<string> {
      const form = new FormData();
      // Copiamos los bytes a un Uint8Array nuevo para garantizar un ArrayBuffer
      // (no SharedArrayBuffer) compatible con el constructor de Blob.
      const blob = new Blob([new Uint8Array(audio)], { type: format });
      form.append('file', blob, DEFAULT_FILENAME);
      form.append('model', model);

      let response: Response;
      try {
        response = await fetchFn(WHISPER_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.apiKey}` },
          body: form,
        });
      } catch {
        // No adjuntamos la causa para no arrastrar un posible eco de cabeceras/keys.
        throw new ModelError('No se pudo contactar con la Whisper API.');
      }

      if (!response.ok) {
        throw new ModelError(`La Whisper API respondió con estado ${response.status}.`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ModelError('No se pudo parsear la respuesta de la Whisper API.');
      }

      return parseText(payload);
    },
  };
}

/**
 * Provider `local-whisper`: delega en el ejecutor `run` inyectado.
 *
 * No empaqueta ningún binario/modelo; `run` lo aporta el llamante. Sin `run`
 * lanza un `ModelError` claro en la construcción.
 */
export function createLocalWhisperProvider(options: LocalWhisperOptions): TranscriptionProvider {
  if (typeof options.run !== 'function') {
    throw new ModelError(
      'createLocalWhisperProvider requiere un ejecutor `run`; el whisper local no se empaqueta aquí.',
    );
  }
  const run = options.run;

  return {
    mode: 'local-whisper',
    async transcribe(audio: Uint8Array): Promise<string> {
      try {
        return await run(audio);
      } catch (cause) {
        throw new ModelError('El whisper local falló al transcribir.', { cause });
      }
    },
  };
}

/**
 * Provider de prueba determinista: `transcribe` devuelve siempre `text`.
 * `mode` por defecto `whisper-api` (configurable).
 */
export function createMockTranscriptionProvider(
  text: string,
  mode: TranscriptionMode = 'whisper-api',
): TranscriptionProvider {
  return {
    mode,
    transcribe(): Promise<string> {
      return Promise.resolve(text);
    },
  };
}

/** Dependencias que puede necesitar el selector según el modo elegido. */
export interface SelectTranscriptionDeps {
  /** Para `whisper-api`. */
  apiKey?: string;
  model?: string;
  fetchFn?: WhisperFetch;
  format?: string;
  /** Para `local-whisper`. */
  run?: LocalWhisperRun;
}

/**
 * Elige el `TranscriptionProvider` adecuado para `mode`.
 *
 * - `whisper-api` → `createOpenAIWhisperProvider` (requiere `apiKey`).
 * - `local-whisper` → `createLocalWhisperProvider` (requiere `run`).
 * - `realtime` → la transcripción la hace el propio realtime (F5), no hay un
 *   provider aparte: se devuelve un provider cuyo `transcribe` lanza
 *   `ModelError`, para que un uso indebido falle de forma explícita.
 */
export function selectTranscriptionProvider(
  mode: TranscriptionMode,
  deps: SelectTranscriptionDeps,
): TranscriptionProvider {
  switch (mode) {
    case 'whisper-api': {
      if (deps.apiKey === undefined) {
        throw new ModelError('El modo whisper-api requiere una API key de OpenAI.');
      }
      return createOpenAIWhisperProvider({
        apiKey: deps.apiKey,
        model: deps.model,
        fetchFn: deps.fetchFn,
        format: deps.format,
      });
    }
    case 'local-whisper': {
      if (deps.run === undefined) {
        throw new ModelError('El modo local-whisper requiere un ejecutor `run`.');
      }
      return createLocalWhisperProvider({ run: deps.run });
    }
    case 'realtime':
      return {
        mode: 'realtime',
        transcribe(): Promise<string> {
          return Promise.reject(
            new ModelError(
              'El modo realtime transcribe a través de la sesión realtime (F5); ' +
                'no hay un provider de transcripción separado.',
            ),
          );
        },
      };
    default: {
      // Exhaustividad: si se añade un modo nuevo, TS marcará este caso.
      const exhaustive: never = mode;
      throw new ModelError(`Modo de transcripción desconocido: ${String(exhaustive)}`);
    }
  }
}
