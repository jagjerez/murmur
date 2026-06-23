//! Comandos de configuración de murmur expuestos al webview (Fase 11).
//!
//! Persisten en el MISMO archivo que el CLI de F1 (`$MURMUR_HOME` o `~/.murmur/config.json`),
//! con los mismos nombres de campo (`openaiApiKey`, `hotkey`, `model`, `voice`, `theme`).
//! La API key NUNCA viaja al webview en claro: `get_config` devuelve sólo `has_api_key` y un
//! `api_key_hint` redactado. El cableado interno usa `read_openai_key` (no debe renderizarse).
//!
//! IMPORTANTE: la build nativa de Tauri queda FUERA del pipeline de CI (no se compila aquí).
//! Este módulo se mantiene coherente con el `ConfigClient` TS (`config/config-client.ts`).

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";
const DEFAULT_MODEL: &str = "gpt-realtime";
const DEFAULT_VOICE: &str = "verse";
const DEFAULT_THEME: &str = "system";

/// Config persistida en disco (snake/camel: usa los nombres del CLI de F1).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MurmurConfig {
    #[serde(rename = "openaiApiKey", skip_serializing_if = "Option::is_none")]
    openai_api_key: Option<String>,
    hotkey: String,
    model: String,
    voice: String,
    theme: String,
}

impl Default for MurmurConfig {
    fn default() -> Self {
        Self {
            openai_api_key: None,
            hotkey: DEFAULT_HOTKEY.to_string(),
            model: DEFAULT_MODEL.to_string(),
            voice: DEFAULT_VOICE.to_string(),
            theme: DEFAULT_THEME.to_string(),
        }
    }
}

/// Vista segura para el webview: la key se reduce a un booleano + pista redactada.
#[derive(Debug, Clone, Serialize)]
pub struct ConfigView {
    has_api_key: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key_hint: Option<String>,
    hotkey: String,
    model: String,
    voice: String,
    theme: String,
}

/// Parche parcial que el webview envía a `set_config`.
#[derive(Debug, Default, Deserialize)]
pub struct ConfigPatch {
    hotkey: Option<String>,
    model: Option<String>,
    voice: Option<String>,
    theme: Option<String>,
}

fn base_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MURMUR_HOME") {
        return PathBuf::from(dir);
    }
    let mut home = dirs_home();
    home.push(".murmur");
    home
}

/// Directorio home del usuario (sin dependencias extra: usa variables de entorno).
fn dirs_home() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return PathBuf::from(profile);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(".")
}

fn config_path() -> PathBuf {
    let mut p = base_dir();
    p.push("config.json");
    p
}

fn load() -> MurmurConfig {
    let path = config_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return MurmurConfig::default();
    };
    serde_json::from_str::<MurmurConfig>(&raw).unwrap_or_default()
}

fn save(config: &MurmurConfig) -> Result<(), String> {
    let dir = base_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("no se pudo crear {dir:?}: {e}"))?;
    let path = config_path();
    let json =
        serde_json::to_string_pretty(config).map_err(|e| format!("serialización: {e}"))?;

    // Escribe con permisos 0600 en Unix (la key vive aquí).
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .map_err(|e| format!("no se pudo abrir {path:?}: {e}"))?;
        file.write_all(json.as_bytes())
            .map_err(|e| format!("escritura: {e}"))?;
        file.write_all(b"\n").map_err(|e| format!("escritura: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(&path, format!("{json}\n")).map_err(|e| format!("escritura: {e}"))?;
    }
    Ok(())
}

/// Redacta una key: prefijo de marca + sufijo corto (`sk-…WXYZ`). Coincide con `redactKey` TS.
fn redact_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 6 {
        return "…".to_string();
    }
    let prefix: String = chars.iter().take(3).collect();
    let suffix: String = chars.iter().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{prefix}…{suffix}")
}

fn view_of(config: &MurmurConfig) -> ConfigView {
    let has_api_key = config
        .openai_api_key
        .as_ref()
        .map(|k| !k.is_empty())
        .unwrap_or(false);
    ConfigView {
        has_api_key,
        api_key_hint: if has_api_key {
            config.openai_api_key.as_ref().map(|k| redact_key(k))
        } else {
            None
        },
        hotkey: config.hotkey.clone(),
        model: config.model.clone(),
        voice: config.voice.clone(),
        theme: config.theme.clone(),
    }
}

/// Devuelve la vista segura de la config (sin la key en claro).
#[tauri::command]
pub fn get_config() -> ConfigView {
    view_of(&load())
}

/// Aplica un parche parcial (todo menos la key) y persiste.
#[tauri::command]
pub fn set_config(patch: ConfigPatch) -> Result<ConfigView, String> {
    let mut config = load();
    if let Some(v) = patch.hotkey {
        config.hotkey = v;
    }
    if let Some(v) = patch.model {
        config.model = v;
    }
    if let Some(v) = patch.voice {
        config.voice = v;
    }
    if let Some(v) = patch.theme {
        config.theme = v;
    }
    save(&config)?;
    Ok(view_of(&config))
}

/// Guarda la API key (cadena vacía la borra). Devuelve la vista segura.
#[tauri::command]
pub fn set_openai_key(key: String) -> Result<ConfigView, String> {
    let mut config = load();
    config.openai_api_key = if key.is_empty() { None } else { Some(key) };
    save(&config)?;
    Ok(view_of(&config))
}

/// Devuelve la API key COMPLETA (uso interno del orchestrator; nunca renderizar).
#[tauri::command]
pub fn read_openai_key() -> Option<String> {
    load().openai_api_key.filter(|k| !k.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacta_sin_filtrar_la_key() {
        let full = "sk-proj-abcdefghijklmnopqrstuvwxyz0123";
        let red = redact_key(full);
        assert_ne!(red, full);
        assert!(!red.contains("abcdefghij"));
        assert!(red.ends_with("0123"));
        assert!(red.contains('…'));
    }

    #[test]
    fn redacta_claves_cortas_por_completo() {
        assert_eq!(redact_key("abc"), "…");
        assert_eq!(redact_key(""), "");
    }

    #[test]
    fn la_vista_no_expone_la_key() {
        let mut config = MurmurConfig::default();
        config.openai_api_key = Some("sk-secret-value-123456".to_string());
        let view = view_of(&config);
        assert!(view.has_api_key);
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("sk-secret-value-123456"));
        assert!(view.api_key_hint.is_some());
    }

    #[test]
    fn sin_key_la_vista_no_tiene_pista() {
        let view = view_of(&MurmurConfig::default());
        assert!(!view.has_api_key);
        assert!(view.api_key_hint.is_none());
    }
}
