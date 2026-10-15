//! Cliente de IA «compatible con OpenAI» (Gemini y Groq ofrecen ese formato) y el bucle de herramientas del asistente.
//!
//! El modelo no ve la base de datos: pide **herramientas** (ver `asistente.rs`), la app las ejecuta con los permisos de
//! quien pregunta y le devuelve solo ese resultado. Si un proveedor no responde (sin internet, sin cupo gratis, caído),
//! se pasa al siguiente.

use std::future::Future;
use std::time::Duration;

use serde_json::{Value, json};

use crate::error::{Error, Result};

/// Por qué falló un proveedor: decide si vale la pena probar con el siguiente y qué se le dice a la usuaria.
#[derive(Debug, Clone, PartialEq)]
pub enum Fallo {
    SinRed,
    /// 429: se acabó el cupo gratis (por minuto o por día).
    Cupo,
    /// 401/403: la clave está mal o se revocó.
    Clave,
    Otro(String),
}

impl Fallo {
    fn texto(&self, proveedor: &str) -> String {
        match self {
            Fallo::SinRed => "No hay conexión a internet".into(),
            Fallo::Cupo => format!("{proveedor} llegó a su límite gratis por ahora"),
            Fallo::Clave => format!("La clave de {proveedor} no es válida: revísala en Ajustes → Asistente IA"),
            Fallo::Otro(m) => format!("{proveedor} respondió con un error: {m}"),
        }
    }
}

pub trait Proveedor {
    fn nombre(&self) -> &str;
    /// Devuelve el mensaje del asistente tal cual (con su `content` y/o `tool_calls`).
    fn completar(&self, mensajes: &[Value], herramientas: &[Value]) -> impl Future<Output = std::result::Result<Value, Fallo>> + Send;
}

/// Un proveedor con el formato de OpenAI (`/chat/completions`, `/models`).
#[derive(Debug, Clone)]
pub struct OpenAiCompat {
    pub nombre: String,
    pub url_base: String,
    pub clave: String,
    pub modelo: String,
}

pub const URL_GEMINI: &str = "https://generativelanguage.googleapis.com/v1beta/openai";
pub const URL_GROQ: &str = "https://api.groq.com/openai/v1";
pub const MODELO_GEMINI: &str = "gemini-3.8-flash";
pub const MODELO_GROQ: &str = "llama-3.3-70b-versatile";

fn cliente(segundos: u64) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(segundos))
        .user_agent("LibreriaSigloXXI/1.0")
        .build()
        .unwrap_or_default()
}

fn clasificar(estado: u16, cuerpo: &Value) -> Fallo {
    let msg = cuerpo
        .pointer("/error/message")
        .or_else(|| cuerpo.pointer("/0/error/message"))
        .and_then(Value::as_str)
        .unwrap_or("sin detalle")
        .chars()
        .take(300)
        .collect::<String>();
    match estado {
        429 => Fallo::Cupo,
        401 | 403 => Fallo::Clave,
        _ => Fallo::Otro(format!("{estado}: {msg}")),
    }
}

impl OpenAiCompat {
    fn url(&self, ruta: &str) -> String {
        format!("{}/{}", self.url_base.trim_end_matches('/'), ruta)
    }

    /// Los modelos que esta clave puede usar (para elegir en Ajustes). Sirve también para probar la clave.
    pub async fn modelos(&self) -> std::result::Result<Vec<String>, Fallo> {
        let r = cliente(20).get(self.url("models")).bearer_auth(&self.clave).send().await.map_err(|_| Fallo::SinRed)?;
        let estado = r.status().as_u16();
        let v: Value = r.json().await.unwrap_or(Value::Null);
        if !(200..300).contains(&estado) {
            return Err(clasificar(estado, &v));
        }
        let mut ids: Vec<String> = v["data"]
            .as_array()
            .map(|a| a.iter().filter_map(|m| m["id"].as_str()).map(|s| s.trim_start_matches("models/").to_string()).collect())
            .unwrap_or_default();
        ids.sort();
        Ok(ids)
    }
}

impl Proveedor for OpenAiCompat {
    fn nombre(&self) -> &str {
        &self.nombre
    }

    fn completar(&self, mensajes: &[Value], herramientas: &[Value]) -> impl Future<Output = std::result::Result<Value, Fallo>> + Send {
        let mut cuerpo = json!({ "model": self.modelo, "messages": mensajes, "temperature": 0.4 });
        if !herramientas.is_empty() {
            cuerpo["tools"] = Value::Array(herramientas.to_vec());
            cuerpo["tool_choice"] = json!("auto");
        }
        let (url, clave) = (self.url("chat/completions"), self.clave.clone());
        async move {
            let r = cliente(60).post(url).bearer_auth(clave).json(&cuerpo).send().await.map_err(|_| Fallo::SinRed)?;
            let estado = r.status().as_u16();
            let v: Value = r.json().await.unwrap_or(Value::Null);
            if !(200..300).contains(&estado) {
                return Err(clasificar(estado, &v));
            }
            leer_mensaje(&v).ok_or_else(|| Fallo::Otro("respuesta sin mensaje".into()))
        }
    }
}

/// El mensaje del asistente dentro de una respuesta de `/chat/completions`.
pub fn leer_mensaje(respuesta: &Value) -> Option<Value> {
    respuesta.pointer("/choices/0/message").filter(|m| m.is_object()).cloned()
}

/// Llamadas a herramientas pedidas en un mensaje: (id, nombre, argumentos).
pub fn llamadas(mensaje: &Value) -> Vec<(String, String, Value)> {
    mensaje["tool_calls"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|c| {
                    let args = match &c["function"]["arguments"] {
                        Value::String(s) => serde_json::from_str(s).unwrap_or(json!({})),
                        Value::Object(_) => c["function"]["arguments"].clone(),
                        _ => json!({}),
                    };
                    (c["id"].as_str().unwrap_or_default().to_string(), c["function"]["name"].as_str().unwrap_or_default().to_string(), args)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Texto de un mensaje (`content` puede venir como texto o como lista de partes).
pub fn texto(mensaje: &Value) -> String {
    match &mensaje["content"] {
        Value::String(s) => s.clone(),
        Value::Array(partes) => partes.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join(""),
        _ => String::new(),
    }
}

pub const RONDAS_MAX: usize = 5;

#[derive(Debug, Clone, PartialEq)]
pub struct Resultado {
    pub texto: String,
    pub proveedor: String,
}

/// Conversa con el primer proveedor que responda: ejecuta las herramientas que pida (hasta [`RONDAS_MAX`] rondas) y
/// devuelve su respuesta final. `mensajes` ya trae las instrucciones del sistema y la conversación.
pub async fn conversar<P, F, Fut>(proveedores: &[P], mut mensajes: Vec<Value>, herramientas: &[Value], mut ejecutar: F) -> Result<Resultado>
where
    P: Proveedor,
    F: FnMut(String, Value) -> Fut,
    Fut: Future<Output = Value>,
{
    if proveedores.is_empty() {
        return Err(Error::Validacion("El asistente no tiene ninguna clave: la Dueña la pone en Ajustes → Asistente IA".into()));
    }
    let mut actual = 0;
    let mut fallos: Vec<String> = Vec::new();
    for ronda in 0..=RONDAS_MAX {
        // en la última ronda ya no se ofrecen herramientas: tiene que responder con lo que juntó
        let ofrecidas: &[Value] = if ronda == RONDAS_MAX { &[] } else { herramientas };
        let mensaje = loop {
            let Some(p) = proveedores.get(actual) else {
                return Err(Error::Red(format!("El asistente no está disponible ahora. {}", fallos.join(" · "))));
            };
            match p.completar(&mensajes, ofrecidas).await {
                Ok(m) => break m,
                Err(f) => {
                    fallos.push(f.texto(p.nombre()));
                    actual += 1; // se queda con el siguiente para el resto de la conversación
                }
            }
        };
        let pedidas = llamadas(&mensaje);
        if pedidas.is_empty() || ronda == RONDAS_MAX {
            return Ok(Resultado { texto: texto(&mensaje).trim().to_string(), proveedor: proveedores[actual].nombre().to_string() });
        }
        // el mensaje del asistente vuelve tal cual (Gemini exige devolver sus firmas de pensamiento)
        mensajes.push(mensaje);
        for (id, nombre, args) in pedidas {
            let resultado = ejecutar(nombre, args).await;
            mensajes.push(json!({ "role": "tool", "tool_call_id": id, "content": resultado.to_string() }));
        }
    }
    unreachable!("el bucle siempre devuelve en la última ronda")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Proveedor guionado: devuelve sus respuestas en orden y anota lo que recibió.
    struct Guion {
        nombre: &'static str,
        respuestas: Mutex<Vec<std::result::Result<Value, Fallo>>>,
        recibido: Mutex<Vec<(Vec<Value>, usize)>>,
    }

    impl Guion {
        fn nuevo(nombre: &'static str, r: Vec<std::result::Result<Value, Fallo>>) -> Self {
            Guion { nombre, respuestas: Mutex::new(r.into_iter().rev().collect()), recibido: Mutex::default() }
        }
    }

    impl Proveedor for Guion {
        fn nombre(&self) -> &str {
            self.nombre
        }
        fn completar(&self, m: &[Value], h: &[Value]) -> impl Future<Output = std::result::Result<Value, Fallo>> + Send {
            self.recibido.lock().unwrap().push((m.to_vec(), h.len()));
            let r = self.respuestas.lock().unwrap().pop().unwrap_or(Err(Fallo::Otro("sin guion".into())));
            async move { r }
        }
    }

    fn pide(nombre: &str, args: &str) -> std::result::Result<Value, Fallo> {
        Ok(json!({ "role": "assistant", "content": null, "tool_calls": [
            { "id": "c1", "type": "function", "function": { "name": nombre, "arguments": args } }
        ]}))
    }
    fn dice(t: &str) -> std::result::Result<Value, Fallo> {
        Ok(json!({ "role": "assistant", "content": t }))
    }
    fn herramienta() -> Vec<Value> {
        vec![json!({ "type": "function", "function": { "name": "buscar_libros", "parameters": { "type": "object" } } })]
    }

    #[tokio::test]
    async fn herramienta_y_respuesta() {
        let g = Guion::nuevo("Gemini", vec![pide("buscar_libros", r#"{"consulta":"misterio"}"#), dice("Te recomiendo [[libro:7]].")]);
        let mut pedidas = Vec::new();
        let r = conversar(&[g], vec![json!({"role":"user","content":"algo de misterio"})], &herramienta(), |n, a| {
            pedidas.push((n, a));
            async { json!([{ "id": 7, "titulo": "El misterio" }]) }
        })
        .await
        .unwrap();
        assert_eq!(r, Resultado { texto: "Te recomiendo [[libro:7]].".into(), proveedor: "Gemini".into() });
        assert_eq!(pedidas, vec![("buscar_libros".to_string(), json!({"consulta":"misterio"}))]);
    }

    #[tokio::test]
    async fn el_resultado_vuelve_al_modelo_con_su_id() {
        let g = Guion::nuevo("Gemini", vec![pide("buscar_libros", "{}"), dice("listo")]);
        conversar(std::slice::from_ref(&g), vec![json!({"role":"user","content":"hola"})], &herramienta(), |_, _| async { json!({"ok": 1}) })
            .await
            .unwrap();
        let rec = g.recibido.lock().unwrap();
        let segunda = &rec[1].0;
        assert_eq!(segunda.len(), 3, "usuario + pedido del asistente + resultado");
        assert_eq!(segunda[1]["tool_calls"][0]["id"], "c1");
        assert_eq!(segunda[2], json!({ "role": "tool", "tool_call_id": "c1", "content": "{\"ok\":1}" }));
    }

    #[tokio::test]
    async fn sin_cupo_pasa_a_groq_y_se_queda_ahi() {
        let gemini = Guion::nuevo("Gemini", vec![Err(Fallo::Cupo)]);
        let groq = Guion::nuevo("Groq", vec![pide("buscar_libros", "{}"), dice("hecho")]);
        // los dos deben ser del mismo tipo: se usan en un arreglo
        let r = conversar(&[gemini, groq], vec![json!({"role":"user","content":"x"})], &herramienta(), |_, _| async { json!([]) }).await.unwrap();
        assert_eq!(r.proveedor, "Groq");
        assert_eq!(r.texto, "hecho");
    }

    #[tokio::test]
    async fn todos_fallan_explica_por_que() {
        let a = Guion::nuevo("Gemini", vec![Err(Fallo::Clave)]);
        let b = Guion::nuevo("Groq", vec![Err(Fallo::SinRed)]);
        let e = conversar(&[a, b], vec![], &herramienta(), |_, _| async { json!([]) }).await.unwrap_err().to_string();
        assert!(e.contains("clave de Gemini no es válida") && e.contains("No hay conexión"), "{e}");
        let ninguno: [Guion; 0] = [];
        assert!(conversar(&ninguno, vec![], &[], |_, _| async { json!([]) }).await.unwrap_err().to_string().contains("Ajustes"));
    }

    #[tokio::test]
    async fn limite_de_rondas() {
        let mut guion: Vec<_> = (0..RONDAS_MAX).map(|_| pide("buscar_libros", "{}")).collect();
        guion.push(dice("con lo que encontré…"));
        let g = Guion::nuevo("Gemini", guion);
        let r = conversar(std::slice::from_ref(&g), vec![], &herramienta(), |_, _| async { json!([]) }).await.unwrap();
        assert_eq!(r.texto, "con lo que encontré…");
        let rec = g.recibido.lock().unwrap();
        assert_eq!(rec.len(), RONDAS_MAX + 1);
        assert_eq!(rec.last().unwrap().1, 0, "en la última ronda no se ofrecen herramientas");
    }

    #[test]
    fn lee_respuestas_de_gemini_y_groq() {
        // Gemini (compatible con OpenAI): argumentos como texto y una firma extra que hay que conservar
        let gemini = json!({ "choices": [{ "message": { "role": "assistant", "tool_calls": [{
            "id": "abc", "type": "function", "function": { "name": "detalle_libro", "arguments": "{\"id\":3}" },
            "extra_content": { "google": { "thought_signature": "firma" } } }] } }] });
        let m = leer_mensaje(&gemini).unwrap();
        assert_eq!(llamadas(&m), vec![("abc".into(), "detalle_libro".into(), json!({"id": 3}))]);
        assert_eq!(m["tool_calls"][0]["extra_content"]["google"]["thought_signature"], "firma");
        // Groq: texto simple; y contenido por partes
        let groq = json!({ "choices": [{ "message": { "role": "assistant", "content": "Hola 🌸" } }] });
        assert_eq!(texto(&leer_mensaje(&groq).unwrap()), "Hola 🌸");
        assert_eq!(texto(&json!({ "content": [{ "type": "text", "text": "a" }, { "type": "text", "text": "b" }] })), "ab");
        assert!(leer_mensaje(&json!({ "error": {} })).is_none());
        assert_eq!(clasificar(429, &Value::Null), Fallo::Cupo);
        assert_eq!(clasificar(403, &Value::Null), Fallo::Clave);
        assert_eq!(clasificar(400, &json!({ "error": { "message": "modelo no existe" } })), Fallo::Otro("400: modelo no existe".into()));
    }

    /// Con red y claves reales: `GEMINI_API_KEY=… GROQ_API_KEY=… cargo test -p libreria-core ia -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn con_red_real() {
        for (nombre, url, var, modelo) in [("Gemini", URL_GEMINI, "GEMINI_API_KEY", MODELO_GEMINI), ("Groq", URL_GROQ, "GROQ_API_KEY", MODELO_GROQ)] {
            let Ok(clave) = std::env::var(var) else { continue };
            let p = OpenAiCompat { nombre: nombre.into(), url_base: url.into(), clave, modelo: modelo.into() };
            println!("{nombre}: {:?}", p.modelos().await.map(|m| m.len()));
            let r = conversar(&[p], vec![json!({"role":"user","content":"Di hola en una palabra"})], &[], |_, _| async { json!([]) }).await;
            println!("{nombre}: {r:?}");
        }
    }
}
