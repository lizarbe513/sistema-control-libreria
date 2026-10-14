//! Apertura de la base cifrada (SQLCipher) y migraciones.

use std::path::Path;

use rusqlite::{Connection, ErrorCode};
use rusqlite_migration::{M, Migrations};

use crate::error::{Error, Result};
use crate::llave::Llave;

fn migraciones() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../migraciones/001_inicio.sql")),
        M::up(include_str!("../migraciones/002_inventario.sql")),
        M::up(include_str!("../migraciones/003_ventas.sql")),
        M::up(include_str!("../migraciones/004_venta_cliente_nombre.sql")),
    ])
}

/// Abre (o crea) la base en `ruta` con la llave dada y la deja al día.
pub fn abrir(ruta: &Path, llave: &Llave) -> Result<Connection> {
    let mut conn = Connection::open(ruta)?;
    // sin registros de SQLCipher en la consola (una llave equivocada se informa como error, no como log)
    let _ = conn.execute_batch("PRAGMA cipher_log_level = NONE;");
    conn.execute_batch(&llave.pragma())?;
    // Con la llave equivocada SQLCipher no puede leer la cabecera: «file is not a database».
    if let Err(e) = conn.query_row("SELECT count(*) FROM sqlite_master", [], |f| f.get::<_, i64>(0)) {
        return Err(match e.sqlite_error_code() {
            Some(ErrorCode::NotADatabase) => Error::LlaveIncorrecta,
            _ => Error::Db(e),
        });
    }
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    migraciones().to_latest(&mut conn)?;
    Ok(conn)
}

/// Base en memoria, sin cifrar, con las migraciones aplicadas (solo para pruebas).
#[cfg(test)]
pub fn en_memoria() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    migraciones().to_latest(&mut conn).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llave::{Llave, nueva_sal};

    #[test]
    fn migraciones_validas() {
        assert!(migraciones().validate().is_ok());
    }

    #[test]
    fn cifra_y_rechaza_la_llave_equivocada() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("prueba.db");
        let sal = nueva_sal().unwrap();
        let buena = Llave::derivar("contraseña buena", &sal).unwrap();
        {
            let c = abrir(&ruta, &buena).unwrap();
            c.execute("INSERT INTO config (clave, valor) VALUES ('tienda', 'SIGLO XXI secreto')", []).unwrap();
        }
        // el archivo no contiene el texto en claro
        let crudo = std::fs::read(&ruta).unwrap();
        assert!(!crudo.windows(6).any(|w| w == b"SQLite"), "la cabecera no debe ser la de SQLite plano");
        assert!(!crudo.windows(17).any(|w| w == b"SIGLO XXI secreto"));
        // con la llave buena se lee; con la mala, error amable
        let c = abrir(&ruta, &buena).unwrap();
        let v: String = c.query_row("SELECT valor FROM config WHERE clave='tienda'", [], |f| f.get(0)).unwrap();
        assert_eq!(v, "SIGLO XXI secreto");
        drop(c);
        let mala = Llave::derivar("otra", &sal).unwrap();
        assert!(matches!(abrir(&ruta, &mala), Err(Error::LlaveIncorrecta)));
    }
}
