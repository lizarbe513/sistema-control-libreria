//! Usuarias de la tienda: Dueña y vendedoras/es, con PIN (hash Argon2id) y preferencias.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result, invalido};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Rol {
    Duena,
    Vendedor,
}

impl Rol {
    fn texto(self) -> &'static str {
        match self {
            Rol::Duena => "duena",
            Rol::Vendedor => "vendedor",
        }
    }
    fn desde(t: &str) -> Rol {
        if t == "duena" { Rol::Duena } else { Rol::Vendedor }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Usuaria {
    pub id: i64,
    pub nombre: String,
    pub rol: Rol,
    pub avatar: String,
    pub preferencias: serde_json::Value,
}

fn validar_pin(pin: &str) -> Result<()> {
    if !(4..=6).contains(&pin.len()) || !pin.chars().all(|c| c.is_ascii_digit()) {
        return invalido("El PIN debe tener de 4 a 6 números");
    }
    Ok(())
}

fn hash_pin(pin: &str) -> Result<String> {
    Argon2::default()
        .hash_password(pin.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| Error::Cripto(e.to_string()))
}

fn fila(f: &rusqlite::Row) -> rusqlite::Result<Usuaria> {
    let prefs: String = f.get(4)?;
    Ok(Usuaria {
        id: f.get(0)?,
        nombre: f.get(1)?,
        rol: Rol::desde(&f.get::<_, String>(2)?),
        avatar: f.get(3)?,
        preferencias: serde_json::from_str(&prefs).unwrap_or_else(|_| serde_json::json!({})),
    })
}

const COLUMNAS: &str = "id, nombre, rol, avatar, preferencias";

pub fn crear(conn: &Connection, nombre: &str, rol: Rol, pin: &str) -> Result<Usuaria> {
    let nombre = nombre.trim();
    if nombre.is_empty() || nombre.chars().count() > 40 {
        return invalido("Escribe un nombre (hasta 40 letras)");
    }
    validar_pin(pin)?;
    let repetido: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM usuarios WHERE activo = 1 AND lower(nombre) = lower(?1))",
        [nombre],
        |f| f.get(0),
    )?;
    if repetido {
        return invalido(format!("Ya hay alguien llamado «{nombre}»"));
    }
    conn.execute(
        "INSERT INTO usuarios (nombre, rol, pin_hash) VALUES (?1, ?2, ?3)",
        params![nombre, rol.texto(), hash_pin(pin)?],
    )?;
    obtener(conn, conn.last_insert_rowid())
}

pub fn obtener(conn: &Connection, id: i64) -> Result<Usuaria> {
    conn.query_row(&format!("SELECT {COLUMNAS} FROM usuarios WHERE id = ?1 AND activo = 1"), [id], fila)
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("a esa persona".into()))
}

pub fn listar(conn: &Connection) -> Result<Vec<Usuaria>> {
    let mut st = conn.prepare(&format!("SELECT {COLUMNAS} FROM usuarios WHERE activo = 1 ORDER BY rol = 'vendedor', nombre"))?;
    let filas = st.query_map([], fila)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(filas)
}

pub fn hay_usuarias(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM usuarios WHERE activo = 1)", [], |f| f.get(0))?)
}

/// Comprueba el PIN (sin limitar intentos: eso lo hace [`Intentos`]).
pub fn verificar_pin(conn: &Connection, id: i64, pin: &str) -> Result<Usuaria> {
    let hash: Option<String> = conn
        .query_row("SELECT pin_hash FROM usuarios WHERE id = ?1 AND activo = 1", [id], |f| f.get(0))
        .optional()?;
    let hash = hash.ok_or_else(|| Error::NoEncontrado("a esa persona".into()))?;
    let parsed = PasswordHash::new(&hash).map_err(|e| Error::Cripto(e.to_string()))?;
    Argon2::default().verify_password(pin.as_bytes(), &parsed).map_err(|_| Error::PinIncorrecto)?;
    obtener(conn, id)
}

pub fn cambiar_pin(conn: &Connection, id: i64, pin: &str) -> Result<()> {
    validar_pin(pin)?;
    let n = conn.execute("UPDATE usuarios SET pin_hash = ?2 WHERE id = ?1 AND activo = 1", params![id, hash_pin(pin)?])?;
    if n == 0 {
        return Err(Error::NoEncontrado("a esa persona".into()));
    }
    Ok(())
}

/// Guarda las preferencias (fondo, calma, barra de bloques, radio…). Se mezclan con las existentes.
pub fn guardar_preferencias(conn: &Connection, id: i64, cambios: &serde_json::Value) -> Result<serde_json::Value> {
    let mut actual = obtener(conn, id)?.preferencias;
    if let (Some(a), Some(c)) = (actual.as_object_mut(), cambios.as_object()) {
        for (k, v) in c {
            a.insert(k.clone(), v.clone());
        }
    }
    conn.execute("UPDATE usuarios SET preferencias = ?2 WHERE id = ?1", params![id, actual.to_string()])?;
    Ok(actual)
}

/// Límite de intentos de PIN: tras 5 fallos seguidos, 30 segundos de espera.
#[derive(Default)]
pub struct Intentos {
    fallos: HashMap<i64, (u32, Option<Instant>)>,
}

impl Intentos {
    const MAX: u32 = 5;
    const ESPERA: Duration = Duration::from_secs(30);

    pub fn comprobar(&mut self, id: i64) -> Result<()> {
        if let Some((_, Some(hasta))) = self.fallos.get(&id) {
            let ahora = Instant::now();
            if ahora < *hasta {
                return Err(Error::Bloqueado((*hasta - ahora).as_secs() + 1));
            }
            self.fallos.remove(&id);
        }
        Ok(())
    }

    pub fn fallo(&mut self, id: i64) {
        let e = self.fallos.entry(id).or_insert((0, None));
        e.0 += 1;
        if e.0 >= Self::MAX {
            e.1 = Some(Instant::now() + Self::ESPERA);
        }
    }

    pub fn exito(&mut self, id: i64) {
        self.fallos.remove(&id);
    }

    /// Verifica el PIN aplicando el límite de intentos.
    pub fn iniciar_sesion(&mut self, conn: &Connection, id: i64, pin: &str) -> Result<Usuaria> {
        self.comprobar(id)?;
        match verificar_pin(conn, id, pin) {
            Ok(u) => {
                self.exito(id);
                Ok(u)
            }
            Err(Error::PinIncorrecto) => {
                self.fallo(id);
                self.comprobar(id)?;
                Err(Error::PinIncorrecto)
            }
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;

    #[test]
    fn crear_listar_y_verificar() {
        let c = en_memoria();
        assert!(!hay_usuarias(&c).unwrap());
        let duena = crear(&c, "Rosa", Rol::Duena, "1234").unwrap();
        let vend = crear(&c, "Luis", Rol::Vendedor, "987654").unwrap();
        assert!(hay_usuarias(&c).unwrap());
        let lista = listar(&c).unwrap();
        assert_eq!(lista.iter().map(|u| u.nombre.as_str()).collect::<Vec<_>>(), ["Rosa", "Luis"]);
        assert_eq!(verificar_pin(&c, duena.id, "1234").unwrap().rol, Rol::Duena);
        assert!(matches!(verificar_pin(&c, vend.id, "1234"), Err(Error::PinIncorrecto)));
        // el hash no es el PIN
        let h: String = c.query_row("SELECT pin_hash FROM usuarios WHERE id = ?1", [duena.id], |f| f.get(0)).unwrap();
        assert!(h.starts_with("$argon2id$") && !h.contains("1234"));
    }

    #[test]
    fn validaciones() {
        let c = en_memoria();
        assert!(crear(&c, "Rosa", Rol::Duena, "12").is_err());
        assert!(crear(&c, "Rosa", Rol::Duena, "12ab").is_err());
        assert!(crear(&c, "  ", Rol::Duena, "1234").is_err());
        crear(&c, "Rosa", Rol::Duena, "1234").unwrap();
        assert!(crear(&c, "rosa", Rol::Vendedor, "5678").is_err(), "nombre repetido");
    }

    #[test]
    fn cambiar_pin_y_preferencias() {
        let c = en_memoria();
        let u = crear(&c, "Rosa", Rol::Duena, "1234").unwrap();
        cambiar_pin(&c, u.id, "4321").unwrap();
        assert!(verificar_pin(&c, u.id, "1234").is_err());
        assert!(verificar_pin(&c, u.id, "4321").is_ok());
        guardar_preferencias(&c, u.id, &serde_json::json!({"fondo": "cielo"})).unwrap();
        let p = guardar_preferencias(&c, u.id, &serde_json::json!({"hotbar": ["mesa"]})).unwrap();
        assert_eq!(p["fondo"], "cielo");
        assert_eq!(p["hotbar"][0], "mesa");
    }

    #[test]
    fn bloqueo_tras_cinco_intentos() {
        let c = en_memoria();
        let u = crear(&c, "Rosa", Rol::Duena, "1234").unwrap();
        let mut i = Intentos::default();
        for _ in 0..4 {
            assert!(matches!(i.iniciar_sesion(&c, u.id, "0000"), Err(Error::PinIncorrecto)));
        }
        // el quinto fallo bloquea, y el bloqueo aplica aunque el PIN sea correcto
        assert!(matches!(i.iniciar_sesion(&c, u.id, "0000"), Err(Error::Bloqueado(_))));
        assert!(matches!(i.iniciar_sesion(&c, u.id, "1234"), Err(Error::Bloqueado(_))));
    }
}
