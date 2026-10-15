//! Celulares: encender el servidor local, vincular un celular con un código QR y desconectarlos (solo la Dueña).

use std::sync::{Arc, Mutex};
use std::time::Duration;

use libreria_core::celulares::{self, Dispositivo};
use libreria_core::rusqlite::{Connection, OptionalExtension};
use libreria_core::{Error, Result};
use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_rustls::TlsAcceptor;

use crate::estado::{Estado, Fase};
use crate::servidor::{self, Compartido};

type Res<T> = std::result::Result<T, Error>;

const PUERTO_DEFECTO: u16 = 47321;

struct Corriendo {
    puerto: u16,
    parar: oneshot::Sender<()>,
}

/// Estado del servidor, para los comandos y el vigilante.
pub struct Celulares {
    pub compartido: Arc<Compartido>,
    corriendo: Mutex<Option<Corriendo>>,
}

impl Celulares {
    pub fn nuevo(app: AppHandle) -> Self {
        Celulares { compartido: Arc::new(Compartido::nuevo(app)), corriendo: Mutex::new(None) }
    }
}

fn leer(conn: &Connection, clave: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT valor FROM config WHERE clave = ?1", [clave], |f| f.get(0)).optional()?)
}

fn escribir(conn: &Connection, clave: &str, valor: &str) -> Result<()> {
    conn.execute("INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = ?2", [clave, valor])?;
    Ok(())
}

fn activo(conn: &Connection) -> bool {
    leer(conn, "celulares_activo").ok().flatten().is_some_and(|v| v == "1")
}

fn puerto_configurado(conn: &Connection) -> u16 {
    leer(conn, "celulares_puerto").ok().flatten().and_then(|v| v.parse().ok()).unwrap_or(PUERTO_DEFECTO)
}

fn huella_de(cert_der: &[u8]) -> String {
    hex::encode(Sha256::digest(cert_der))
}

/// El certificado propio de este PC (se crea la primera vez y se guarda cifrado en la base).
fn credenciales(conn: &Connection) -> Result<(String, String)> {
    if let (Some(c), Some(k)) = (leer(conn, "celulares_cert")?, leer(conn, "celulares_clave")?) {
        return Ok((c, k));
    }
    let mut nombres = vec!["localhost".to_string(), "127.0.0.1".to_string()];
    nombres.extend(servidor::direcciones());
    let par = rcgen::generate_simple_self_signed(nombres).map_err(|e| Error::Cripto(format!("No se pudo crear el certificado: {e}")))?;
    let (c, k) = (par.cert.pem(), par.key_pair.serialize_pem());
    escribir(conn, "celulares_cert", &c)?;
    escribir(conn, "celulares_clave", &k)?;
    Ok((c, k))
}

fn aceptador(cert_pem: &str, clave_pem: &str) -> Result<(TlsAcceptor, String)> {
    let cert = CertificateDer::from_pem_slice(cert_pem.as_bytes()).map_err(|_| Error::Cripto("Certificado dañado".into()))?;
    let clave = PrivateKeyDer::from_pem_slice(clave_pem.as_bytes()).map_err(|_| Error::Cripto("Clave del certificado dañada".into()))?;
    let huella = huella_de(&cert);
    let cfg = rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .map_err(|e| Error::Cripto(e.to_string()))?
        .with_no_client_auth()
        .with_single_cert(vec![cert], clave)
        .map_err(|e| Error::Cripto(e.to_string()))?;
    Ok((TlsAcceptor::from(Arc::new(cfg)), huella))
}

/// Enciende el servidor en el primer puerto libre desde el configurado.
fn encender(cel: &Celulares, conn: &Connection) -> Result<u16> {
    let (cert, clave) = credenciales(conn)?;
    let (acceptor, huella) = aceptador(&cert, &clave)?;
    *cel.compartido.huella.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))? = huella;
    let base = puerto_configurado(conn);
    let router = servidor::rutas(cel.compartido.clone());
    let (listener, puerto) = (0..20u16)
        .find_map(|i| {
            let p = base.checked_add(i)?;
            std::net::TcpListener::bind(servidor::direccion_de(p)).ok().map(|l| (l, p))
        })
        .ok_or_else(|| Error::Validacion("No hay un puerto libre para el servidor de celulares".into()))?;
    listener.set_nonblocking(true)?;
    let (parar, recibir) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        if let Ok(l) = TcpListener::from_std(listener) {
            servidor::servir(l, acceptor, router, recibir).await;
        }
    });
    *cel.corriendo.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))? = Some(Corriendo { puerto, parar });
    Ok(puerto)
}

fn apagar(cel: &Celulares) {
    if let Ok(mut c) = cel.corriendo.lock()
        && let Some(x) = c.take()
    {
        let _ = x.parar.send(());
    }
}

/// Mantiene el servidor acorde con lo que se pidió: encendido solo si la librería está abierta y la Dueña lo activó.
pub fn iniciar_vigilante(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let cel = app.state::<Celulares>();
            let estado = app.state::<Estado>();
            let Ok(fase) = estado.0.lock() else { continue };
            let quiere = matches!(&*fase, Fase::Abierta(a) if activo(&a.lib.conn));
            let corre = cel.corriendo.lock().is_ok_and(|c| c.is_some());
            match (quiere, corre, &*fase) {
                (true, false, Fase::Abierta(a)) => {
                    let _ = encender(&cel, &a.lib.conn);
                }
                (false, true, _) => apagar(&cel),
                _ => {}
            }
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoCelulares {
    activo: bool,
    corriendo: bool,
    puerto: Option<u16>,
    direcciones: Vec<String>,
    dispositivos: Vec<Dispositivo>,
}

fn estado_de(cel: &Celulares, a: &crate::estado::Abierta) -> Res<EstadoCelulares> {
    let puerto = cel.corriendo.lock().ok().and_then(|c| c.as_ref().map(|x| x.puerto));
    Ok(EstadoCelulares {
        activo: activo(&a.lib.conn),
        corriendo: puerto.is_some(),
        puerto,
        direcciones: servidor::direcciones(),
        dispositivos: celulares::listar(&a.lib.conn)?,
    })
}

fn con_duena<T>(estado: &State<Estado>, f: impl FnOnce(&mut crate::estado::Abierta) -> Res<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => {
            a.duena("conectar celulares")?;
            f(a)
        }
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn celulares_estado(estado: State<Estado>, cel: State<Celulares>) -> Res<EstadoCelulares> {
    con_duena(&estado, |a| estado_de(&cel, a))
}

/// Enciende o apaga el servidor (se recuerda para la próxima vez).
#[tauri::command]
pub fn celulares_activar(estado: State<Estado>, cel: State<Celulares>, activo: bool) -> Res<EstadoCelulares> {
    con_duena(&estado, |a| {
        escribir(&a.lib.conn, "celulares_activo", if activo { "1" } else { "0" })?;
        if activo {
            if cel.corriendo.lock().is_ok_and(|c| c.is_none()) {
                encender(&cel, &a.lib.conn)?;
            }
        } else {
            apagar(&cel);
        }
        estado_de(&cel, a)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodigoVinculo {
    codigo: String,
    segundos: u64,
    /// Lo que lleva el QR: `siglo://vincular?h=…&p=…&c=…&f=…&n=…`.
    texto: String,
    svg: String,
}

fn codificar(t: &str) -> String {
    t.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') { (b as char).to_string() } else { format!("%{b:02X}") }
        })
        .collect()
}

/// Un código nuevo para vincular un celular, con su QR (de un solo uso, vale 5 minutos).
#[tauri::command]
pub fn celulares_codigo(estado: State<Estado>, cel: State<Celulares>) -> Res<CodigoVinculo> {
    let tienda = con_duena(&estado, |a| Ok(a.lib.meta.tienda.clone()))?;
    let puerto = cel
        .corriendo
        .lock()
        .ok()
        .and_then(|c| c.as_ref().map(|x| x.puerto))
        .ok_or_else(|| Error::Validacion("Primero enciende «Conectar celulares»".into()))?;
    let huella = cel.compartido.huella.lock().map(|h| h.clone()).unwrap_or_default();
    let (codigo, segundos) = cel.compartido.nuevo_codigo()?;
    let hosts = servidor::direcciones();
    if hosts.is_empty() {
        return Err(Error::Validacion("Este PC no está conectado a ninguna red (WiFi o cable)".into()));
    }
    let texto = format!("siglo://vincular?h={}&p={puerto}&c={codigo}&f={huella}&n={}", hosts.join(","), codificar(&tienda));
    let qr = qrcode::QrCode::new(texto.as_bytes()).map_err(|e| Error::Validacion(format!("No se pudo crear el QR: {e}")))?;
    let svg = qr.render::<qrcode::render::svg::Color>().min_dimensions(260, 260).quiet_zone(true).build();
    Ok(CodigoVinculo { codigo, segundos, texto, svg })
}

#[tauri::command]
pub fn celulares_desconectar(estado: State<Estado>, cel: State<Celulares>, id: i64) -> Res<EstadoCelulares> {
    con_duena(&estado, |a| {
        let yo = a.usuaria()?;
        celulares::revocar(&a.lib.conn, id, &yo)?;
        cel.compartido.cerrar_sesiones_de(id);
        estado_de(&cel, a)
    })
}
