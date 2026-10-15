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
    Argon2::default().hash_password(pin.as_bytes()).map(|h| h.to_string()).map_err(|e| Error::Cripto(e.to_string()))
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
    validar_nombre(conn, nombre, None)?;
    validar_pin(pin)?;
    conn.execute("INSERT INTO usuarios (nombre, rol, pin_hash) VALUES (?1, ?2, ?3)", params![nombre, rol.texto(), hash_pin(pin)?])?;
    obtener(conn, conn.last_insert_rowid())
}

fn validar_nombre(conn: &Connection, nombre: &str, excepto: Option<i64>) -> Result<()> {
    if nombre.is_empty() || nombre.chars().count() > 40 {
        return invalido("Escribe un nombre (hasta 40 letras)");
    }
    let repetido: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM usuarios WHERE activo = 1 AND lower(nombre) = lower(?1) AND id IS NOT ?2)",
        params![nombre, excepto],
        |f| f.get(0),
    )?;
    if repetido {
        return invalido(format!("Ya hay alguien llamado «{nombre}»"));
    }
    Ok(())
}

fn duenas_activas(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("SELECT count(*) FROM usuarios WHERE activo = 1 AND rol = 'duena'", [], |f| f.get(0))?)
}

/// Cambia el nombre y el rol. La tienda nunca se queda sin Dueña.
pub fn editar(conn: &Connection, id: i64, nombre: &str, rol: Rol) -> Result<Usuaria> {
    let nombre = nombre.trim();
    let actual = obtener(conn, id)?;
    validar_nombre(conn, nombre, Some(id))?;
    if actual.rol == Rol::Duena && rol != Rol::Duena && duenas_activas(conn)? <= 1 {
        return invalido("Es la única Dueña: la tienda no puede quedarse sin Dueña");
    }
    conn.execute("UPDATE usuarios SET nombre = ?2, rol = ?3 WHERE id = ?1", params![id, nombre, rol.texto()])?;
    obtener(conn, id)
}

/// Quita a una persona (baja lógica: sus ventas, encargos y movimientos siguen a su nombre). Ya no puede entrar.
pub fn quitar(conn: &Connection, id: i64, quien: &Usuaria) -> Result<()> {
    if id == quien.id {
        return invalido("No te puedes quitar a ti misma");
    }
    let u = obtener(conn, id)?;
    if u.rol == Rol::Duena && duenas_activas(conn)? <= 1 {
        return invalido("Es la única Dueña: la tienda no puede quedarse sin Dueña");
    }
    conn.execute("UPDATE usuarios SET activo = 0 WHERE id = ?1", [id])?;
    Ok(())
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
    let hash: Option<String> =
        conn.query_row("SELECT pin_hash FROM usuarios WHERE id = ?1 AND activo = 1", [id], |f| f.get(0)).optional()?;
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

/// «Olvidé mi PIN»: solo para la Dueña (las vendedoras las restablece ella). Quien llama ya comprobó la contraseña maestra.
pub fn restablecer_pin_duena(conn: &Connection, id: i64, pin: &str) -> Result<()> {
    if obtener(conn, id)?.rol != Rol::Duena {
        return Err(Error::Permiso("restablecer ese PIN con la contraseña maestra: se lo cambia la Dueña".into()));
    }
    cambiar_pin(conn, id, pin)
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
    fn editar_y_quitar() {
        let c = en_memoria();
        let rosa = crear(&c, "Rosa", Rol::Duena, "1234").unwrap();
        let luis = crear(&c, "Luis", Rol::Vendedor, "5678").unwrap();
        let ana = crear(&c, "Ana", Rol::Vendedor, "1111").unwrap();
        // editar: nombre y rol
        let l = editar(&c, luis.id, "Luis Alberto", Rol::Vendedor).unwrap();
        assert_eq!(l.nombre, "Luis Alberto");
        assert!(editar(&c, luis.id, "ana", Rol::Vendedor).is_err(), "nombre repetido");
        assert!(editar(&c, luis.id, "Luis Alberto", Rol::Vendedor).is_ok(), "su propio nombre no cuenta como repetido");
        // la única Dueña no puede dejar de serlo ni irse
        assert!(editar(&c, rosa.id, "Rosa", Rol::Vendedor).is_err());
        assert!(quitar(&c, rosa.id, &ana).is_err());
        assert!(quitar(&c, rosa.id, &rosa).is_err(), "no se quita a sí misma");
        // con otra Dueña, sí
        editar(&c, ana.id, "Ana", Rol::Duena).unwrap();
        editar(&c, rosa.id, "Rosa", Rol::Vendedor).unwrap();
        // quitar: no entra más, no aparece, y su nombre queda libre
        quitar(&c, luis.id, &ana).unwrap();
        assert!(verificar_pin(&c, luis.id, "5678").is_err());
        assert!(!listar(&c).unwrap().iter().any(|u| u.id == luis.id));
        assert!(crear(&c, "Luis Alberto", Rol::Vendedor, "2222").is_ok());
        assert!(quitar(&c, luis.id, &ana).is_err(), "ya no está");
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
    fn olvide_mi_pin_solo_la_duena() {
        let c = en_memoria();
        let d = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let v = crear(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        restablecer_pin_duena(&c, d.id, "9999").unwrap();
        assert!(verificar_pin(&c, d.id, "2468").is_err());
        assert!(verificar_pin(&c, d.id, "9999").is_ok());
        assert!(matches!(restablecer_pin_duena(&c, v.id, "9999"), Err(Error::Permiso(_))));
        assert!(restablecer_pin_duena(&c, d.id, "12").is_err());
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
