//! App de escritorio (Tauri 2) de la Librería SIGLO XXI.

#[cfg(not(target_os = "android"))]
mod asistente;
#[cfg(not(target_os = "android"))]
mod celular;
#[cfg(not(target_os = "android"))]
mod comandos;
#[cfg(not(target_os = "android"))]
mod encargos;
#[cfg(not(target_os = "android"))]
mod estado;
#[cfg(not(target_os = "android"))]
mod inventario;
mod lan_cliente;
#[cfg(not(target_os = "android"))]
mod llavero;
#[cfg(not(target_os = "android"))]
mod reportes;
#[cfg(not(target_os = "android"))]
mod respaldos;
#[cfg(not(target_os = "android"))]
mod rpc;
#[cfg(not(target_os = "android"))]
mod servidor;
#[cfg(not(target_os = "android"))]
mod ventas;

#[cfg(not(target_os = "android"))]
use std::sync::Mutex;

#[cfg(not(target_os = "android"))]
use estado::{Estado, Fase};
#[cfg(not(target_os = "android"))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(target_os = "android"))]
    escritorio();
    #[cfg(target_os = "android")]
    celular_movil();
}

/// Plugin propio del celular: lee el texto de una foto con ML Kit (`gen/android/.../OcrPlugin.kt`).
#[cfg(target_os = "android")]
fn ocr<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("ocr")
        .setup(|_app, api| {
            api.register_android_plugin("pe.sigloxxi.libreria", "OcrPlugin")?;
            Ok(())
        })
        .build()
}

/// La app del celular: no tiene base de datos; todo va al PC por el WiFi (ver `lan_cliente`).
#[cfg(target_os = "android")]
fn celular_movil() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_barcode_scanner::init())
        .plugin(ocr())
        // las portadas se piden al PC por un protocolo propio, fijando su certificado
        .register_asynchronous_uri_scheme_protocol("lan", |_ctx, request, responder| {
            let ruta = request.uri().path().to_string();
            std::thread::spawn(move || {
                let (estado, tipo, cuerpo) = lan_cliente::portada(&ruta);
                if let Ok(r) = tauri::http::Response::builder()
                    .status(estado)
                    .header("content-type", tipo)
                    .header("access-control-allow-origin", "*")
                    .body(cuerpo)
                {
                    responder.respond(r);
                }
            });
        })
        .invoke_handler(tauri::generate_handler![lan_cliente::lan_pedir, lan_cliente::lan_descubrir])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar la app del celular");
}

/// La app del PC: base cifrada, ventas, encargos y el servidor para los celulares.
#[cfg(not(target_os = "android"))]
fn escritorio() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Estado(Mutex::new(Fase::SinConfigurar)))
        .manage(asistente::Memoria::default())
        .setup(|app| {
            // abre sola la carpeta recordada si el llavero tiene la llave
            let fase = estado::fase_inicial(app.handle());
            *app.state::<Estado>().0.lock().expect("estado") = fase;
            respaldos::iniciar_automatico(app.handle().clone());
            app.manage(celular::Celulares::nuevo(app.handle().clone()));
            celular::iniciar_vigilante(app.handle().clone());
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
            comandos::usuaria_editar,
            comandos::usuaria_quitar,
            comandos::olvidar_llave,
            asistente::asistente_preguntar,
            asistente::asistente_config,
            asistente::asistente_guardar_config,
            asistente::asistente_probar,
            asistente::asistente_confirmar,
            asistente::asistente_descartar,
            inventario::categorias,
            inventario::categoria_crear,
            inventario::categoria_editar,
            inventario::categoria_eliminar,
            inventario::categorias_conteo,
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
            celular::celulares_estado,
            celular::celulares_activar,
            celular::celulares_codigo,
            celular::celulares_desconectar,
            lan_cliente::lan_pedir,
            lan_cliente::lan_descubrir,
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
