//! Estado de la app: en qué fase está (sin configurar, bloqueada o abierta) y la sesión activa.

use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use libreria_core::busqueda::Indice;
use libreria_core::carpeta::{self, Libreria};
use libreria_core::usuarios::{Intentos, Rol, Usuaria};
use libreria_core::{Error, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::llavero;

pub struct Abierta {
    pub lib: Libreria,
    pub sesion: Option<Usuaria>,
    pub intentos: Intentos,
    /// Índice de búsqueda; se descarta cuando cambia el inventario y se rehace al buscar.
    pub indice: Option<Indice>,
}

impl Abierta {
    pub fn nueva(lib: Libreria) -> Self {
        Abierta { lib, sesion: None, intentos: Intentos::default(), indice: None }
    }

    pub fn indice(&mut self) -> Result<&Indice> {
        if self.indice.is_none() {
            self.indice = Some(Indice::construir(&self.lib.conn)?);
        }
        Ok(self.indice.as_ref().expect("índice recién construido"))
    }

    /// Solo la Dueña ve costos.
    pub fn ve_costos(&self) -> bool {
        self.usuaria().is_ok_and(|u| u.rol == Rol::Duena)
    }

    /// La Dueña siempre; los vendedores, si ella lo permitió en Ajustes.
    pub fn puede_editar_libros(&self) -> Result<Usuaria> {
        let u = self.usuaria()?;
        if u.rol == Rol::Duena || vendedores_editan(&self.lib.conn) {
            Ok(u)
        } else {
            Err(Error::Permiso("agregar o editar libros (pídeselo a la Dueña)".into()))
        }
    }

    /// Quién está actuando: si la orden viene de un celular, **solo** la sesión de ese celular (aunque todavía no haya
    /// entrado: nunca hereda la del PC); si no, la del PC.
    pub fn usuaria(&self) -> Result<Usuaria> {
        let u = match SESION_REMOTA.with(|s| s.borrow().clone()) {
            Some(del_celular) => del_celular,
            None => self.sesion.clone(),
        };
        u.ok_or_else(|| Error::Permiso("hacer esto sin iniciar sesión".into()))
    }

    pub fn duena(&self, accion: &str) -> Result<Usuaria> {
        let u = self.usuaria()?;
        if u.rol != Rol::Duena {
            return Err(Error::Permiso(accion.into()));
        }
        Ok(u)
    }

    /// ¿Esta orden viene de un celular? (Entonces la sesión del PC no se toca.)
    pub fn es_remota(&self) -> bool {
        SESION_REMOTA.with(|s| s.borrow().is_some())
    }
}

thread_local! {
    /// `None`: una orden del PC. `Some(sesión)`: una orden de un celular (con su sesión, o sin ella si aún no entró), en
    /// ESTE hilo. Los comandos del PC corren en otros hilos y nunca lo ven: así el celular y el PC no se mezclan.
    static SESION_REMOTA: RefCell<Option<Option<Usuaria>>> = const { RefCell::new(None) };
}

/// Ejecuta `f` (síncrona, en este mismo hilo) actuando como `usuaria`, la sesión de un celular.
pub fn como_celular<T>(usuaria: Option<Usuaria>, f: impl FnOnce() -> T) -> T {
    struct Limpiar;
    impl Drop for Limpiar {
        fn drop(&mut self) {
            SESION_REMOTA.with(|s| *s.borrow_mut() = None);
        }
    }
    SESION_REMOTA.with(|s| *s.borrow_mut() = Some(usuaria));
    let _limpiar = Limpiar;
    f()
}

pub enum Fase {
    SinConfigurar,
    Bloqueada { carpeta: PathBuf, tienda: String },
    Abierta(Box<Abierta>),
}

pub struct Estado(pub Mutex<Fase>);

/// Recuerda qué carpeta de datos usa este PC.
#[derive(Serialize, Deserialize)]
struct Recordada {
    carpeta: PathBuf,
}

fn archivo_recordada(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("carpeta.json"))
}

pub fn recordar_carpeta(app: &AppHandle, carpeta: &Path) {
    if let Some(ruta) = archivo_recordada(app) {
        if let Some(dir) = ruta.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(ruta, serde_json::to_string(&Recordada { carpeta: carpeta.to_path_buf() }).unwrap_or_default());
    }
}

/// Al arrancar: si este PC ya tiene una carpeta y la llave está en el llavero, la abre sola.
pub fn fase_inicial(app: &AppHandle) -> Fase {
    let Some(ruta) = archivo_recordada(app) else {
        return Fase::SinConfigurar;
    };
    let Ok(texto) = std::fs::read_to_string(ruta) else {
        return Fase::SinConfigurar;
    };
    let Ok(rec) = serde_json::from_str::<Recordada>(&texto) else {
        return Fase::SinConfigurar;
    };
    if !carpeta::existe(&rec.carpeta) {
        return Fase::SinConfigurar;
    }
    let Ok(meta) = carpeta::leer_meta(&rec.carpeta) else {
        return Fase::SinConfigurar;
    };
    if let Some(llave) = llavero::leer(&meta.id)
        && let Ok(lib) = carpeta::abrir(&rec.carpeta, &llave)
    {
        permitir_portadas(app, &lib);
        return Fase::Abierta(Box::new(Abierta::nueva(lib)));
    }
    Fase::Bloqueada { carpeta: rec.carpeta, tienda: meta.tienda }
}

/// Las portadas se sirven por el protocolo de assets solo desde la carpeta activa.
pub fn permitir_portadas(app: &AppHandle, lib: &Libreria) {
    let _ = app.asset_protocol_scope().allow_directory(lib.ruta_portadas(), false);
}

pub const CLAVE_VENDEDORES_EDITAN: &str = "vendedores_editan_libros";

pub fn vendedores_editan(conn: &libreria_core::rusqlite::Connection) -> bool {
    conn.query_row("SELECT valor FROM config WHERE clave = ?1", [CLAVE_VENDEDORES_EDITAN], |f| f.get::<_, String>(0))
        .is_ok_and(|v| v == "1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use libreria_core::usuarios;

    #[test]
    fn el_celular_nunca_hereda_la_sesion_del_pc() {
        let dir = tempfile::tempdir().unwrap();
        let (lib, _) = carpeta::crear(&dir.path().join("L"), "contraseña buena", "SIGLO XXI").unwrap();
        let duena = usuarios::crear(&lib.conn, "Marisol", Rol::Duena, "2468").unwrap();
        let vend = usuarios::crear(&lib.conn, "Luis", Rol::Vendedor, "1357").unwrap();
        let mut a = Abierta::nueva(lib);
        a.sesion = Some(duena.clone());
        // en el PC: la sesión del PC
        assert_eq!(a.usuaria().unwrap().id, duena.id);
        assert!(a.ve_costos());
        // un celular que todavía no entró: sin sesión, aunque el PC tenga la suya
        como_celular(None, || {
            assert!(a.usuaria().is_err());
            assert!(a.duena("x").is_err());
            assert!(!a.ve_costos());
            assert!(a.es_remota());
        });
        // un celular con una vendedora: es ella, no la Dueña del PC
        como_celular(Some(vend.clone()), || {
            assert_eq!(a.usuaria().unwrap().id, vend.id);
            assert!(a.duena("x").is_err());
            assert!(!a.ve_costos());
        });
        // al terminar, todo vuelve a ser del PC
        assert_eq!(a.usuaria().unwrap().id, duena.id);
        assert!(!a.es_remota());
        // y otro hilo (otra orden del PC al mismo tiempo) no ve la sesión del celular
        como_celular(Some(vend.clone()), || {
            let otro = std::thread::spawn(|| SESION_REMOTA.with(|s| s.borrow().is_none())).join().unwrap();
            assert!(otro, "el otro hilo no está en una orden de celular");
        });
    }
}
