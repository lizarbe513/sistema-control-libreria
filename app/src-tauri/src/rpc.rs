//! Las órdenes que el celular le manda al PC: son **las mismas funciones** que llama la interfaz del PC, pero actuando
//! con la sesión del celular (ver `estado::como_celular`). Así los permisos y las reglas son idénticos en los dos lados.
//! Quedan fuera las que solo tienen sentido en el PC: configurar, abrir carpetas, respaldos, exportar, editor de la tienda.

use libreria_core::{Error, isbn, portadas, usuarios::Usuaria};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::estado::{Estado, como_celular};
use crate::{comandos, encargos, inventario, reportes, ventas};

type Res<T> = std::result::Result<T, Error>;

fn arg_err(e: serde_json::Error) -> Error {
    Error::Validacion(format!("Datos de la orden no válidos: {e}"))
}

fn salida<T: Serialize>(r: Res<T>) -> Res<Value> {
    r.and_then(|v| serde_json::to_value(v).map_err(arg_err))
}

/// Interpreta los argumentos (camelCase, como los manda la interfaz) y llama a la función.
macro_rules! tabla {
    ($app:expr, $cmd:expr, $args:expr, { $( $nom:literal => $f:path { $($campo:ident : $t:ty),* } ),* $(,)? }) => {
        match $cmd {
            $( $nom => {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                #[allow(dead_code)]
                struct A { $( $campo: $t ),* }
                #[allow(unused_variables)]
                let a: A = serde_json::from_value($args).map_err(arg_err)?;
                salida($f($app.state::<Estado>() $(, a.$campo)*))
            } )*
            otro => Err(Error::Validacion(format!("Orden desconocida: {otro}"))),
        }
    };
}

/// Órdenes síncronas, en el hilo actual (donde ya está puesta la sesión del celular).
fn sincronas(app: &AppHandle, cmd: &str, args: Value) -> Res<Value> {
    use libreria_core::busqueda::Filtros;
    use libreria_core::clientes::ClienteEntrada;
    use libreria_core::encargos::{EncargoEntrada, Estado as EstadoEncargo};
    use libreria_core::libros::LibroEntrada;
    use libreria_core::reportes::Consulta;
    use libreria_core::usuarios::Rol;
    use libreria_core::ventas::{TipoEntrada, VentaEntrada};

    tabla!(app, cmd, args, {
        "usuarias" => comandos::usuarias {},
        "preferencias_guardar" => comandos::preferencias_guardar { cambios: Value },
        "usuaria_crear" => comandos::usuaria_crear { nombre: String, rol: Rol, pin: String },
        "usuaria_cambiar_pin" => comandos::usuaria_cambiar_pin { id: i64, pin: String },
        "usuaria_editar" => comandos::usuaria_editar { id: i64, nombre: String, rol: Rol },
        "usuaria_quitar" => comandos::usuaria_quitar { id: i64 },
        // inventario
        "categorias" => inventario::categorias {},
        "categoria_crear" => inventario::categoria_crear { nombre: String },
        "categoria_editar" => inventario::categoria_editar { clave: String, nombre: String, color: String },
        "categoria_eliminar" => inventario::categoria_eliminar { clave: String },
        "categorias_conteo" => inventario::categorias_conteo {},
        "libros_buscar" => inventario::libros_buscar { consulta: String, filtros: Option<Filtros> },
        "libro_obtener" => inventario::libro_obtener { id: i64 },
        "libro_guardar" => inventario::libro_guardar { entrada: LibroEntrada },
        "libro_desactivar" => inventario::libro_desactivar { id: i64 },
        "stock_ajustar" => inventario::stock_ajustar { id: i64, delta: i64, motivo: String, nota: Option<String> },
        "inventario_resumen" => inventario::inventario_resumen {},
        "portada_quitar" => inventario::portada_quitar { id: i64 },
        "tienda_cargar" => inventario::tienda_cargar {},
        "plantillas_listar" => inventario::plantillas_listar {},
        "permiso_vendedores_editan" => inventario::permiso_vendedores_editan { valor: Option<bool> },
        // ventas
        "venta_registrar" => ventas::venta_registrar { entrada: VentaEntrada },
        "venta_anular" => ventas::venta_anular { id: i64, motivo: String },
        "ventas_listar" => ventas::ventas_listar { desde: String, hasta: String },
        "ventas_resumen" => ventas::ventas_resumen { desde: String, hasta: String },
        "tipos_cliente_listar" => ventas::tipos_cliente_listar { todos: Option<bool> },
        "tipo_cliente_guardar" => ventas::tipo_cliente_guardar { entrada: TipoEntrada },
        "tope_descuento" => ventas::tope_descuento {},
        "tope_descuento_fijar" => ventas::tope_descuento_fijar { pct: i64 },
        "clientes_buscar" => ventas::clientes_buscar { texto: String },
        "cliente_crear_rapido" => ventas::cliente_crear_rapido { entrada: ClienteEntrada },
        "qr_pago_obtener" => ventas::qr_pago_obtener {},
        // encargos y clientes
        "encargos_listar" => encargos::encargos_listar { activos: bool },
        "encargo_crear" => encargos::encargo_crear { entrada: EncargoEntrada },
        "encargo_estado" => encargos::encargo_estado { id: i64, nuevo: EstadoEncargo, devolver_adelanto: Option<bool> },
        "encargo_enlazar_libro" => encargos::encargo_enlazar_libro { id: i64, libro_id: i64 },
        "encargos_esperando" => encargos::encargos_esperando { libro_id: i64 },
        "encargos_apartados" => encargos::encargos_apartados { libro_id: i64 },
        "encargos_coincidencias" => encargos::encargos_coincidencias { titulo: String },
        "cliente_guardar" => encargos::cliente_guardar { entrada: ClienteEntrada },
        "cliente_ficha" => encargos::cliente_ficha { id: i64 },
        "whatsapp_plantilla" => encargos::whatsapp_plantilla { texto: Option<String> },
        "margen_encargos" => encargos::margen_encargos { pct: Option<i64> },
        // reportes (solo la Dueña: lo comprueba la propia orden)
        "reporte" => reportes::reporte { consulta: Consulta },
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Id {
    id: i64,
}

/// Ejecuta una orden del celular. `usuaria` es la sesión de ese celular (None si todavía no entró con su PIN).
pub async fn ejecutar(app: &AppHandle, cmd: &str, args: Value, usuaria: Option<Usuaria>) -> Res<Value> {
    match cmd {
        // las que van por internet no pueden tener el hilo bloqueado con el candado
        "isbn_consultar" => {
            #[derive(serde::Deserialize)]
            struct A {
                isbn: String,
            }
            let a: A = serde_json::from_value(args).map_err(arg_err)?;
            salida(isbn::consultar(&a.isbn).await)
        }
        "libros_buscar_en_linea" => {
            #[derive(serde::Deserialize)]
            struct A {
                titulo: String,
                autor: String,
            }
            let a: A = serde_json::from_value(args).map_err(arg_err)?;
            salida(inventario::libros_buscar_en_linea(app.state::<Estado>(), a.titulo, a.autor).await)
        }
        "portada_desde_url" => {
            #[derive(serde::Deserialize)]
            struct A {
                id: i64,
                url: String,
            }
            let a: A = serde_json::from_value(args).map_err(arg_err)?;
            let bytes = portadas::descargar(&a.url).await?;
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                como_celular(usuaria, || salida(inventario::guardar_portada(&app.state::<Estado>(), a.id, &bytes)))
            })
            .await
            .map_err(|_| Error::Validacion("La orden se interrumpió".into()))?
        }
        // WhatsApp: el PC no abre nada; devuelve la dirección y el celular la abre
        "encargo_avisar_whatsapp" => {
            let a: Id = serde_json::from_value(args).map_err(arg_err)?;
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                como_celular(usuaria, || salida(encargos::avisar_preparar(&app.state::<Estado>(), a.id)))
            })
            .await
            .map_err(|_| Error::Validacion("La orden se interrumpió".into()))?
        }
        _ => {
            let (app, cmd) = (app.clone(), cmd.to_string());
            tauri::async_runtime::spawn_blocking(move || como_celular(usuaria, || sincronas(&app, &cmd, args)))
                .await
                .map_err(|_| Error::Validacion("La orden se interrumpió".into()))?
        }
    }
}
