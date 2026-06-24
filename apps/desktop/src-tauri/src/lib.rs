//! Cáscara Tauri de murmur.
//!
//! Fase 3: se registra el plugin `global-shortcut` para los atajos globales. El registro real del
//! atajo lo hace el webview vía `@tauri-apps/plugin-global-shortcut` (ver `src/hotkey`).
//!
//! Fase 11: se exponen los comandos de configuración (`get_config`/`set_config`/`set_openai_key`/
//! `read_openai_key`, ver `src/config.rs`) que el `ConfigClient` del webview invoca. Persisten en
//! `~/.murmur/config.json` (mismo archivo que el CLI de F1); la API key nunca viaja en claro.
//!
//! La build nativa de Tauri queda FUERA del pipeline de CI; este código se mantiene coherente
//! pero no se compila ahí.

mod config;

#[cfg(feature = "offline")]
mod offline_cmd;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // El plugin global-shortcut solo existe en escritorio.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    #[cfg(feature = "offline")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        config::get_config,
        config::set_config,
        config::set_openai_key,
        config::read_openai_key,
        offline_cmd::transcribe,
        offline_cmd::tts,
    ]);
    #[cfg(not(feature = "offline"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        config::get_config,
        config::set_config,
        config::set_openai_key,
        config::read_openai_key,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error al arrancar la app de murmur");
}
