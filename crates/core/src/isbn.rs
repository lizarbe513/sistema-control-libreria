//! ISBN: validación (ISBN-10 e ISBN-13), normalización a ISBN-13 y datos del libro desde internet
//! (Open Library y, si falta algo, Google Books).

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::error::{Error, Result};

/// Normaliza a ISBN-13 (solo dígitos). Acepta guiones/espacios e ISBN-10 (lo convierte). None si no es válido.
pub fn normalizar(entrada: &str) -> Option<String> {
    let limpio: String = entrada.chars().filter(|c| !matches!(c, '-' | ' ' | '\u{2010}'..='\u{2015}')).collect();
    let limpio = limpio.to_ascii_uppercase();
    match limpio.len() {
        13 if limpio.chars().all(|c| c.is_ascii_digit()) && control_13(&limpio[..12]) == limpio.as_bytes()[12] - b'0' => Some(limpio),
        10 if valido_10(&limpio) => Some(de_10_a_13(&limpio)),
        _ => None,
    }
}

fn control_13(doce: &str) -> u8 {
    let suma: u32 = doce.bytes().enumerate().map(|(i, b)| (b - b'0') as u32 * if i % 2 == 0 { 1 } else { 3 }).sum();
    ((10 - suma % 10) % 10) as u8
}

fn valido_10(s: &str) -> bool {
    let b = s.as_bytes();
    if !b[..9].iter().all(u8::is_ascii_digit) || !(b[9].is_ascii_digit() || b[9] == b'X') {
        return false;
    }
    let suma: u32 = b.iter().enumerate().map(|(i, &c)| (10 - i as u32) * if c == b'X' { 10 } else { (c - b'0') as u32 }).sum();
    suma.is_multiple_of(11)
}

fn de_10_a_13(diez: &str) -> String {
    let doce = format!("978{}", &diez[..9]);
    format!("{doce}{}", control_13(&doce))
}

/// Datos sugeridos para dar de alta un libro (la usuaria los revisa antes de guardar).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sugerencia {
    pub isbn: String,
    pub titulo: String,
    pub autor: String,
    pub editorial: String,
    pub anio: Option<i64>,
    pub sinopsis: String,
    pub portada_url: Option<String>,
    /// De dónde salieron los datos: «Open Library», «Google Books» o ambas.
    pub fuente: String,
}

/// El primer año de 4 dígitos en un texto («March 2008», «2008-03-01»…).
fn anio_de(texto: &str) -> Option<i64> {
    let b = texto.as_bytes();
    (0..b.len().saturating_sub(3)).find_map(|i| {
        let t = &texto[i..i + 4];
        let antes_ok = i == 0 || !b[i - 1].is_ascii_digit();
        let despues_ok = i + 4 >= b.len() || !b[i + 4].is_ascii_digit();
        (antes_ok && despues_ok && t.bytes().all(|c| c.is_ascii_digit())).then(|| t.parse().ok()).flatten()
    })
}

fn texto(v: &Value) -> String {
    v.as_str().unwrap_or_default().trim().to_string()
}

fn https(url: &str) -> String {
    url.replacen("http://", "https://", 1)
}

/// Respuesta de `openlibrary.org/api/books?bibkeys=ISBN:…&jscmd=data&format=json`.
pub fn desde_open_library(isbn13: &str, json: &Value) -> Option<Sugerencia> {
    let d = json.get(format!("ISBN:{isbn13}"))?;
    let titulo = texto(&d["title"]);
    if titulo.is_empty() {
        return None;
    }
    let subtitulo = texto(&d["subtitle"]);
    let nombres = |campo: &str| {
        d[campo]
            .as_array()
            .map(|a| a.iter().map(|x| texto(&x["name"])).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(", "))
            .unwrap_or_default()
    };
    let sinopsis = d["excerpts"].get(0).map(|e| texto(&e["text"])).filter(|s| !s.is_empty()).unwrap_or_else(|| match &d["notes"] {
        Value::String(s) => s.trim().to_string(),
        v => texto(&v["value"]),
    });
    Some(Sugerencia {
        isbn: isbn13.into(),
        titulo: if subtitulo.is_empty() { titulo } else { format!("{titulo}: {subtitulo}") },
        autor: nombres("authors"),
        editorial: nombres("publishers"),
        anio: anio_de(&texto(&d["publish_date"])),
        sinopsis,
        portada_url: ["large", "medium"].iter().map(|k| texto(&d["cover"][*k])).find(|s| !s.is_empty()).map(|s| https(&s)),
        fuente: "Open Library".into(),
    })
}

/// Respuesta de `googleapis.com/books/v1/volumes?q=isbn:…`.
pub fn desde_google(isbn13: &str, json: &Value) -> Option<Sugerencia> {
    let v = &json["items"].get(0)?["volumeInfo"];
    let titulo = texto(&v["title"]);
    if titulo.is_empty() {
        return None;
    }
    let subtitulo = texto(&v["subtitle"]);
    let portada = ["thumbnail", "smallThumbnail"].iter().map(|k| texto(&v["imageLinks"][*k])).find(|s| !s.is_empty());
    Some(Sugerencia {
        isbn: isbn13.into(),
        titulo: if subtitulo.is_empty() { titulo } else { format!("{titulo}: {subtitulo}") },
        autor: v["authors"].as_array().map(|a| a.iter().map(texto).collect::<Vec<_>>().join(", ")).unwrap_or_default(),
        editorial: texto(&v["publisher"]),
        anio: anio_de(&texto(&v["publishedDate"])),
        sinopsis: texto(&v["description"]),
        // «zoom=1» es una miniatura; sin «edge=curl» se ve plana
        portada_url: portada.map(|u| https(&u).replace("&edge=curl", "")),
        fuente: "Google Books".into(),
    })
}

/// Junta las dos fuentes: lo de Open Library manda y Google Books completa lo que falte.
pub fn combinar(a: Option<Sugerencia>, b: Option<Sugerencia>) -> Option<Sugerencia> {
    match (a, b) {
        (Some(mut a), Some(b)) => {
            let mut usada = false;
            for (campo, otro) in [(&mut a.autor, b.autor), (&mut a.editorial, b.editorial), (&mut a.sinopsis, b.sinopsis)] {
                if campo.is_empty() && !otro.is_empty() {
                    *campo = otro;
                    usada = true;
                }
            }
            if a.anio.is_none() && b.anio.is_some() {
                a.anio = b.anio;
                usada = true;
            }
            if a.portada_url.is_none() && b.portada_url.is_some() {
                a.portada_url = b.portada_url;
                usada = true;
            }
            if usada {
                a.fuente = "Open Library y Google Books".into();
            }
            Some(a)
        }
        (a, b) => a.or(b),
    }
}

pub(crate) fn cliente() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("LibreriaSigloXXI/0.1 (inventario de una librería)")
        .build()
        .map_err(|e| Error::Red(format!("No se pudo preparar la conexión: {e}")))
}

async fn pedir_json(cliente: &reqwest::Client, url: &str) -> Option<Value> {
    cliente.get(url).send().await.ok()?.error_for_status().ok()?.json().await.ok()
}

/// Busca los datos del libro en internet. Sin conexión devuelve un mensaje amable (nada falla).
pub async fn consultar(entrada: &str) -> Result<Sugerencia> {
    let isbn = normalizar(entrada).ok_or_else(|| Error::Validacion("Ese ISBN no es válido. Revisa los números.".into()))?;
    let cliente = cliente()?;
    let ol = pedir_json(&cliente, &format!("https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json")).await;
    let de_ol = ol.as_ref().and_then(|j| desde_open_library(&isbn, j));
    // Google Books completa sinopsis o portada cuando faltan
    let falta = de_ol.as_ref().is_none_or(|s| s.sinopsis.is_empty() || s.portada_url.is_none() || s.autor.is_empty());
    let gb = if falta { pedir_json(&cliente, &format!("https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}")).await } else { None };
    let de_gb = gb.as_ref().and_then(|j| desde_google(&isbn, j));
    match combinar(de_ol, de_gb) {
        Some(s) => Ok(s),
        None if ol.is_none() && gb.is_none() => Err(Error::Red("No hay conexión a internet. Puedes llenar los datos a mano.".into())),
        None => Err(Error::NoEncontrado("ese ISBN en Open Library ni en Google Books. Puedes llenar los datos a mano.".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normaliza_isbn() {
        assert_eq!(normalizar("978-84-9838-114-6").as_deref(), Some("9788498381146"));
        assert_eq!(normalizar(" 9788498381146 ").as_deref(), Some("9788498381146"));
        // ISBN-10 con X → ISBN-13
        assert_eq!(normalizar("0-8044-2957-X").as_deref(), Some("9780804429573"));
        assert_eq!(normalizar("84-376-0494-x").as_deref(), Some("9788437604947"));
        // dígito de control equivocado
        assert_eq!(normalizar("9788498381148"), None);
        assert_eq!(normalizar("84-376-0494-7"), None);
        assert_eq!(normalizar("123"), None);
        assert_eq!(normalizar("abcdefghij"), None);
    }

    #[test]
    fn anio_en_textos() {
        assert_eq!(anio_de("March 2008"), Some(2008));
        assert_eq!(anio_de("2015-03-01"), Some(2015));
        assert_eq!(anio_de("c1999."), Some(1999));
        assert_eq!(anio_de("sin fecha"), None);
        assert_eq!(anio_de("12345"), None);
    }

    #[test]
    fn lee_open_library() {
        let j = json!({"ISBN:9788498381146": {
            "title": "El Principito", "authors": [{"name": "Antoine de Saint-Exupéry"}],
            "publishers": [{"name": "Salamandra"}], "publish_date": "2008",
            "cover": {"small": "http://covers.openlibrary.org/b/id/1-S.jpg", "large": "http://covers.openlibrary.org/b/id/1-L.jpg"},
            "excerpts": [{"text": "Cuando yo tenía seis años…"}]
        }});
        let s = desde_open_library("9788498381146", &j).unwrap();
        assert_eq!(s.titulo, "El Principito");
        assert_eq!(s.autor, "Antoine de Saint-Exupéry");
        assert_eq!(s.editorial, "Salamandra");
        assert_eq!(s.anio, Some(2008));
        assert_eq!(s.portada_url.as_deref(), Some("https://covers.openlibrary.org/b/id/1-L.jpg"));
        assert_eq!(s.sinopsis, "Cuando yo tenía seis años…");
        assert!(desde_open_library("9788498381146", &json!({})).is_none());
    }

    #[test]
    fn lee_google_y_combina() {
        let j = json!({"items": [{"volumeInfo": {
            "title": "Cien años de soledad", "authors": ["Gabriel García Márquez"], "publisher": "Debolsillo",
            "publishedDate": "2015-03-01", "description": "La historia de los Buendía.",
            "imageLinks": {"thumbnail": "http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&edge=curl"}
        }}]});
        let g = desde_google("9788497592208", &j).unwrap();
        assert_eq!(g.anio, Some(2015));
        assert_eq!(g.portada_url.as_deref(), Some("https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1"));
        let ol = Sugerencia {
            isbn: "9788497592208".into(),
            titulo: "Cien años de soledad".into(),
            fuente: "Open Library".into(),
            ..Default::default()
        };
        let c = combinar(Some(ol), Some(g)).unwrap();
        assert_eq!(c.autor, "Gabriel García Márquez");
        assert_eq!(c.sinopsis, "La historia de los Buendía.");
        assert_eq!(c.fuente, "Open Library y Google Books");
        assert!(desde_google("1", &json!({"totalItems": 0})).is_none());
    }

    /// Con red: `cargo test -p libreria-core -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn consulta_real() {
        let s = consultar("9780140328721").await.unwrap();
        assert!(!s.titulo.is_empty(), "{s:?}");
    }
}
