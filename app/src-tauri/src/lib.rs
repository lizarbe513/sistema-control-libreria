//! App de escritorio (Tauri 2) de la Librería SIGLO XXI.

mod comandos;
mod estado;
mod llavero;

use std::sync::Mutex;

use estado::{Estado, Fase};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Estado(Mutex::new(Fase::SinConfigurar)))
        .setup(|app| {
            // abre sola la carpeta recordada si el llavero tiene la llave
            let fase = estado::fase_inicial(app.handle());
            *app.state::<Estado>().0.lock().expect("estado") = fase;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::estado_inicial,
            comandos::configurar,
            comandos::abrir_carpeta,
            comandos::desbloquear,
            comandos::usuarias,
            comandos::iniciar_sesion,
            comandos::cerrar_sesion,
            comandos::preferencias_guardar,
            comandos::usuaria_crear,
            comandos::usuaria_cambiar_pin,
            comandos::olvidar_llave,
        ])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar la Librería SIGLO XXI")
        .run(|app, evento| {
            // al salir, la base queda completa en libreria.db (sin depender del archivo -wal)
            if let tauri::RunEvent::Exit = evento
                && let Ok(fase) = app.state::<Estado>().0.lock()
                && let Fase::Abierta(a) = &*fase
            {
                let _ = a.lib.consolidar();
            }
        });
}
