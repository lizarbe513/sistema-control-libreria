fn main() {
    // «ocr» y «actualizar» son plugins propios de la app del celular (OcrPlugin.kt, ActualizarPlugin.kt): su orden necesita permiso como cualquier otra
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin("ocr", tauri_build::InlinedPlugin::new().commands(&["reconocer"]))
            .plugin("actualizar", tauri_build::InlinedPlugin::new().commands(&["revisar", "instalar"])),
    )
        .expect("no se pudo preparar la compilación de Tauri");
}
