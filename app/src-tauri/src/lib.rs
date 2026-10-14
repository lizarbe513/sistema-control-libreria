//! App de escritorio (Tauri 2) de la Librería SIGLO XXI.

mod comandos;
mod encargos;
mod estado;
mod inventario;
mod llavero;
mod reportes;
mod respaldos;
mod ventas;

use std::sync::Mutex;

use estado::{Estado, Fase};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Estado(Mutex::new(Fase::SinConfigurar)))
        .setup(|app| {
            // abre sola la carpeta recordada si el llavero tiene la llave
            let fase = estado::fase_inicial(app.handle());
            *app.state::<Estado>().0.lock().expect("estado") = fase;
            respaldos::iniciar_automatico(app.handle().clone());
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
            ventas::qr_pago_obtener,
            ventas::qr_pago_guardar,
            ventas::qr_pago_quitar,
            encargos::encargos_listar,
            encargos::encargo_crear,
            encargos::encargo_estado,
            encargos::encargo_enlazar_libro,
            encargos::encargos_esperando,
            encargos::encargos_apartados,
            encargos::encargos_coincidencias,
            encargos::cliente_guardar,
            encargos::cliente_ficha,
            encargos::whatsapp_plantilla,
            encargos::encargo_avisar_whatsapp,
            encargos::margen_encargos,
            reportes::reporte,
            reportes::reporte_exportar,
            respaldos::respaldo_estado,
            respaldos::respaldo_config,
            respaldos::respaldo_crear,
            respaldos::respaldo_mostrar,
            respaldos::respaldo_restaurar,
            respaldos::respaldo_restaurar_nuevo,
            respaldos::contrasena_cambiar,
            respaldos::pin_recuperar,
        ])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar la Librería SIGLO XXI")
        .run(|app, evento| {
            // al salir, la base queda completa en libreria.db (sin depender del archivo -wal)
            if let tauri::RunEvent::Exit = evento {
                // el respaldo del día (si todavía no se hizo) y la base completa en libreria.db
                let _ = respaldos::respaldo_si_toca(app);
                if let Ok(fase) = app.state::<Estado>().0.lock()
                    && let Fase::Abierta(a) = &*fase
                {
                    let _ = a.lib.consolidar();
                }
            }
        });
}
