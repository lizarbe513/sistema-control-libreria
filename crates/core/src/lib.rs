//! Núcleo de la Librería SIGLO XXI: base cifrada, dominio y reglas de negocio.
//! No depende de Tauri, así se prueba con `cargo test` y lo reutilizan la app y el servidor LAN.

pub mod busqueda;
pub mod carpeta;
pub mod clientes;
pub mod db;
pub mod encargos;
pub mod error;
pub mod isbn;
pub mod libros;
pub mod llave;
pub mod portadas;
pub mod qr_pago;
pub mod reportes;
pub mod respaldos;
pub mod tienda;
pub mod usuarios;
pub mod ventas;

pub use error::{Error, Result};

/// Reexportado para que la app use exactamente la misma versión (con SQLCipher).
pub use rusqlite;
