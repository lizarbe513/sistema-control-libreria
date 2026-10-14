//! App de escritorio (Tauri 2) de la Librería SIGLO XXI.

mod comandos;
mod estado;
mod inventario;
mod llavero;
mod ventas;

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
            inventario::categorias,
            inventario::libros_buscar,
            inventario::libro_obtener,
            inventario::libro_guardar,
            inventario::libro_desactivar,
            inventario::stock_ajustar,
            inventario::inventario_resumen,
            inventario::isbn_consultar,
            inventario::libros_buscar_en_linea,
            inventario::portada_desde_url,
            inventario::portada_desde_archivo,
            inventario::portada_quitar,
            inventario::ruta_portadas,
            inventario::tienda_cargar,
            inventario::tienda_guardar,
            inventario::plantillas_listar,
            inventario::plantilla_guardar,
            inventario::plantilla_borrar,
            inventario::plantilla_defecto,
            inventario::permiso_vendedores_editan,
            ventas::venta_registrar,
            ventas::venta_anular,
            ventas::ventas_listar,
            ventas::ventas_resumen,
            ventas::tipos_cliente_listar,
            ventas::tipo_cliente_guardar,
            ventas::tope_descuento,
            ventas::tope_descuento_fijar,
            ventas::clientes_buscar,
            ventas::cliente_crear_rapido,
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
