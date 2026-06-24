//! Comandos Tauri del modo offline (feature `offline`): transcripción local (whisper.cpp vía
//! whisper-rs) y TTS local (Piper por subproceso). Los modelos/voces viven en `~/.murmur/models/`
//! y los aporta el usuario; nada se empaqueta aquí. Este módulo solo compila con `--features offline`
//! y NO entra en el `cargo test` por defecto del proyecto (que vive en `packages/native`).

use std::path::PathBuf;
use std::process::Command;

/// Carpeta de modelos: `~/.murmur/models` (respeta `MURMUR_HOME`, como el resto del proyecto).
fn models_dir() -> PathBuf {
    let base = std::env::var("MURMUR_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".murmur")
    });
    base.join("models")
}

/// Transcribe muestras f32 mono a 16 kHz con whisper.cpp (modelo `ggml-large-v3.bin` en `~/.murmur/models`).
#[tauri::command]
pub fn transcribe(samples: Vec<f32>) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

    let model = models_dir().join("ggml-large-v3.bin");
    let model_path = model.to_string_lossy().to_string();
    let ctx = WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())
        .map_err(|e| format!("no se pudo cargar el modelo whisper en {model_path}: {e}"))?;
    let mut state = ctx.create_state().map_err(|e| format!("estado whisper: {e}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_print_progress(false);
    params.set_print_realtime(false);
    state.full(params, &samples).map_err(|e| format!("fallo al transcribir: {e}"))?;
    let n = state.full_n_segments().map_err(|e| format!("segmentos: {e}"))?;
    let mut out = String::new();
    for i in 0..n {
        if let Ok(seg) = state.full_get_segment_text(i) {
            out.push_str(&seg);
        }
    }
    Ok(out.trim().to_string())
}

/// Sintetiza `text` con Piper (subproceso) y devuelve PCM crudo. La voz (`voice.onnx`) vive en
/// `~/.murmur/models`. `piper` debe estar en el PATH.
#[tauri::command]
pub fn tts(text: String) -> Result<Vec<u8>, String> {
    use std::io::Write;

    let voice = models_dir().join("voice.onnx");
    let mut child = Command::new("piper")
        .arg("--model")
        .arg(voice)
        .arg("--output_raw")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo lanzar piper (¿está instalado y en el PATH?): {e}"))?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "sin stdin para piper".to_string())?
        .write_all(text.as_bytes())
        .map_err(|e| format!("error escribiendo a piper: {e}"))?;
    let output = child.wait_with_output().map_err(|e| format!("piper falló: {e}"))?;
    if !output.status.success() {
        return Err(format!("piper salió con error: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(output.stdout)
}
