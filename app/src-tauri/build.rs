fn main() {
    // «ocr» es un plugin propio de la app del celular (OcrPlugin.kt): su orden necesita permiso como cualquier otra
    tauri_build::try_build(tauri_build::Attributes::new().plugin("ocr", tauri_build::InlinedPlugin::new().commands(&["reconocer"])))
        .expect("no se pudo preparar la compilación de Tauri");
}
