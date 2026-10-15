//! Asistente de IA: la «bibliotecaria virtual». Conversa con Gemini (o Groq de respaldo) y le da acceso a la tienda solo
//! por herramientas (`libreria_core::asistente`), con los permisos de quien pregunta. Puede buscar libros en internet y
//! **proponer** cambios (`libreria_core::agente`): una propuesta queda guardada aquí, en memoria, y solo se ejecuta
//! cuando la persona la confirma en su tarjeta, con los mismos comandos (y permisos) de siempre.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use libreria_core::agente::{self, Accion, Permisos, Propuesta};
use libreria_core::asistente::{self, Contexto, EstadoProveedor, Vistos};
use libreria_core::clientes::ClienteEntrada;
use libreria_core::encargos::EncargoEntrada;
use libreria_core::ia::{self, OpenAiCompat};
use libreria_core::isbn::{self, ResultadoLinea};
use libreria_core::libros::{self, Libro, LibroEntrada};
use libreria_core::usuarios::{Rol, Usuaria};
use libreria_core::{Error, Result, portadas};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State};

use crate::estado::{Abierta, Estado, Fase, como_celular, vendedores_editan};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut Abierta) -> Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

// ── memoria del asistente: resultados de internet y propuestas pendientes (no se escribe a disco) ──

const VIGENCIA: Duration = Duration::from_secs(30 * 60);

#[derive(Default)]
pub struct Memoria(Mutex<Interna>);

#[derive(Default)]
struct Interna {
    contador: u64,
    web: HashMap<String, (ResultadoLinea, Instant)>,
    /// id → (quién la pidió, la propuesta, cuándo).
    propuestas: HashMap<String, (i64, Propuesta, Instant)>,
}

impl Memoria {
    fn guardar_web(&self, r: ResultadoLinea) -> String {
        let mut m = self.0.lock().unwrap_or_else(|e| e.into_inner());
        m.web.retain(|_, (_, t)| t.elapsed() < VIGENCIA * 4);
        m.contador += 1;
        let id = format!("w{}", m.contador);
        m.web.insert(id.clone(), (r, Instant::now()));
        id
    }
    fn web(&self, id: &str) -> Option<ResultadoLinea> {
        self.0.lock().ok()?.web.get(id).map(|(r, _)| r.clone())
    }
    fn guardar_propuesta(&self, usuaria: i64, p: Propuesta) -> String {
        let mut m = self.0.lock().unwrap_or_else(|e| e.into_inner());
        m.propuestas.retain(|_, (_, _, t)| t.elapsed() < VIGENCIA);
        m.contador += 1;
        let id = format!("p{}", m.contador);
        m.propuestas.insert(id.clone(), (usuaria, p, Instant::now()));
        id
    }
    /// La propuesta, si es de esa persona y sigue vigente.
    fn propuesta(&self, id: &str, usuaria: i64) -> Res<Propuesta> {
        let m = self.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
        match m.propuestas.get(id) {
            Some((u, p, t)) if *u == usuaria && t.elapsed() < VIGENCIA => Ok(p.clone()),
            Some((u, _, _)) if *u != usuaria => Err(Error::Permiso("confirmar una propuesta hecha para otra persona".into())),
            _ => Err(Error::Validacion("Esta propuesta ya se usó o venció: pídesela de nuevo a la asistente".into())),
        }
    }
    fn quitar(&self, id: &str) {
        if let Ok(mut m) = self.0.lock() {
            m.propuestas.remove(id);
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MensajeChat {
    /// "usuaria" o "asistente".
    pub rol: String,
    pub texto: String,
}

#[derive(Debug, Serialize)]
pub struct Externo {
    pub referencia: String,
    pub resultado: ResultadoLinea,
}

#[derive(Debug, Serialize)]
pub struct AccionVista {
    pub id: String,
    pub propuesta: Propuesta,
    /// El libro implicado (si hay), para mostrarlo en la tarjeta.
    pub libro: Option<Libro>,
}

#[derive(Debug, Serialize)]
pub struct RespuestaAsistente {
    pub texto: String,
    pub proveedor: String,
    /// Los libros citados con `[[libro:ID]]`, listos para mostrar como fichas.
    pub libros: Vec<Libro>,
    /// Los resultados de internet citados con `[[web:REF]]`.
    pub externos: Vec<Externo>,
    /// Las propuestas de esta respuesta (tarjetas para confirmar).
    pub acciones: Vec<AccionVista>,
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
    usuaria: i64,
    permisos: Permisos,
    sistema: String,
}

pub fn preparar(estado: &State<Estado>, tz_min: i64) -> Res<Preparado> {
    con_abierta(estado, |a| {
        let u = a.usuaria()?;
        let duena = u.rol == Rol::Duena;
        let permisos = Permisos { duena, edita_libros: duena || vendedores_editan(&a.lib.conn) };
        let hoy: String = a.lib.conn.query_row("SELECT date('now', ?1)", [format!("{tz_min} minutes")], |f| f.get(0))?;
        let cats: Vec<(String, String)> = libros::categorias(&a.lib.conn)?.into_iter().map(|c| (c.clave, c.nombre)).collect();
        let sistema = asistente::instrucciones(&a.lib.meta.tienda, &u.nombre, duena, &hoy, &cats);
        Ok(Preparado { proveedores: asistente::proveedores(&a.lib.conn), usuaria: u.id, permisos, sistema })
    })
}

/// Una pregunta al asistente. `historial` es la conversación (la última es la pregunta); no se guarda en ningún lado.
pub async fn responder(app: &AppHandle, p: Preparado, historial: Vec<MensajeChat>, tz_min: i64) -> Res<RespuestaAsistente> {
    let estado = app.state::<Estado>();
    let Preparado { proveedores, usuaria, permisos, sistema } = p;
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

    // conversar: las herramientas de la base corren en un hilo aparte con el candado; la de internet, sin él
    let vistos = Arc::new(Mutex::new(Vistos::default()));
    let herramientas = asistente::todas(permisos);
    let r = {
        let vistos = vistos.clone();
        let app = app.clone();
        ia::conversar(&proveedores, mensajes, &herramientas, move |nombre, args| {
            let (app, vistos) = (app.clone(), vistos.clone());
            async move {
                if nombre == "buscar_en_internet" {
                    return buscar_en_internet(&app, &args, &vistos).await;
                }
                tauri::async_runtime::spawn_blocking(move || ejecutar(&app, &nombre, &args, usuaria, permisos, tz_min, &vistos))
                    .await
                    .unwrap_or_else(|_| json!({ "error": "la herramienta falló" }))
            }
        })
        .await?
    };

    // solo quedan las citas que salieron de las herramientas
    let vistos = vistos.lock().map(|v| v.clone()).unwrap_or_default();
    let (texto, citas) = asistente::depurar(&r.texto, &vistos);
    let memoria = app.state::<Memoria>();
    let externos = citas.web.iter().filter_map(|w| memoria.web(w).map(|resultado| Externo { referencia: w.clone(), resultado })).collect();
    // las propuestas van todas (aunque la IA olvide citarlas): primero las citadas
    let mut ids_acciones = citas.acciones.clone();
    let mut resto: Vec<&String> = vistos.acciones.iter().filter(|a| !ids_acciones.contains(a)).collect();
    resto.sort_by_key(|a| a[1..].parse::<u64>().unwrap_or(0));
    ids_acciones.extend(resto.into_iter().cloned());
    let (libros, acciones) = con_abierta(&estado, |a| {
        let ver = permisos.duena;
        let libros = citas.libros.iter().filter_map(|id| libros::obtener(&a.lib.conn, *id, ver).ok()).collect::<Vec<_>>();
        let acciones = ids_acciones
            .iter()
            .filter_map(|id| memoria.propuesta(id, usuaria).ok().map(|p| (id, p)))
            .map(|(id, p)| AccionVista { id: id.clone(), libro: p.libro_id.and_then(|l| libros::obtener(&a.lib.conn, l, ver).ok()), propuesta: p })
            .collect::<Vec<_>>();
        Ok((libros, acciones))
    })
    .unwrap_or_default();
    Ok(RespuestaAsistente { texto, proveedor: r.proveedor, libros, externos, acciones })
}

/// Busca en internet (sin el candado) y guarda cada resultado con su referencia `wN`.
async fn buscar_en_internet(app: &AppHandle, args: &Value, vistos: &Mutex<Vistos>) -> Value {
    let titulo = args["titulo"].as_str().unwrap_or_default().trim().to_string();
    let autor = args["autor"].as_str().unwrap_or_default().trim().to_string();
    if titulo.len() < 2 && autor.len() < 2 {
        return json!({ "error": "Escribe al menos el título" });
    }
    let estado = app.state::<Estado>();
    let clave = con_abierta(&estado, |a| Ok(a.lib.conn.query_row("SELECT valor FROM config WHERE clave = 'clave_google_books'", [], |f| f.get::<_, String>(0)).ok()))
        .ok()
        .flatten();
    let lista = match isbn::buscar_en_linea(&titulo, &autor, clave.as_deref()).await {
        Ok(l) => l,
        Err(e) => return json!({ "error": e.to_string() }),
    };
    let memoria = app.state::<Memoria>();
    let mut salida = Vec::new();
    for r in lista.into_iter().take(5) {
        let en_tienda = r.isbn.as_deref().and_then(|i| con_abierta(&estado, |a| Ok(libros::por_codigo(&a.lib.conn, i, false)?.map(|l| l.id))).ok().flatten());
        let referencia = memoria.guardar_web(r.clone());
        salida.push(asistente::resultado_web(&referencia, &r, en_tienda));
        if let Ok(mut v) = vistos.lock() {
            v.web.insert(referencia);
            if let Some(id) = en_tienda {
                v.libros.insert(id);
            }
        }
    }
    json!({ "resultados": salida, "total": salida.len() })
}

fn ejecutar(app: &AppHandle, nombre: &str, args: &Value, usuaria: i64, permisos: Permisos, tz_min: i64, vistos: &Mutex<Vistos>) -> Value {
    let estado = app.state::<Estado>();
    if agente::es_propuesta(nombre) {
        let memoria = app.state::<Memoria>();
        let r = con_abierta(&estado, |a| Ok(agente::proponer(&a.lib.conn, permisos, nombre, args, &|w| memoria.web(w))));
        return match r {
            Ok(Ok(p)) => {
                let id = memoria.guardar_propuesta(usuaria, p.clone());
                if let Ok(mut v) = vistos.lock() {
                    v.acciones.insert(id.clone());
                    v.libros.extend(p.libro_id);
                }
                agente::para_la_ia(&id, &p)
            }
            Ok(Err(e)) => json!({ "error": e }),
            Err(e) => json!({ "error": e.to_string() }),
        };
    }
    let r = con_abierta(&estado, |a| {
        a.indice()?;
        let indice = a.indice.as_ref().expect("índice recién construido");
        let ahora: String = a.lib.conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |f| f.get(0))?;
        let ctx = Contexto { conn: &a.lib.conn, indice, duena: permisos.duena, ahora, tz_min };
        Ok(asistente::ejecutar(&ctx, nombre, args))
    });
    match r {
        Ok((v, ids)) => {
            if let Ok(mut s) = vistos.lock() {
                s.libros.extend(ids);
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

// ── confirmar o descartar una propuesta ──

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Extra {
    pub cliente_id: Option<i64>,
    pub cliente_nuevo: Option<ClienteNuevo>,
    pub precio_soles: Option<f64>,
    pub stock: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct ClienteNuevo {
    pub nombre: String,
    pub telefono: String,
}

#[derive(Debug, Serialize)]
pub struct Confirmado {
    /// Lo que se hizo (sin datos de clientes: esta nota queda en la conversación).
    pub mensaje: String,
    /// Adónde llevar para revisarlo: `encargo:12`, `libro:7`.
    pub ir: Option<String>,
}

fn usuaria_actual(app: &AppHandle) -> Res<Usuaria> {
    con_abierta(&app.state::<Estado>(), |a| a.usuaria())
}

/// Ejecuta la propuesta con los comandos de siempre (mismos permisos). Devuelve además la portada por descargar.
fn confirmar_sync(app: &AppHandle, id: &str, extra: Extra) -> Res<(Confirmado, Option<(i64, String)>)> {
    let yo = usuaria_actual(app)?;
    let memoria = app.state::<Memoria>();
    let p = memoria.propuesta(id, yo.id)?;
    let estado = app.state::<Estado>();
    let r = match &p.accion {
        Accion::Encargo { titulo, autor, libro_id, portada_url, cantidad, notas } => {
            let (cliente_id, cliente) = match (extra.cliente_id, extra.cliente_nuevo) {
                (Some(c), _) => (Some(c), None),
                (None, Some(n)) if !n.nombre.trim().is_empty() => {
                    (None, Some(ClienteEntrada { nombre: n.nombre, telefono: n.telefono, ..Default::default() }))
                }
                _ => return Err(Error::Validacion("Elige un cliente registrado o escribe el nombre del cliente nuevo".into())),
            };
            let e = crate::encargos::encargo_crear(
                estado.clone(),
                EncargoEntrada {
                    cliente_id,
                    cliente,
                    libro_id: *libro_id,
                    titulo: titulo.clone(),
                    autor: autor.clone(),
                    cantidad: Some(*cantidad),
                    notas: notas.clone(),
                    portada_url: portada_url.clone(),
                    ..Default::default()
                },
            )?;
            (Confirmado { mensaje: format!("Confirmado: se creó el encargo de «{}» × {}.", e.titulo, e.cantidad), ir: Some(format!("encargo:{}", e.id)) }, None)
        }
        Accion::EstadoEncargo { encargo_id, estado: nuevo } => {
            let e = crate::encargos::encargo_estado(estado.clone(), *encargo_id, *nuevo, None)?;
            (Confirmado { mensaje: format!("Confirmado: el encargo de «{}» pasó a «{}».", e.titulo, e.estado.texto()), ir: Some(format!("encargo:{}", e.id)) }, None)
        }
        Accion::Stock { libro_id, delta, motivo, nota } => {
            let l = crate::inventario::stock_ajustar(estado.clone(), *libro_id, *delta, motivo.clone(), Some(nota.clone()))?;
            (Confirmado { mensaje: format!("Confirmado: «{}» ahora tiene {} en stock.", l.titulo, l.stock), ir: Some(format!("libro:{}", l.id)) }, None)
        }
        Accion::EditarLibro { libro_id, cambios } => {
            let actual = con_abierta(&estado, |a| libros::obtener(&a.lib.conn, *libro_id, true))?;
            let l = crate::inventario::libro_guardar(estado.clone(), agente::entrada_con_cambios(&actual, cambios))?;
            (Confirmado { mensaje: format!("Confirmado: se guardaron los cambios de «{}».", l.titulo), ir: Some(format!("libro:{}", l.id)) }, None)
        }
        Accion::LibroNuevo { titulo, autor, editorial, anio, isbn, categoria, precio_cent, stock, portada_url } => {
            let precio = match extra.precio_soles {
                Some(s) if s > 0.0 => (s * 100.0).round() as i64,
                Some(_) => return Err(Error::Validacion("Escribe el precio del libro".into())),
                None => precio_cent.filter(|p| *p > 0).ok_or_else(|| Error::Validacion("Escribe el precio del libro".into()))?,
            };
            let l = crate::inventario::libro_guardar(
                estado.clone(),
                LibroEntrada {
                    isbn: isbn.clone(),
                    titulo: titulo.clone(),
                    autor: autor.clone(),
                    editorial: editorial.clone(),
                    anio: *anio,
                    categoria: categoria.clone(),
                    precio_cent: precio,
                    stock: extra.stock.unwrap_or(*stock).clamp(0, 9999),
                    ..Default::default()
                },
            )?;
            let portada = portada_url.clone().map(|u| (l.id, u));
            (Confirmado { mensaje: format!("Confirmado: «{}» ya está en el inventario.", l.titulo), ir: Some(format!("libro:{}", l.id)) }, portada)
        }
    };
    memoria.quitar(id); // se usa una sola vez
    Ok(r)
}

/// Confirma una propuesta. `celular`: la sesión del celular si la orden viene de uno (`rpc.rs`).
pub async fn confirmar(app: &AppHandle, id: String, extra: Extra, celular: Option<Option<Usuaria>>) -> Res<Confirmado> {
    let (a1, cel1) = (app.clone(), celular.clone());
    let (mut hecho, portada) = tauri::async_runtime::spawn_blocking(move || match cel1 {
        Some(u) => como_celular(u, || confirmar_sync(&a1, &id, extra)),
        None => confirmar_sync(&a1, &id, extra),
    })
    .await
    .map_err(|_| Error::Validacion("La orden se interrumpió".into()))??;
    // la portada de internet va después: si falla, el libro igual quedó guardado
    if let Some((libro, url)) = portada {
        let ok = match portadas::descargar(&url).await {
            Ok(bytes) => {
                let a2 = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let guardar = || crate::inventario::guardar_portada(&a2.state::<Estado>(), libro, &bytes);
                    match celular {
                        Some(u) => como_celular(u, guardar),
                        None => guardar(),
                    }
                })
                .await
                .is_ok_and(|r| r.is_ok())
            }
            Err(_) => false,
        };
        if !ok {
            hecho.mensaje.push_str(" (La portada de internet no se pudo descargar.)");
        }
    }
    Ok(hecho)
}

/// Descarta una propuesta (solo quien la pidió).
pub fn descartar(app: &AppHandle, id: &str) -> Res<()> {
    let yo = usuaria_actual(app)?;
    let memoria = app.state::<Memoria>();
    memoria.propuesta(id, yo.id)?;
    memoria.quitar(id);
    Ok(())
}

#[tauri::command]
pub async fn asistente_confirmar(app: AppHandle, id: String, extra: Option<Extra>) -> Res<Confirmado> {
    confirmar(&app, id, extra.unwrap_or_default(), None).await
}

#[tauri::command]
pub fn asistente_descartar(app: AppHandle, id: String) -> Res<()> {
    descartar(&app, &id)
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
