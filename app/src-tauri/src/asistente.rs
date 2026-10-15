//! Asistente de IA (hito 8): conversa con Gemini (o Groq de respaldo) y le da acceso a la tienda solo por herramientas
//! (`libreria_core::asistente`), con los permisos de quien pregunta. Las claves viven en la base cifrada.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use libreria_core::asistente::{self, Contexto, EstadoProveedor};
use libreria_core::ia::{self, OpenAiCompat};
use libreria_core::libros::{self, Libro};
use libreria_core::usuarios::Rol;
use libreria_core::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State};

use crate::estado::{Abierta, Estado, Fase};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut Abierta) -> Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[derive(Debug, Deserialize)]
pub struct MensajeChat {
    /// "usuaria" o "asistente".
    pub rol: String,
    pub texto: String,
}

#[derive(Debug, Serialize)]
pub struct RespuestaAsistente {
    pub texto: String,
    pub proveedor: String,
    /// Los libros citados con `[[libro:ID]]`, listos para mostrar como fichas.
    pub libros: Vec<Libro>,
}

/// Solo en compilaciones de desarrollo: `SIGLO_IA_URL` reemplaza la dirección de los proveedores (servidor de pruebas).
fn ajustar_para_pruebas(mut p: Vec<OpenAiCompat>) -> Vec<OpenAiCompat> {
    if cfg!(debug_assertions)
        && let Ok(url) = std::env::var("SIGLO_IA_URL")
    {
        for x in &mut p {
            x.url_base = url.clone();
        }
    }
    p
}

const HISTORIAL_MAX: usize = 16;

/// Lo que hace falta saber antes de conversar: quién pregunta (con su rol), los proveedores y las instrucciones.
/// Es síncrono a propósito: el celular lo llama dentro de `como_celular`, con su propia sesión.
pub struct Preparado {
    proveedores: Vec<OpenAiCompat>,
    duena: bool,
    sistema: String,
}

pub fn preparar(estado: &State<Estado>, tz_min: i64) -> Res<Preparado> {
    con_abierta(estado, |a| {
        let u = a.usuaria()?;
        let duena = u.rol == Rol::Duena;
        let hoy: String = a.lib.conn.query_row("SELECT date('now', ?1)", [format!("{tz_min} minutes")], |f| f.get(0))?;
        let cats: Vec<(String, String)> = libros::categorias(&a.lib.conn)?.into_iter().map(|c| (c.clave, c.nombre)).collect();
        let sistema = asistente::instrucciones(&a.lib.meta.tienda, &u.nombre, duena, &hoy, &cats);
        Ok(Preparado { proveedores: asistente::proveedores(&a.lib.conn), duena, sistema })
    })
}

/// Una pregunta al asistente. `historial` es la conversación (la última es la pregunta); no se guarda en ningún lado.
pub async fn responder(app: &AppHandle, p: Preparado, historial: Vec<MensajeChat>, tz_min: i64) -> Res<RespuestaAsistente> {
    let estado = app.state::<Estado>();
    let Preparado { proveedores, duena, sistema } = p;
    let proveedores = ajustar_para_pruebas(proveedores);

    let mut mensajes = vec![json!({ "role": "system", "content": sistema })];
    let desde = historial.len().saturating_sub(HISTORIAL_MAX);
    for m in &historial[desde..] {
        let texto = m.texto.chars().take(4000).collect::<String>();
        if texto.trim().is_empty() {
            continue;
        }
        let rol = if m.rol == "asistente" { "assistant" } else { "user" };
        mensajes.push(json!({ "role": rol, "content": texto }));
    }

    // 2) conversar: cada herramienta corre en un hilo aparte con el candado del estado
    let vistos = Arc::new(Mutex::new(HashSet::<i64>::new()));
    let herramientas = asistente::herramientas(duena);
    let r = {
        let vistos = vistos.clone();
        let app = app.clone();
        ia::conversar(&proveedores, mensajes, &herramientas, move |nombre, args| {
            let (app, vistos) = (app.clone(), vistos.clone());
            async move {
                tauri::async_runtime::spawn_blocking(move || ejecutar(&app, &nombre, &args, duena, tz_min, &vistos))
                    .await
                    .unwrap_or_else(|_| json!({ "error": "la herramienta falló" }))
            }
        })
        .await?
    };

    // 3) solo quedan las citas de libros que salieron de las herramientas
    let vistos = vistos.lock().map(|v| v.clone()).unwrap_or_default();
    let (texto, citados) = asistente::depurar_citas(&r.texto, &vistos);
    let libros = con_abierta(&estado, |a| Ok(citados.iter().filter_map(|id| libros::obtener(&a.lib.conn, *id, duena).ok()).collect::<Vec<_>>()))
    .unwrap_or_default();
    Ok(RespuestaAsistente { texto, proveedor: r.proveedor, libros })
}

fn ejecutar(app: &AppHandle, nombre: &str, args: &Value, duena: bool, tz_min: i64, vistos: &Mutex<HashSet<i64>>) -> Value {
    let estado = app.state::<Estado>();
    let r = con_abierta(&estado, |a| {
        a.indice()?;
        let indice = a.indice.as_ref().expect("índice recién construido");
        let ahora: String = a.lib.conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |f| f.get(0))?;
        let ctx = Contexto { conn: &a.lib.conn, indice, duena, ahora, tz_min };
        Ok(asistente::ejecutar(&ctx, nombre, args))
    });
    match r {
        Ok((v, ids)) => {
            if let Ok(mut s) = vistos.lock() {
                s.extend(ids);
            }
            v
        }
        Err(e) => json!({ "error": e.to_string() }),
    }
}

#[tauri::command]
pub async fn asistente_preguntar(app: AppHandle, historial: Vec<MensajeChat>, tz_min: i64) -> Res<RespuestaAsistente> {
    let p = preparar(&app.state::<Estado>(), tz_min)?;
    responder(&app, p, historial, tz_min).await
}

#[tauri::command]
pub fn asistente_config(estado: State<Estado>) -> Res<Vec<EstadoProveedor>> {
    con_abierta(&estado, |a| {
        a.duena("configurar el asistente")?;
        Ok(asistente::estado_config(&a.lib.conn))
    })
}

/// `clave`: `None` la deja como está, `""` la borra.
#[tauri::command]
pub fn asistente_guardar_config(estado: State<Estado>, proveedor: String, clave: Option<String>, modelo: Option<String>) -> Res<Vec<EstadoProveedor>> {
    con_abierta(&estado, |a| {
        a.duena("configurar el asistente")?;
        asistente::guardar_config(&a.lib.conn, &proveedor, clave.as_deref(), modelo.as_deref())?;
        Ok(asistente::estado_config(&a.lib.conn))
    })
}

/// Prueba la clave (la guardada o una nueva sin guardarla) y devuelve los modelos que puede usar.
#[tauri::command]
pub async fn asistente_probar(estado: State<'_, Estado>, proveedor: String, clave: Option<String>) -> Res<Vec<String>> {
    let p = con_abierta(&estado, |a| {
        a.duena("configurar el asistente")?;
        asistente::proveedor(&a.lib.conn, &proveedor, clave.as_deref()).ok_or_else(|| Error::Validacion("Escribe la clave primero".into()))
    })?;
    let p = ajustar_para_pruebas(vec![p]).remove(0);
    let nombre = p.nombre.clone();
    p.modelos().await.map_err(|f| {
        Error::Red(match f {
            ia::Fallo::SinRed => "No hay conexión a internet".to_string(),
            ia::Fallo::Clave => format!("{nombre} no aceptó esa clave: revisa que la copiaste completa"),
            ia::Fallo::Cupo => format!("{nombre} aceptó la clave, pero llegó a su límite por ahora: prueba en un rato"),
            ia::Fallo::Otro(m) => format!("{nombre}: {m}"),
        })
    })
}
