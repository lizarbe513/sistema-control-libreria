//! Errores del núcleo. El mensaje (`Display`) está en español y es el que ve la usuaria.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("La contraseña maestra no es correcta")]
    LlaveIncorrecta,
    #[error("PIN incorrecto")]
    PinIncorrecto,
    #[error("Demasiados intentos. Espera {0} segundos y vuelve a probar.")]
    Bloqueado(u64),
    #[error("{0}")]
    Validacion(String),
    #[error("No tienes permiso para {0}")]
    Permiso(String),
    #[error("No se encontró {0}")]
    NoEncontrado(String),
    #[error("Error de la base de datos: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Error al actualizar la base de datos: {0}")]
    Migracion(#[from] rusqlite_migration::Error),
    #[error("Error con los archivos: {0}")]
    Io(#[from] std::io::Error),
    #[error("Datos dañados: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Error de cifrado: {0}")]
    Cripto(String),
    #[error("{0}")]
    Red(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// Error de validación con un mensaje para la usuaria.
pub fn invalido<T>(mensaje: impl Into<String>) -> Result<T> {
    Err(Error::Validacion(mensaje.into()))
}

// Para Tauri: el error viaja al frontend como su mensaje en español.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
