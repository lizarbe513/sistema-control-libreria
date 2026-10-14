//! La carpeta de datos portable: base cifrada + metadatos + portadas + respaldos.
//!
//! Para mudarse de PC basta copiar la carpeta y abrirla con la contraseña maestra.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::{Error, Result, invalido};
use crate::llave::{Llave, nueva_sal};

pub const ARCHIVO_DB: &str = "libreria.db";
pub const ARCHIVO_META: &str = "libreria.json";
pub const DIR_PORTADAS: &str = "portadas";
pub const DIR_RESPALDOS: &str = "respaldos";
const VERSION_META: u32 = 1;

/// Metadatos sin secretos (se guardan en claro junto a la base).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Meta {
    pub version: u32,
    /// Identificador de la carpeta: nombre de la entrada en el llavero del sistema.
    pub id: String,
    /// Sal de la llave (hex).
    pub sal: String,
    pub tienda: String,
}

/// Una carpeta de datos abierta.
pub struct Libreria {
    pub conn: Connection,
    pub carpeta: PathBuf,
    pub meta: Meta,
}

impl Libreria {
    pub fn ruta_portadas(&self) -> PathBuf {
        self.carpeta.join(DIR_PORTADAS)
    }

    /// Pasa los cambios del registro WAL al archivo principal, para que `libreria.db` quede completa
    /// por sí sola (copiar la carpeta, respaldos). Se llama al cerrar la app.
    pub fn consolidar(&self) -> Result<()> {
        self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }
}

/// ¿Esta carpeta ya tiene una librería?
pub fn existe(carpeta: &Path) -> bool {
    carpeta.join(ARCHIVO_DB).is_file() && carpeta.join(ARCHIVO_META).is_file()
}

pub fn leer_meta(carpeta: &Path) -> Result<Meta> {
    let texto = fs::read_to_string(carpeta.join(ARCHIVO_META))
        .map_err(|_| Error::Validacion("Esa carpeta no tiene datos de la librería".into()))?;
    Ok(serde_json::from_str(&texto)?)
}

/// Crea una librería nueva. Devuelve la carpeta abierta y su llave (para guardarla en el llavero).
pub fn crear(carpeta: &Path, contrasena: &str, tienda: &str) -> Result<(Libreria, Llave)> {
    if contrasena.chars().count() < 8 {
        return invalido("La contraseña maestra debe tener al menos 8 caracteres");
    }
    let tienda = tienda.trim();
    if tienda.is_empty() {
        return invalido("Escribe el nombre de la tienda");
    }
    if existe(carpeta) {
        return invalido("Esa carpeta ya tiene datos de una librería: ábrela en lugar de crear una nueva");
    }
    fs::create_dir_all(carpeta.join(DIR_PORTADAS))?;
    fs::create_dir_all(carpeta.join(DIR_RESPALDOS))?;
    let sal = nueva_sal()?;
    let llave = Llave::derivar(contrasena, &sal)?;
    let meta = Meta {
        version: VERSION_META,
        id: uuid::Uuid::new_v4().to_string(),
        sal: hex::encode(sal),
        tienda: tienda.into(),
    };
    let conn = db::abrir(&carpeta.join(ARCHIVO_DB), &llave)?;
    fs::write(carpeta.join(ARCHIVO_META), serde_json::to_string_pretty(&meta)?)?;
    Ok((
        Libreria {
            conn,
            carpeta: carpeta.to_path_buf(),
            meta,
        },
        llave,
    ))
}

/// Abre con la llave guardada (llavero del sistema).
pub fn abrir(carpeta: &Path, llave: &Llave) -> Result<Libreria> {
    let meta = leer_meta(carpeta)?;
    let conn = db::abrir(&carpeta.join(ARCHIVO_DB), llave)?;
    Ok(Libreria {
        conn,
        carpeta: carpeta.to_path_buf(),
        meta,
    })
}

/// Abre con la contraseña maestra (otro PC, restauración, o llavero vacío). Devuelve también la llave.
pub fn abrir_con_contrasena(carpeta: &Path, contrasena: &str) -> Result<(Libreria, Llave)> {
    let meta = leer_meta(carpeta)?;
    let sal = hex::decode(&meta.sal).map_err(|_| Error::Validacion("Los metadatos de la carpeta están dañados".into()))?;
    let llave = Llave::derivar(contrasena, &sal)?;
    let lib = abrir(carpeta, &llave)?;
    Ok((lib, llave))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crear_y_volver_a_abrir() {
        let dir = tempfile::tempdir().unwrap();
        let c = dir.path().join("Librería SIGLO XXI");
        let (lib, llave) = crear(&c, "pétalos 2026", "SIGLO XXI").unwrap();
        assert_eq!(lib.meta.tienda, "SIGLO XXI");
        assert!(c.join(DIR_PORTADAS).is_dir() && c.join(DIR_RESPALDOS).is_dir());
        drop(lib);
        assert!(existe(&c));
        // con la llave del llavero
        assert!(abrir(&c, &llave).is_ok());
        // con la contraseña (otro PC)
        assert!(abrir_con_contrasena(&c, "pétalos 2026").is_ok());
        assert!(matches!(abrir_con_contrasena(&c, "pétalos 2025"), Err(Error::LlaveIncorrecta)));
        // no se puede crear encima
        assert!(crear(&c, "otra contraseña", "X").is_err());
        // al consolidar, el WAL queda vacío y la base principal completa
        let lib = abrir(&c, &llave).unwrap();
        lib.conn.execute("INSERT INTO config (clave, valor) VALUES ('x', 'y')", []).unwrap();
        lib.consolidar().unwrap();
        let wal = c.join(format!("{ARCHIVO_DB}-wal"));
        assert!(!wal.exists() || std::fs::metadata(&wal).unwrap().len() == 0);
    }

    #[test]
    fn valida_contrasena_y_tienda() {
        let dir = tempfile::tempdir().unwrap();
        assert!(crear(dir.path(), "corta", "SIGLO XXI").is_err());
        assert!(crear(dir.path(), "suficientemente larga", "  ").is_err());
    }
}
