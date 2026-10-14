//! Núcleo de la Librería SIGLO XXI: base cifrada, dominio y reglas de negocio.
//! No depende de Tauri, así se prueba con `cargo test` y lo reutilizan la app y el servidor LAN.

pub mod carpeta;
pub mod db;
pub mod error;
pub mod llave;
pub mod usuarios;

pub use error::{Error, Result};
