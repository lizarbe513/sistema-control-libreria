//! Comandos de encargos, fichas de clientes y aviso por WhatsApp (hito 4).

use libreria_core::Error;
use libreria_core::clientes::{self, Cliente, ClienteEntrada, Ficha};
use libreria_core::encargos::{self, Encargo, EncargoEntrada, Estado};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::estado::{Abierta, Estado as EstadoApp, Fase};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<EstadoApp>, f: impl FnOnce(&mut Abierta) -> libreria_core::Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn encargos_listar(estado: State<EstadoApp>, activos: bool) -> Res<Vec<Encargo>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        encargos::listar(&a.lib.conn, activos)
    })
}

#[tauri::command]
pub fn encargo_crear(estado: State<EstadoApp>, entrada: EncargoEntrada) -> Res<Encargo> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        encargos::crear(&mut a.lib.conn, &entrada, &yo)
    })
}

#[tauri::command]
pub fn encargo_estado(estado: State<EstadoApp>, id: i64, nuevo: Estado, devolver_adelanto: Option<bool>) -> Res<Encargo> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        encargos::cambiar_estado(&mut a.lib.conn, id, nuevo, devolver_adelanto.unwrap_or(false), &yo)
    })
}

#[tauri::command]
pub fn encargo_enlazar_libro(estado: State<EstadoApp>, id: i64, libro_id: i64) -> Res<Encargo> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        encargos::enlazar_libro(&a.lib.conn, id, libro_id)
    })
}

/// Encargos que esperan este libro (pendiente/pedido): para la carta de «¡llegó!» al ingresar stock.
#[tauri::command]
pub fn encargos_esperando(estado: State<EstadoApp>, libro_id: i64) -> Res<Vec<Encargo>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        encargos::por_libro(&a.lib.conn, libro_id, &[Estado::Pendiente, Estado::Pedido])
    })
}

/// Encargos ya apartados (llegó/avisado) de este libro: para avisar en Vender.
#[tauri::command]
pub fn encargos_apartados(estado: State<EstadoApp>, libro_id: i64) -> Res<Vec<Encargo>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        encargos::por_libro(&a.lib.conn, libro_id, &[Estado::Llego, Estado::Avisado])
    })
}

#[tauri::command]
pub fn encargos_coincidencias(estado: State<EstadoApp>, titulo: String) -> Res<Vec<Encargo>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        encargos::coincidencias(&a.lib.conn, &titulo)
    })
}

#[tauri::command]
pub fn cliente_guardar(estado: State<EstadoApp>, entrada: ClienteEntrada) -> Res<Cliente> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        clientes::guardar(&a.lib.conn, &entrada)
    })
}

#[tauri::command]
pub fn cliente_ficha(estado: State<EstadoApp>, id: i64) -> Res<Ficha> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        clientes::ficha(&a.lib.conn, id)
    })
}

#[tauri::command]
pub fn whatsapp_plantilla(estado: State<EstadoApp>, texto: Option<String>) -> Res<String> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        match texto {
            Some(t) => encargos::fijar_plantilla(&a.lib.conn, &t, &yo),
            None => encargos::plantilla(&a.lib.conn),
        }
    })
}

/// Arma el mensaje y abre WhatsApp (app o web) con él. Solo abre direcciones `https://wa.me/…`.
/// Si el encargo estaba en «llegó», pasa a «avisado». Devuelve el encargo y la URL abierta.
#[tauri::command]
pub fn encargo_avisar_whatsapp(app: AppHandle, estado: State<EstadoApp>, id: i64) -> Res<(Encargo, String)> {
    let (url, encargo) = con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        let e = encargos::obtener(&a.lib.conn, id)?;
        let texto = encargos::mensaje(&a.lib.conn, id, &a.lib.meta.tienda)?;
        let url = encargos::url_whatsapp(&e.telefono, &texto)?;
        let e = if e.estado == Estado::Llego { encargos::cambiar_estado(&mut a.lib.conn, id, Estado::Avisado, false, &yo)? } else { e };
        Ok((url, e))
    })?;
    app.opener().open_url(&url, None::<&str>).map_err(|e| Error::Validacion(format!("No se pudo abrir WhatsApp: {e}")))?;
    Ok((encargo, url))
}

/// Margen de ganancia (%) para el precio de un libro encargado. Con `pct` lo cambia (solo la Dueña).
#[tauri::command]
pub fn margen_encargos(estado: State<EstadoApp>, pct: Option<i64>) -> Res<i64> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?.clone();
        match pct {
            Some(p) => encargos::fijar_margen(&a.lib.conn, p, &yo),
            None => encargos::margen(&a.lib.conn),
        }
    })
}
