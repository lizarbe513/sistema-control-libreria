//! Cliente de la app del celular: habla con el PC por HTTPS y **fija su certificado por la huella** (la del QR). Si el
//! certificado que presenta quien responde no es exactamente ese, la conexión se corta antes de mandar nada.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::{Method, Request};
use hyper_util::rt::TokioIo;
use rustls::SignatureScheme;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerifier};
use rustls::crypto::{CryptoProvider, WebPkiSupportedAlgorithms, ring};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error as ErrorTls};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

fn huella(cert: &[u8]) -> String {
    hex::encode(Sha256::digest(cert))
}

/// Acepta únicamente el certificado con la huella esperada (o, si no se conoce, cualquiera, anotando cuál vio:
/// así se hace la primera vinculación a mano, y desde entonces queda fijado).
#[derive(Debug)]
struct Fijador {
    esperada: Option<String>,
    vista: Arc<Mutex<String>>,
    algoritmos: WebPkiSupportedAlgorithms,
}

impl ServerCertVerifier for Fijador {
    fn verify_server_cert(
        &self,
        cert: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, ErrorTls> {
        let h = huella(cert);
        if let Ok(mut v) = self.vista.lock() {
            *v = h.clone();
        }
        match &self.esperada {
            Some(e) if !e.eq_ignore_ascii_case(&h) => Err(ErrorTls::General("el certificado del PC no es el esperado".into())),
            _ => Ok(rustls::client::danger::ServerCertVerified::assertion()),
        }
    }
    fn verify_tls12_signature(
        &self,
        m: &[u8],
        c: &CertificateDer<'_>,
        d: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, ErrorTls> {
        rustls::crypto::verify_tls12_signature(m, c, d, &self.algoritmos)
    }
    fn verify_tls13_signature(
        &self,
        m: &[u8],
        c: &CertificateDer<'_>,
        d: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, ErrorTls> {
        rustls::crypto::verify_tls13_signature(m, c, d, &self.algoritmos)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algoritmos.supported_schemes()
    }
}

pub struct Respuesta {
    pub estado: u16,
    pub cuerpo: Vec<u8>,
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub tipo: String,
    /// Huella del certificado que presentó el PC.
    pub huella: String,
}

/// Una petición HTTPS a `host:puerto`, fijando el certificado por `esperada` (si se conoce).
pub async fn pedir(
    host: &str,
    puerto: u16,
    esperada: Option<&str>,
    metodo: Method,
    ruta: &str,
    cuerpo: Option<&Value>,
    token: Option<&str>,
) -> Result<Respuesta, String> {
    let proveedor = Arc::new(ring::default_provider());
    let vista = Arc::new(Mutex::new(String::new()));
    let fijador = Fijador {
        esperada: esperada.filter(|h| !h.is_empty()).map(str::to_string),
        vista: vista.clone(),
        algoritmos: proveedor.signature_verification_algorithms,
    };
    let cfg = ClientConfig::builder_with_provider(proveedor as Arc<CryptoProvider>)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(fijador))
        .with_no_client_auth();
    let limite = Duration::from_secs(6);
    let tcp = tokio::time::timeout(limite, TcpStream::connect((host, puerto)))
        .await
        .map_err(|_| "tiempo agotado".to_string())?
        .map_err(|e| e.to_string())?;
    let nombre = ServerName::try_from(host.to_string()).map_err(|e| e.to_string())?;
    let tls = tokio::time::timeout(limite, TlsConnector::from(Arc::new(cfg)).connect(nombre, tcp))
        .await
        .map_err(|_| "tiempo agotado".to_string())?
        .map_err(|e| {
            let t = e.to_string();
            if t.contains("no es el esperado") { "El certificado del PC cambió: vincula este celular otra vez".to_string() } else { t }
        })?;
    let (mut envio, conexion) = hyper::client::conn::http1::handshake(TokioIo::new(tls)).await.map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let _ = conexion.await;
    });
    let mut req = Request::builder().method(metodo).uri(ruta).header("host", format!("{host}:{puerto}")).header("connection", "close");
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let datos = match cuerpo {
        Some(c) => {
            req = req.header("content-type", "application/json");
            Bytes::from(serde_json::to_vec(c).map_err(|e| e.to_string())?)
        }
        None => Bytes::new(),
    };
    let req = req.body(Full::new(datos)).map_err(|e| e.to_string())?;
    let resp = tokio::time::timeout(Duration::from_secs(60), envio.send_request(req))
        .await
        .map_err(|_| "El PC tardó demasiado en responder".to_string())?
        .map_err(|e| e.to_string())?;
    let estado = resp.status().as_u16();
    let tipo = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let cuerpo = resp.into_body().collect().await.map_err(|e| e.to_string())?.to_bytes().to_vec();
    let h = vista.lock().map(|v| v.clone()).unwrap_or_default();
    Ok(Respuesta { estado, cuerpo, tipo, huella: h })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resultado {
    host_usado: String,
    datos: Value,
}

/// Lo que llama la interfaz del celular: prueba cada dirección del PC y devuelve el JSON (o un error en español).
/// Si el PC dice que este celular ya no está vinculado, el error empieza con `\u{1}vincular|`.
#[tauri::command]
pub async fn lan_pedir(
    hosts: Vec<String>,
    puerto: u16,
    huella: String,
    metodo: String,
    ruta: String,
    cuerpo: Option<Value>,
    token: Option<String>,
) -> Result<Resultado, String> {
    let m = if metodo.eq_ignore_ascii_case("GET") { Method::GET } else { Method::POST };
    let mut ultimo = String::new();
    for host in &hosts {
        match pedir(host, puerto, Some(&huella), m.clone(), &ruta, cuerpo.as_ref(), token.as_deref()).await {
            Ok(r) => {
                let datos: Value = serde_json::from_slice(&r.cuerpo).unwrap_or(Value::Null);
                if r.estado / 100 == 2 {
                    // en la primera vinculación a mano se aprende la huella del PC (se devuelve para fijarla)
                    let mut datos = datos;
                    if let Some(o) = datos.as_object_mut()
                        && huella.is_empty()
                        && !o.contains_key("huella")
                    {
                        o.insert("huella".into(), json!(r.huella));
                    }
                    return Ok(Resultado { host_usado: host.clone(), datos });
                }
                let msg = datos
                    .get("error")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("El PC respondió {}", r.estado));
                return Err(if datos.get("vincular").and_then(Value::as_bool).unwrap_or(false) {
                    format!("\u{1}vincular|{msg}")
                } else {
                    msg
                });
            }
            Err(e) => ultimo = e,
        }
    }
    Err(if ultimo.starts_with("El certificado") {
        ultimo
    } else {
        "No se pudo conectar con el PC. ¿Está encendido, con la app abierta y en el mismo WiFi?".to_string()
    })
}

/// Las portadas llegan por `lan://…/<datos en base64>/<archivo>`: se piden al PC con el mismo certificado fijado.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn portada(ruta: &str) -> (u16, String, Vec<u8>) {
    let partes: Vec<&str> = ruta.trim_start_matches('/').split('/').collect();
    let [datos, archivo] = partes[..] else {
        return (404, "text/plain".into(), vec![]);
    };
    let decodificado = base64_decodificar(datos).and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    let Some(d) = decodificado else {
        return (400, "text/plain".into(), vec![]);
    };
    let hosts: Vec<String> = d["h"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let (puerto, token, f) =
        (d["p"].as_u64().unwrap_or(0) as u16, d["t"].as_str().unwrap_or("").to_string(), d["f"].as_str().unwrap_or("").to_string());
    let ruta_pc = format!("/portadas/{archivo}");
    let r = tauri::async_runtime::block_on(async {
        for h in &hosts {
            if let Ok(r) = pedir(h, puerto, Some(&f), Method::GET, &ruta_pc, None, Some(&token)).await {
                return Some(r);
            }
        }
        None
    });
    match r {
        Some(r) if r.estado == 200 => (200, if r.tipo.is_empty() { "image/jpeg".into() } else { r.tipo }, r.cuerpo),
        _ => (404, "text/plain".into(), vec![]),
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn base64_decodificar(t: &str) -> Option<Vec<u8>> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut salida = Vec::with_capacity(t.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in t.bytes().filter(|c| *c != b'=') {
        // acepta también la variante para URL (- y _ en lugar de + y /)
        let c = match c {
            b'-' => b'+',
            b'_' => b'/',
            otro => otro,
        };
        let v = T.iter().position(|x| *x == c)? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            salida.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(salida)
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::service::service_fn;
    use tokio::net::TcpListener;
    use tokio_rustls::TlsAcceptor;

    /// Un servidorcito HTTPS con un certificado propio que responde un JSON.
    async fn servidor() -> (u16, String) {
        let par = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
        let huella_cert = huella(par.cert.der());
        let clave = rustls::pki_types::PrivateKeyDer::try_from(par.key_pair.serialize_der()).unwrap();
        let cfg = rustls::ServerConfig::builder_with_provider(Arc::new(ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![par.cert.der().clone()], clave)
            .unwrap();
        let acc = TlsAcceptor::from(Arc::new(cfg));
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let puerto = l.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let Ok((tcp, _)) = l.accept().await else { break };
                let acc = acc.clone();
                tokio::spawn(async move {
                    let Ok(tls) = acc.accept(tcp).await else { return };
                    let _ = hyper::server::conn::http1::Builder::new()
                        .serve_connection(
                            TokioIo::new(tls),
                            service_fn(|req: Request<hyper::body::Incoming>| async move {
                                let auth = req.headers().get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                                Ok::<_, std::convert::Infallible>(hyper::Response::new(Full::new(Bytes::from(
                                    json!({ "ok": true, "auth": auth }).to_string(),
                                ))))
                            }),
                        )
                        .await;
                });
            }
        });
        (puerto, huella_cert)
    }

    #[tokio::test]
    async fn fija_el_certificado_por_su_huella() {
        let (puerto, huella_ok) = servidor().await;
        // con la huella correcta: responde, y el token viaja
        let r = pedir("127.0.0.1", puerto, Some(&huella_ok), Method::GET, "/api/ping", None, Some("abc")).await.unwrap();
        assert_eq!(r.estado, 200);
        assert_eq!(serde_json::from_slice::<Value>(&r.cuerpo).unwrap()["auth"], "Bearer abc");
        assert_eq!(r.huella, huella_ok);
        // con otra huella (alguien se hace pasar por el PC): se corta antes de enviar nada
        let e = pedir("127.0.0.1", puerto, Some(&"00".repeat(32)), Method::GET, "/api/ping", None, Some("abc")).await.err().unwrap();
        assert!(e.contains("certificado"), "{e}");
        // sin huella conocida (vinculación a mano): acepta y dice cuál vio
        let r = pedir("127.0.0.1", puerto, None, Method::GET, "/api/ping", None, None).await.unwrap();
        assert_eq!(r.huella, huella_ok);
    }

    #[test]
    fn decodifica_base64() {
        assert_eq!(base64_decodificar("aGVsbG8h").unwrap(), b"hello!");
        assert_eq!(base64_decodificar("Zg==").unwrap(), b"f");
        assert_eq!(base64_decodificar("-_8").unwrap(), base64_decodificar("+/8=").unwrap());
        assert!(base64_decodificar("a$b").is_none());
    }
}
