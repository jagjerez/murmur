import { mkdir, writeFile as fsWriteFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Entrada del catálogo de modelos descargables. */
export interface ModelEntry {
  /** Nombre del fichero destino (en `~/.murmur/models/`). */
  file: string;
  /** URL de descarga. */
  url: string;
  /** Tamaño aproximado, para avisar al usuario. */
  sizeLabel: string;
  /** Descripción legible. */
  description: string;
}

/**
 * Catálogo de modelos que murmur sabe descargar. Solo whisper (descarga directa de un fichero).
 * El LLM (Ollama) y la voz de Piper se gestionan con sus propias herramientas, no aquí.
 */
export const MODEL_CATALOG: Record<string, ModelEntry> = {
  'whisper-large-v3': {
    // El nombre del fichero debe coincidir con el que carga el comando Tauri `transcribe` (T6).
    file: 'ggml-large-v3.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    sizeLabel: '~3 GB',
    description: 'Whisper large-v3 (ggml) — STT local multilingüe, máxima calidad.',
  },
};

/** Carpeta de modelos: `~/.murmur/models` (respeta `MURMUR_HOME`). */
export function modelsDir(): string {
  const home = process.env.MURMUR_HOME ?? join(homedir(), '.murmur');
  return join(home, 'models');
}

export interface DownloadDeps {
  /** Carpeta destino (default `modelsDir()`). */
  dir?: string;
  fetchFn?: typeof globalThis.fetch;
  writeFile?: (path: string, data: Uint8Array) => Promise<void>;
  exists?: (path: string) => boolean;
  /** Crea la carpeta destino (default `mkdir -p`). */
  ensureDir?: (dir: string) => Promise<void>;
}

/**
 * Descarga un modelo del catálogo a `dir`. Idempotente: si el fichero ya existe, no re-descarga.
 * I/O inyectable (sin red ni disco en tests). Devuelve la ruta del fichero destino.
 */
export async function downloadModel(name: string, deps: DownloadDeps = {}): Promise<string> {
  const entry = MODEL_CATALOG[name];
  if (entry === undefined) {
    throw new Error(
      `modelo desconocido "${name}" (disponibles: ${Object.keys(MODEL_CATALOG).join(', ')}).`,
    );
  }
  const dir = deps.dir ?? modelsDir();
  const dest = join(dir, entry.file);
  const exists = deps.exists ?? existsSync;
  if (exists(dest)) {
    return dest;
  }
  const ensureDir =
    deps.ensureDir ?? (async (d: string) => void (await mkdir(d, { recursive: true })));
  await ensureDir(dir);
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const writeFile = deps.writeFile ?? ((p: string, d: Uint8Array) => fsWriteFile(p, d));
  const res = await fetchFn(entry.url);
  if (!res.ok) {
    throw new Error(`fallo al descargar "${name}": estado HTTP ${res.status}.`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await writeFile(dest, bytes);
  return dest;
}
