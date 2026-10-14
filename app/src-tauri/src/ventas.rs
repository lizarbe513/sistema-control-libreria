//! Comandos de ventas, tipos de cliente y clientes (hito 3).

use libreria_core::Error;
use libreria_core::clientes::{self, Cliente, ClienteEntrada};
use libreria_core::qr_pago;
use libreria_core::ventas::{self, Resumen, TipoCliente, TipoEntrada, Venta, VentaEntrada};
use tauri::State;

use crate::estado::{Estado, Fase};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut crate::estado::Abierta) -> libreria_core::Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn venta_registrar(estado: State<Estado>, entrada: VentaEntrada) -> Res<Venta> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        let v = ventas::registrar(&mut a.lib.conn, &entrada, &yo)?;
        a.indice = None; // cambió el stock
        Ok(v)
    })
}

#[tauri::command]
pub fn venta_anular(estado: State<Estado>, id: i64, motivo: String) -> Res<Venta> {
    con_abierta(&estado, |a| {
        let yo = a.duena("anular ventas")?.clone();
        let v = ventas::anular(&mut a.lib.conn, id, &motivo, &yo)?;
        a.indice = None;
        Ok(v)
    })
}

#[tauri::command]
pub fn ventas_listar(estado: State<Estado>, desde: String, hasta: String) -> Res<Vec<Venta>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        ventas::listar(&a.lib.conn, &desde, &hasta)
    })
}

#[tauri::command]
pub fn ventas_resumen(estado: State<Estado>, desde: String, hasta: String) -> Res<Resumen> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        ventas::resumen(&a.lib.conn, &desde, &hasta)
    })
}

#[tauri::command]
pub fn tipos_cliente_listar(estado: State<Estado>, todos: Option<bool>) -> Res<Vec<TipoCliente>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        ventas::tipos(&a.lib.conn, !todos.unwrap_or(false))
    })
}

#[tauri::command]
pub fn tipo_cliente_guardar(estado: State<Estado>, entrada: TipoEntrada) -> Res<Vec<TipoCliente>> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        ventas::guardar_tipo(&mut a.lib.conn, &entrada, &yo)
    })
}

#[tauri::command]
pub fn tope_descuento(estado: State<Estado>) -> Res<i64> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        ventas::tope_descuento(&a.lib.conn)
    })
}

#[tauri::command]
pub fn tope_descuento_fijar(estado: State<Estado>, pct: i64) -> Res<i64> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        ventas::fijar_tope(&a.lib.conn, pct, &yo)
    })
}

#[tauri::command]
pub fn clientes_buscar(estado: State<Estado>, texto: String) -> Res<Vec<Cliente>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        clientes::buscar(&a.lib.conn, &texto)
    })
}

#[tauri::command]
pub fn cliente_crear_rapido(estado: State<Estado>, entrada: ClienteEntrada) -> Res<Cliente> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        clientes::crear_rapido(&a.lib.conn, &entrada)
    })
}

/// El QR de cobro del negocio como data-URL (None si todavía no se estableció).
#[tauri::command]
pub fn qr_pago_obtener(estado: State<Estado>) -> Res<Option<String>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        qr_pago::data_url(&a.lib.carpeta)
    })
}

#[tauri::command]
pub fn qr_pago_guardar(estado: State<Estado>, ruta: String) -> Res<Option<String>> {
    con_abierta(&estado, |a| {
        a.duena("cambiar el QR de pago")?;
        let bytes = std::fs::read(&ruta).map_err(|_| Error::Validacion("No se pudo leer ese archivo".into()))?;
        qr_pago::guardar(&a.lib.carpeta, &bytes)?;
        qr_pago::data_url(&a.lib.carpeta)
    })
}

#[tauri::command]
pub fn qr_pago_quitar(estado: State<Estado>) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("cambiar el QR de pago")?;
        qr_pago::quitar(&a.lib.carpeta)
    })
}
