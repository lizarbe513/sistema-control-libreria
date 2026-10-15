//! Servidor local para los celulares: HTTPS con certificado propio (se guarda cifrado en la base), un token por
//! dispositivo, sesión por celular y las mismas órdenes que usa el PC (`rpc`). Solo escucha en la red local.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{Path, Query, State as EstadoAxum};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use libreria_core::Error;
use libreria_core::celulares::{self, Dispositivo};
use libreria_core::usuarios::Usuaria;
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_rustls::TlsAcceptor;
use tower_http::cors::CorsLayer;

use crate::estado::{Estado, Fase};
use crate::rpc;

type Res<T> = std::result::Result<T, Error>;

const CODIGO_VIGENCIA: Duration = Duration::from_secs(300);
const SESION_INACTIVA: Duration = Duration::from_secs(12 * 3600);
const ALFABETO: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// Lo que comparten el servidor y los comandos del PC.
pub struct Compartido {
    pub app: AppHandle,
    codigos: Mutex<HashMap<String, Instant>>,
    fallos_codigo: Mutex<(u32, Option<Instant>)>,
    sesiones: Mutex<HashMap<i64, (Usuaria, Instant)>>,
    pub huella: Mutex<String>,
}

impl Compartido {
    pub fn nuevo(app: AppHandle) -> Self {
        Compartido {
            app,
            codigos: Mutex::default(),
            fallos_codigo: Mutex::new((0, None)),
            sesiones: Mutex::default(),
            huella: Mutex::default(),
        }
    }

    /// Un código de un solo uso para vincular un celular (vale 5 minutos).
    pub fn nuevo_codigo(&self) -> Res<(String, u64)> {
        let mut b = [0u8; 8];
        getrandom_fill(&mut b)?;
        let codigo: String = b.iter().map(|x| ALFABETO[*x as usize % ALFABETO.len()] as char).collect();
        let mut m = self.codigos.lock().map_err(|_| interno())?;
        m.retain(|_, t| t.elapsed() < CODIGO_VIGENCIA);
        m.insert(codigo.clone(), Instant::now());
        Ok((codigo, CODIGO_VIGENCIA.as_secs()))
    }

    fn usar_codigo(&self, codigo: &str) -> Res<()> {
        {
            let mut f = self.fallos_codigo.lock().map_err(|_| interno())?;
            if let Some(hasta) = f.1 {
                if Instant::now() < hasta {
                    return Err(Error::Bloqueado((hasta - Instant::now()).as_secs() + 1));
                }
                *f = (0, None);
            }
        }
        let ok = {
            let mut m = self.codigos.lock().map_err(|_| interno())?;
            m.retain(|_, t| t.elapsed() < CODIGO_VIGENCIA);
            m.remove(&codigo.trim().to_uppercase()).is_some()
        };
        let mut f = self.fallos_codigo.lock().map_err(|_| interno())?;
        if ok {
            *f = (0, None);
            Ok(())
        } else {
            f.0 += 1;
            if f.0 >= 5 {
                f.1 = Some(Instant::now() + Duration::from_secs(30));
            }
            Err(Error::Validacion("El código no es válido o ya venció: pide uno nuevo en el PC".into()))
        }
    }

    fn sesion(&self, dispositivo: i64) -> Option<Usuaria> {
        let mut m = self.sesiones.lock().ok()?;
        match m.get_mut(&dispositivo) {
            Some((u, t)) if t.elapsed() < SESION_INACTIVA => {
                *t = Instant::now();
                Some(u.clone())
            }
            Some(_) => {
                m.remove(&dispositivo);
                None
            }
            None => None,
        }
    }

    pub fn cerrar_sesiones_de(&self, dispositivo: i64) {
        if let Ok(mut m) = self.sesiones.lock() {
            m.remove(&dispositivo);
        }
    }
}

fn interno() -> Error {
    Error::Validacion("Estado interno dañado".into())
}

fn getrandom_fill(b: &mut [u8]) -> Res<()> {
    libreria_core::celulares::nuevo_token().map(|t| {
        let bytes = hex::decode(t).unwrap_or_default();
        for (d, s) in b.iter_mut().zip(bytes) {
            *d = s;
        }
    })
}

/// Ejecuta `f` con la librería abierta (o error si todavía no lo está).
fn con_abierta<T>(app: &AppHandle, f: impl FnOnce(&mut crate::estado::Abierta) -> Res<T>) -> Res<T> {
    let estado = app.state::<Estado>();
    let mut fase = estado.0.lock().map_err(|_| interno())?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("El PC todavía no tiene la librería abierta".into())),
    }
}

async fn bloqueando<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| Error::Validacion("La orden se interrumpió".into()))?
}

fn error_json(e: Error) -> Response {
    let codigo = match &e {
        Error::Permiso(_) => StatusCode::FORBIDDEN,
        Error::Bloqueado(_) => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::BAD_REQUEST,
    };
    (codigo, Json(json!({ "error": e.to_string() }))).into_response()
}

fn no_autorizado() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Este celular ya no está vinculado: vuélvelo a vincular desde el PC", "vincular": true })),
    )
        .into_response()
}

fn token_de(h: &HeaderMap, t: Option<&str>) -> Option<String> {
    let de_cabecera =
        h.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")).map(str::to_string);
    de_cabecera.or_else(|| t.map(str::to_string))
}

async fn autenticar(comp: &Arc<Compartido>, token: Option<String>) -> Option<Dispositivo> {
    let token = token?;
    let app = comp.app.clone();
    bloqueando(move || con_abierta(&app, |a| celulares::verificar(&a.lib.conn, &token))).await.ok().flatten()
}

// ── rutas ─────────────────────────────────────────────────────────────────────

async fn ping(EstadoAxum(comp): EstadoAxum<Arc<Compartido>>) -> Response {
    let app = comp.app.clone();
    let tienda = bloqueando(move || con_abierta(&app, |a| Ok(a.lib.meta.tienda.clone()))).await.ok();
    let huella = comp.huella.lock().map(|h| h.clone()).unwrap_or_default();
    // la versión del PC: la app del celular avisa si ella es más vieja (deben hablar el mismo idioma)
    let version = comp.app.package_info().version.to_string();
    Json(json!({ "ok": tienda.is_some(), "tienda": tienda, "huella": huella, "version": version })).into_response()
}

#[derive(Deserialize)]
struct Vinculo {
    codigo: String,
    nombre: String,
}

async fn vincular(EstadoAxum(comp): EstadoAxum<Arc<Compartido>>, Json(v): Json<Vinculo>) -> Response {
    if let Err(e) = comp.usar_codigo(&v.codigo) {
        return error_json(e);
    }
    let app = comp.app.clone();
    let r = bloqueando(move || {
        con_abierta(&app, |a| celulares::vincular(&a.lib.conn, &v.nombre).map(|(d, t)| (d, t, a.lib.meta.tienda.clone())))
    })
    .await;
    match r {
        Ok((d, token, tienda)) => Json(json!({ "token": token, "tienda": tienda, "dispositivo": d })).into_response(),
        Err(e) => error_json(e),
    }
}

#[derive(Deserialize)]
struct ConToken {
    t: Option<String>,
}

async fn rpc_ruta(
    EstadoAxum(comp): EstadoAxum<Arc<Compartido>>,
    Path(cmd): Path<String>,
    headers: HeaderMap,
    Query(q): Query<ConToken>,
    cuerpo: Option<Json<Value>>,
) -> Response {
    let Some(dispositivo) = autenticar(&comp, token_de(&headers, q.t.as_deref())).await else {
        return no_autorizado();
    };
    let args = cuerpo.map(|j| j.0).unwrap_or_else(|| json!({}));
    let r = match cmd.as_str() {
        "estado_inicial" => estado_inicial(&comp, dispositivo.id).await,
        "iniciar_sesion" => iniciar_sesion(&comp, dispositivo.id, args).await,
        "cerrar_sesion" => {
            comp.cerrar_sesiones_de(dispositivo.id);
            Ok(Value::Null)
        }
        otra => rpc::ejecutar(&comp.app, otra, args, comp.sesion(dispositivo.id)).await,
    };
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => error_json(e),
    }
}

async fn estado_inicial(comp: &Arc<Compartido>, dispositivo: i64) -> Res<Value> {
    let app = comp.app.clone();
    let tienda = bloqueando(move || con_abierta(&app, |a| Ok(a.lib.meta.tienda.clone()))).await?;
    let usuaria = comp.sesion(dispositivo);
    Ok(json!({
        "fase": if usuaria.is_some() { "sesion" } else { "entrar" },
        "carpeta": null, "carpetaSugerida": "", "tienda": tienda, "usuaria": usuaria, "llavero": true
    }))
}

async fn iniciar_sesion(comp: &Arc<Compartido>, dispositivo: i64, args: Value) -> Res<Value> {
    #[derive(Deserialize)]
    struct A {
        id: i64,
        pin: String,
    }
    let a: A = serde_json::from_value(args).map_err(|e| Error::Validacion(format!("Datos no válidos: {e}")))?;
    let app = comp.app.clone();
    // el límite de intentos es el mismo que en el PC: cinco fallos y se espera 30 segundos
    let u = bloqueando(move || con_abierta(&app, |ab| ab.intentos.iniciar_sesion(&ab.lib.conn, a.id, &a.pin))).await?;
    comp.sesiones.lock().map_err(|_| interno())?.insert(dispositivo, (u.clone(), Instant::now()));
    Ok(serde_json::to_value(u).unwrap_or(Value::Null))
}

fn tipo_imagen(nombre: &str) -> &'static str {
    match nombre.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    }
}

async fn portada(
    EstadoAxum(comp): EstadoAxum<Arc<Compartido>>,
    Path(archivo): Path<String>,
    headers: HeaderMap,
    Query(q): Query<ConToken>,
) -> Response {
    if autenticar(&comp, token_de(&headers, q.t.as_deref())).await.is_none() {
        return no_autorizado();
    }
    // solo nombres simples: nada de rutas
    if archivo.is_empty() || !archivo.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) || archivo.starts_with('.')
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let app = comp.app.clone();
    let nombre = archivo.clone();
    let bytes = bloqueando(move || con_abierta(&app, |a| Ok(std::fs::read(a.lib.ruta_portadas().join(&nombre)).ok()))).await.ok().flatten();
    match bytes {
        Some(b) => ([(header::CONTENT_TYPE, tipo_imagen(&archivo)), (header::CACHE_CONTROL, "private, max-age=86400")], b).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn rutas(comp: Arc<Compartido>) -> Router {
    Router::new()
        .route("/api/ping", get(ping))
        .route("/api/vincular", post(vincular))
        .route("/api/rpc/{cmd}", post(rpc_ruta))
        .route("/portadas/{archivo}", get(portada))
        // el token es el que manda; CORS abierto solo permite probar la interfaz desde un navegador del PC
        .layer(CorsLayer::very_permissive())
        .with_state(comp)
}

/// Atiende conexiones HTTPS hasta que `parar` se dispara.
pub async fn servir(listener: TcpListener, acceptor: TlsAcceptor, router: Router, mut parar: oneshot::Receiver<()>) {
    use hyper_util::rt::TokioIo;
    use hyper_util::service::TowerToHyperService;
    loop {
        tokio::select! {
            _ = &mut parar => break,
            r = listener.accept() => {
                let Ok((tcp, _)) = r else { continue };
                let (acc, router) = (acceptor.clone(), router.clone());
                tokio::spawn(async move {
                    let Ok(Ok(tls)) = tokio::time::timeout(Duration::from_secs(10), acc.accept(tcp)).await else { return };
                    let _ = hyper::server::conn::http1::Builder::new()
                        .serve_connection(TokioIo::new(tls), TowerToHyperService::new(router))
                        .await;
                });
            }
        }
    }
}

pub fn direcciones() -> Vec<String> {
    let mut v: Vec<String> = local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(_, ip)| match ip {
            std::net::IpAddr::V4(a) if !a.is_loopback() && !a.is_link_local() && !a.is_unspecified() => Some(a.to_string()),
            _ => None,
        })
        .collect();
    v.sort();
    v.dedup();
    v
}

pub fn direccion_de(puerto: u16) -> SocketAddr {
    SocketAddr::from(([0, 0, 0, 0], puerto))
}
