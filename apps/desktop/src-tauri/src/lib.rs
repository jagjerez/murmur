//! Cáscara Tauri de murmur. La integración nativa (hotkeys, audio) llega en Fase 2+.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error al arrancar la app de murmur");
}
