//! Cáscara Tauri de murmur.
//!
//! Fase 3: se registra el plugin `global-shortcut` para los atajos globales. El registro real del
//! atajo lo hace el webview vía `@tauri-apps/plugin-global-shortcut` (ver `src/hotkey`). La build
//! nativa de Tauri queda FUERA del pipeline de CI; este código se mantiene coherente pero no se
//! compila ahí.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // El plugin global-shortcut solo existe en escritorio.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error al arrancar la app de murmur");
}
