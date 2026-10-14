//! La llave de la base en el llavero del sistema (Windows: Administrador de credenciales).
//! Así, en el día a día no hace falta la contraseña maestra: solo el PIN de cada usuaria.

use libreria_core::llave::Llave;

const SERVICIO: &str = "siglo-xxi-libreria";

/// Guarda la llave. Devuelve false si el llavero no está disponible (se pedirá la contraseña al abrir).
pub fn guardar(id_carpeta: &str, llave: &Llave) -> bool {
    keyring::Entry::new(SERVICIO, id_carpeta).and_then(|e| e.set_password(&llave.a_hex())).is_ok()
}

/// La llave guardada para esta carpeta, si existe.
pub fn leer(id_carpeta: &str) -> Option<Llave> {
    let texto = keyring::Entry::new(SERVICIO, id_carpeta).ok()?.get_password().ok()?;
    Llave::desde_hex(&texto).ok()
}

pub fn borrar(id_carpeta: &str) {
    if let Ok(e) = keyring::Entry::new(SERVICIO, id_carpeta) {
        let _ = e.delete_credential();
    }
}
