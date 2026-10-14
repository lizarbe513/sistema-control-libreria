//! La tienda en bloques (editor «Mi tienda») guardada en la base, y las plantillas con nombre.
//! La interfaz trabaja con el objeto completo (con deshacer); al guardar se reemplazan las filas.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{Result, invalido};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bloque {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub tipo: String,
    #[serde(default)]
    pub rot: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estante: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Estante {
    pub id: String,
    pub titulo: String,
    #[serde(default)]
    pub tema: String,
    pub color: String,
    pub fuerte: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letra: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orden: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inicio_tramo: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tablas: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Tienda {
    pub ancho: i32,
    pub fondo: i32,
    pub alto: i32,
    pub fachada: i32,
    pub bloques: Vec<Bloque>,
    pub estantes: Vec<Estante>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plantilla {
    pub id: String,
    pub nombre: String,
    pub tienda: Tienda,
}

const MAX_BLOQUES: usize = 200_000;

fn validar(t: &Tienda) -> Result<()> {
    let rango = |v: i32| (1..=120).contains(&v);
    if !rango(t.ancho) || !rango(t.fondo) || !rango(t.alto) || t.fachada < 1 || t.fachada > t.fondo {
        return invalido("Las medidas de la tienda no son válidas");
    }
    if t.bloques.len() > MAX_BLOQUES {
        return invalido("La tienda tiene demasiados bloques");
    }
    let mut vistas = std::collections::HashSet::with_capacity(t.bloques.len());
    for b in &t.bloques {
        if b.x < 0 || b.y < 0 || b.z < 0 || b.x >= t.ancho || b.y >= t.alto || b.z >= t.fondo || !(0..4).contains(&b.rot) {
            return invalido("Hay bloques fuera de la tienda");
        }
        if !vistas.insert((b.x, b.y, b.z)) {
            return invalido("Hay dos bloques en el mismo lugar");
        }
    }
    Ok(())
}

/// La tienda guardada, o None si todavía no se diseñó (la interfaz carga la plantilla por defecto).
pub fn cargar(conn: &Connection) -> Result<Option<Tienda>> {
    let dims: Option<(i32, i32, i32, i32)> = conn
        .query_row("SELECT ancho, fondo, alto, fachada FROM tienda WHERE id = 1", [], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?)))
        .optional()?;
    let Some((ancho, fondo, alto, fachada)) = dims else { return Ok(None) };
    let mut st = conn.prepare("SELECT x, y, z, tipo, rot, estante_id FROM bloques")?;
    let bloques = st
        .query_map([], |f| Ok(Bloque { x: f.get(0)?, y: f.get(1)?, z: f.get(2)?, tipo: f.get(3)?, rot: f.get(4)?, estante: f.get(5)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    fn json<T: serde::de::DeserializeOwned>(t: Option<String>) -> Option<T> {
        t.and_then(|t| serde_json::from_str(&t).ok())
    }
    let mut st =
        conn.prepare("SELECT id, titulo, tema, color, fuerte, letra, orden, inicio_tramo, tablas FROM estantes ORDER BY posicion")?;
    let estantes = st
        .query_map([], |f| {
            Ok(Estante {
                id: f.get(0)?,
                titulo: f.get(1)?,
                tema: f.get(2)?,
                color: f.get(3)?,
                fuerte: f.get(4)?,
                letra: f.get(5)?,
                orden: json(f.get(6)?),
                inicio_tramo: json(f.get(7)?),
                tablas: json(f.get(8)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Some(Tienda { ancho, fondo, alto, fachada, bloques, estantes }))
}

/// Reemplaza la tienda completa en una transacción.
pub fn guardar(conn: &mut Connection, t: &Tienda) -> Result<()> {
    validar(t)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO tienda (id, ancho, fondo, alto, fachada) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT (id) DO UPDATE SET ancho = ?1, fondo = ?2, alto = ?3, fachada = ?4",
        params![t.ancho, t.fondo, t.alto, t.fachada],
    )?;
    tx.execute("DELETE FROM bloques", [])?;
    tx.execute("DELETE FROM estantes", [])?;
    {
        let mut st = tx.prepare("INSERT INTO bloques (x, y, z, tipo, rot, estante_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")?;
        for b in &t.bloques {
            st.execute(params![b.x, b.y, b.z, b.tipo, b.rot, b.estante])?;
        }
        let mut st = tx.prepare(
            "INSERT INTO estantes (id, posicion, letra, titulo, tema, color, fuerte, orden, inicio_tramo, tablas)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )?;
        for (i, e) in t.estantes.iter().enumerate() {
            st.execute(params![
                e.id,
                i as i64,
                e.letra,
                e.titulo,
                e.tema,
                e.color,
                e.fuerte,
                e.orden.as_ref().map(|v| v.to_string()),
                e.inicio_tramo.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()),
                e.tablas.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()),
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn plantillas(conn: &Connection) -> Result<Vec<Plantilla>> {
    let mut st = conn.prepare("SELECT id, nombre, datos FROM plantillas_tienda ORDER BY creado")?;
    let filas = st.query_map([], |f| Ok((f.get::<_, String>(0)?, f.get::<_, String>(1)?, f.get::<_, String>(2)?)))?;
    let mut v = Vec::new();
    for fila in filas {
        let (id, nombre, datos) = fila?;
        if let Ok(tienda) = serde_json::from_str(&datos) {
            v.push(Plantilla { id, nombre, tienda });
        }
    }
    Ok(v)
}

pub fn guardar_plantilla(conn: &Connection, nombre: &str, t: &Tienda) -> Result<Plantilla> {
    validar(t)?;
    let nombre = nombre.trim();
    let nombre = if nombre.is_empty() { "Mi plantilla" } else { nombre };
    let id = format!("p{}", uuid::Uuid::new_v4().simple());
    conn.execute("INSERT INTO plantillas_tienda (id, nombre, datos) VALUES (?1, ?2, ?3)", params![id, nombre, serde_json::to_string(t)?])?;
    Ok(Plantilla { id, nombre: nombre.into(), tienda: t.clone() })
}

pub fn borrar_plantilla(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM plantillas_tienda WHERE id = ?1", [id])?;
    if plantilla_defecto(conn)?.as_deref() == Some(id) {
        conn.execute("DELETE FROM config WHERE clave = 'plantilla_defecto'", [])?;
    }
    Ok(())
}

/// Id de la plantilla por defecto (None = la incluida «SIGLO XXI (croquis)»).
pub fn plantilla_defecto(conn: &Connection) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT valor FROM config WHERE clave = 'plantilla_defecto'", [], |f| f.get(0)).optional()?)
}

pub fn fijar_plantilla_defecto(conn: &Connection, id: Option<&str>) -> Result<()> {
    match id {
        Some(id) => conn.execute(
            "INSERT INTO config (clave, valor) VALUES ('plantilla_defecto', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1",
            [id],
        )?,
        None => conn.execute("DELETE FROM config WHERE clave = 'plantilla_defecto'", [])?,
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;

    fn ejemplo() -> Tienda {
        Tienda {
            ancho: 24,
            fondo: 23,
            alto: 10,
            fachada: 16,
            bloques: vec![
                Bloque { x: 2, y: 0, z: 0, tipo: "estanteria".into(), rot: 0, estante: Some("A".into()) },
                Bloque { x: 3, y: 0, z: 0, tipo: "estanteria".into(), rot: 0, estante: Some("A".into()) },
                Bloque { x: 6, y: 0, z: 16, tipo: "planta".into(), rot: 0, estante: None },
            ],
            estantes: vec![Estante {
                id: "A".into(),
                titulo: "Estante A".into(),
                tema: "Obras literarias".into(),
                color: "#E9E3FB".into(),
                fuerte: "#9B87E0".into(),
                letra: Some("G".into()),
                orden: Some(serde_json::json!({"tramos": "izq", "repisas": "abajo"})),
                inicio_tramo: Some(vec!["2,0".into()]),
                tablas: None,
            }],
        }
    }

    #[test]
    fn ida_y_vuelta() {
        let mut c = en_memoria();
        assert_eq!(cargar(&c).unwrap(), None);
        let t = ejemplo();
        guardar(&mut c, &t).unwrap();
        let mut l = cargar(&c).unwrap().unwrap();
        l.bloques.sort_by_key(|b| (b.x, b.y, b.z));
        assert_eq!(l, t);
        // reemplaza por completo
        let mut t2 = t.clone();
        t2.bloques.truncate(1);
        guardar(&mut c, &t2).unwrap();
        assert_eq!(cargar(&c).unwrap().unwrap().bloques.len(), 1);
        // el JSON de la interfaz (camelCase) se entiende
        let desde_ts: Tienda = serde_json::from_str(
            r##"{"ancho":24,"fondo":23,"alto":10,"fachada":16,"bloques":[{"x":1,"y":0,"z":1,"tipo":"pared","rot":0}],
                "estantes":[{"id":"B","titulo":"Estante B","tema":"","color":"#fff","fuerte":"#000","inicioTramo":["1,1"]}]}"##,
        )
        .unwrap();
        assert_eq!(desde_ts.estantes[0].inicio_tramo.as_deref(), Some(&["1,1".to_string()][..]));
    }

    #[test]
    fn rechaza_tiendas_invalidas() {
        let mut c = en_memoria();
        let mut t = ejemplo();
        t.bloques.push(Bloque { x: 99, y: 0, z: 0, tipo: "pared".into(), rot: 0, estante: None });
        assert!(guardar(&mut c, &t).is_err());
        let mut t = ejemplo();
        t.bloques.push(t.bloques[0].clone());
        assert!(guardar(&mut c, &t).is_err());
    }

    #[test]
    fn plantillas_con_nombre() {
        let c = en_memoria();
        let p = guardar_plantilla(&c, "Navidad", &ejemplo()).unwrap();
        assert_eq!(plantillas(&c).unwrap().len(), 1);
        fijar_plantilla_defecto(&c, Some(&p.id)).unwrap();
        assert_eq!(plantilla_defecto(&c).unwrap().as_deref(), Some(p.id.as_str()));
        borrar_plantilla(&c, &p.id).unwrap();
        assert!(plantillas(&c).unwrap().is_empty());
        assert_eq!(plantilla_defecto(&c).unwrap(), None);
    }
}
