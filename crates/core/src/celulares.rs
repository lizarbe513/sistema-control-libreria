//! Celulares vinculados: cada uno tiene su propio token (revocable). En la base solo queda el hash del token.

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{Error, Result, invalido};
use crate::usuarios::{Rol, Usuaria};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Dispositivo {
    pub id: i64,
    pub nombre: String,
    pub creado: String,
    pub ultimo_uso: Option<String>,
    pub revocado: bool,
}

fn fila(f: &rusqlite::Row) -> rusqlite::Result<Dispositivo> {
    Ok(Dispositivo { id: f.get(0)?, nombre: f.get(1)?, creado: f.get(2)?, ultimo_uso: f.get(3)?, revocado: f.get::<_, i64>(4)? == 1 })
}

const SELECT: &str = "SELECT id, nombre, creado, ultimo_uso, revocado FROM dispositivos";

/// Un token nuevo: 256 bits aleatorios en hexadecimal.
pub fn nuevo_token() -> Result<String> {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).map_err(|e| Error::Cripto(e.to_string()))?;
    Ok(hex::encode(b))
}

fn hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.trim().as_bytes()))
}

/// Registra un celular nuevo y devuelve su token (única vez que existe fuera del teléfono).
pub fn vincular(conn: &Connection, nombre: &str) -> Result<(Dispositivo, String)> {
    let nombre = nombre.trim();
    if nombre.is_empty() {
        return invalido("El celular necesita un nombre");
    }
    let nombre: String = nombre.chars().take(40).collect();
    let token = nuevo_token()?;
    conn.execute("INSERT INTO dispositivos (nombre, token_hash) VALUES (?1, ?2)", params![nombre, hash(&token)])?;
    let d = conn.query_row(&format!("{SELECT} WHERE id = ?1"), [conn.last_insert_rowid()], fila)?;
    Ok((d, token))
}

/// El celular dueño de este token, si existe y no fue desconectado. Anota el último uso (como mucho una vez por minuto).
pub fn verificar(conn: &Connection, token: &str) -> Result<Option<Dispositivo>> {
    let d = conn.query_row(&format!("{SELECT} WHERE token_hash = ?1 AND revocado = 0"), [hash(token)], fila).optional()?;
    if let Some(d) = &d {
        conn.execute(
            "UPDATE dispositivos SET ultimo_uso = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE id = ?1 AND (ultimo_uso IS NULL OR julianday('now') - julianday(ultimo_uso) > 1.0 / 1440)",
            [d.id],
        )?;
    }
    Ok(d)
}

/// Los activos primero (y los desconectados al final).
pub fn listar(conn: &Connection) -> Result<Vec<Dispositivo>> {
    let mut st = conn.prepare(&format!("{SELECT} ORDER BY revocado, COALESCE(ultimo_uso, creado) DESC, id DESC"))?;
    let filas = st.query_map([], fila)?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

/// Desconecta un celular: su token deja de servir. Solo la Dueña.
pub fn revocar(conn: &Connection, id: i64, quien: &Usuaria) -> Result<()> {
    if quien.rol != Rol::Duena {
        return Err(Error::Permiso("desconectar celulares".into()));
    }
    let n = conn.execute(
        "UPDATE dispositivos SET revocado = 1, revocado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1 AND revocado = 0",
        [id],
    )?;
    if n == 0 {
        return Err(Error::NoEncontrado("ese celular".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;
    use crate::usuarios::crear;

    #[test]
    fn vincular_verificar_y_revocar() {
        let c = en_memoria();
        let duena = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let vend = crear(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        let (d, token) = vincular(&c, "  Celular de la tienda ").unwrap();
        assert_eq!(d.nombre, "Celular de la tienda");
        assert_eq!(token.len(), 64);
        // en la base solo está el hash
        let guardado: String = c.query_row("SELECT token_hash FROM dispositivos", [], |f| f.get(0)).unwrap();
        assert_ne!(guardado, token);
        assert_eq!(guardado.len(), 64);
        assert_eq!(verificar(&c, &token).unwrap().unwrap().id, d.id);
        assert!(verificar(&c, "no-es-el-token").unwrap().is_none());
        assert!(verificar(&c, &nuevo_token().unwrap()).unwrap().is_none());
        assert!(verificar(&c, &token).unwrap().unwrap().ultimo_uso.is_some());
        // dos celulares, dos tokens distintos
        let (d2, token2) = vincular(&c, "Tablet").unwrap();
        assert_ne!(token, token2);
        assert!(vincular(&c, "  ").is_err());
        // solo la Dueña desconecta; después el token no sirve y el otro sigue
        assert!(matches!(revocar(&c, d.id, &vend), Err(Error::Permiso(_))));
        revocar(&c, d.id, &duena).unwrap();
        assert!(verificar(&c, &token).unwrap().is_none());
        assert!(verificar(&c, &token2).unwrap().is_some());
        assert!(revocar(&c, d.id, &duena).is_err(), "ya estaba desconectado");
        let lista = listar(&c).unwrap();
        assert_eq!((lista[0].id, lista[0].revocado, lista[1].id, lista[1].revocado), (d2.id, false, d.id, true));
    }
}
