//! Llave de la base cifrada: 32 bytes derivados de la contraseña maestra con Argon2id.
//!
//! SQLCipher recibe la llave «cruda» (`x'…'`), así que no aplica su propio PBKDF2: toda la
//! resistencia a fuerza bruta la da Argon2id con parámetros altos (64 MiB, 3 pasadas).

use argon2::{Algorithm, Argon2, Params, Version};

use crate::error::{Error, Result};

pub const LARGO_SAL: usize = 16;

/// Llave de 32 bytes. Se borra de la memoria al soltarse.
#[derive(Clone)]
pub struct Llave([u8; 32]);

impl Llave {
    /// Deriva la llave desde la contraseña maestra y la sal de la carpeta.
    pub fn derivar(contrasena: &str, sal: &[u8]) -> Result<Llave> {
        let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| Error::Cripto(e.to_string()))?;
        let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let mut llave = [0u8; 32];
        argon.hash_password_into(contrasena.as_bytes(), sal, &mut llave).map_err(|e| Error::Cripto(e.to_string()))?;
        Ok(Llave(llave))
    }

    /// Recupera una llave guardada en el llavero del sistema (texto hexadecimal).
    pub fn desde_hex(texto: &str) -> Result<Llave> {
        let bytes = hex::decode(texto.trim()).map_err(|_| Error::LlaveIncorrecta)?;
        let arr: [u8; 32] = bytes.try_into().map_err(|_| Error::LlaveIncorrecta)?;
        Ok(Llave(arr))
    }

    pub fn a_hex(&self) -> String {
        hex::encode(self.0)
    }

    /// Sentencia `PRAGMA rekey`: cambia la llave de una base ya abierta.
    pub(crate) fn pragma_rekey(&self) -> String {
        format!("PRAGMA rekey = \"x'{}'\";", self.a_hex())
    }

    /// Sentencia `PRAGMA key` con la llave cruda.
    pub(crate) fn pragma(&self) -> String {
        format!("PRAGMA key = \"x'{}'\";", self.a_hex())
    }
}

impl Drop for Llave {
    fn drop(&mut self) {
        // borrado volátil para que el compilador no lo omita
        for b in self.0.iter_mut() {
            unsafe { std::ptr::write_volatile(b, 0) };
        }
    }
}

impl std::fmt::Debug for Llave {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Llave(…)")
    }
}

/// Sal aleatoria para una carpeta nueva.
pub fn nueva_sal() -> Result<[u8; LARGO_SAL]> {
    let mut sal = [0u8; LARGO_SAL];
    getrandom::fill(&mut sal).map_err(|e| Error::Cripto(e.to_string()))?;
    Ok(sal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn misma_contrasena_y_sal_dan_la_misma_llave() {
        let sal = [7u8; LARGO_SAL];
        let a = Llave::derivar("flores rosadas", &sal).unwrap();
        let b = Llave::derivar("flores rosadas", &sal).unwrap();
        let c = Llave::derivar("flores rosada", &sal).unwrap();
        assert_eq!(a.a_hex(), b.a_hex());
        assert_ne!(a.a_hex(), c.a_hex());
        assert_eq!(a.a_hex().len(), 64);
    }

    #[test]
    fn hex_ida_y_vuelta() {
        let a = Llave::derivar("x", &nueva_sal().unwrap()).unwrap();
        assert_eq!(Llave::desde_hex(&a.a_hex()).unwrap().a_hex(), a.a_hex());
        assert!(Llave::desde_hex("zz").is_err());
    }
}
