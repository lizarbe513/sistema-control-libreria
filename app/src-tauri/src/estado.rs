//! Estado de la app: en qué fase está (sin configurar, bloqueada o abierta) y la sesión activa.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
}

impl Abierta {
    pub fn nueva(lib: Libreria) -> Self {
        Abierta {
            lib,
            sesion: None,
            intentos: Intentos::default(),
        }
    }

    pub fn usuaria(&self) -> Result<&Usuaria> {
        self.sesion
            .as_ref()
            .ok_or_else(|| Error::Permiso("hacer esto sin iniciar sesión".into()))
    }

    pub fn duena(&self, accion: &str) -> Result<&Usuaria> {
        let u = self.usuaria()?;
        if u.rol != Rol::Duena {
            return Err(Error::Permiso(accion.into()));
        }
        Ok(u)
    }
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
        let _ = std::fs::write(
            ruta,
            serde_json::to_string(&Recordada {
                carpeta: carpeta.to_path_buf(),
            })
            .unwrap_or_default(),
        );
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
    Fase::Bloqueada {
        carpeta: rec.carpeta,
        tienda: meta.tienda,
    }
}

/// Las portadas se sirven por el protocolo de assets solo desde la carpeta activa.
pub fn permitir_portadas(app: &AppHandle, lib: &Libreria) {
    let _ = app.asset_protocol_scope().allow_directory(lib.ruta_portadas(), false);
}
