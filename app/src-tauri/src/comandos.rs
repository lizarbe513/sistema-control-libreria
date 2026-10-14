//! Comandos que llama la interfaz con `invoke`. Los permisos se comprueban aquí, no solo en la interfaz.

use std::path::PathBuf;

use libreria_core::carpeta;
use libreria_core::usuarios::{self, Rol, Usuaria};
use libreria_core::{Error, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::estado::{Abierta, Estado, Fase, permitir_portadas, recordar_carpeta};
use crate::llavero;

type Res<T> = std::result::Result<T, Error>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoInicial {
    /// "configurar" | "desbloquear" | "entrar" | "sesion"
    fase: &'static str,
    carpeta: Option<String>,
    carpeta_sugerida: String,
    tienda: Option<String>,
    usuaria: Option<Usuaria>,
    /// false si este equipo no tiene llavero: pedirá la contraseña maestra al abrir.
    llavero: bool,
}

fn sugerida(app: &AppHandle) -> String {
    app.path()
        .document_dir()
        .map(|d| d.join("Librería SIGLO XXI"))
        .unwrap_or_else(|_| PathBuf::from("Librería SIGLO XXI"))
        .to_string_lossy()
        .into_owned()
}

fn describir(app: &AppHandle, fase: &Fase, llavero: bool) -> EstadoInicial {
    let base = EstadoInicial {
        fase: "configurar",
        carpeta: None,
        carpeta_sugerida: sugerida(app),
        tienda: None,
        usuaria: None,
        llavero,
    };
    match fase {
        Fase::SinConfigurar => base,
        Fase::Bloqueada { carpeta, tienda } => EstadoInicial {
            fase: "desbloquear",
            carpeta: Some(carpeta.to_string_lossy().into_owned()),
            tienda: Some(tienda.clone()),
            ..base
        },
        Fase::Abierta(a) => EstadoInicial {
            fase: if a.sesion.is_some() { "sesion" } else { "entrar" },
            carpeta: Some(a.lib.carpeta.to_string_lossy().into_owned()),
            tienda: Some(a.lib.meta.tienda.clone()),
            usuaria: a.sesion.clone(),
            ..base
        },
    }
}

/// Ejecuta `f` con la librería abierta.
fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut Abierta) -> Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn estado_inicial(app: AppHandle, estado: State<Estado>) -> Res<EstadoInicial> {
    let fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    Ok(describir(&app, &fase, true))
}

/// Primer arranque: crea la carpeta, la base cifrada y la cuenta de la Dueña (que queda con la sesión iniciada).
#[tauri::command]
pub fn configurar(
    app: AppHandle,
    estado: State<Estado>,
    carpeta: String,
    contrasena: String,
    tienda: String,
    nombre: String,
    pin: String,
) -> Res<EstadoInicial> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    if !matches!(*fase, Fase::SinConfigurar) {
        return Err(Error::Validacion("La librería ya está configurada".into()));
    }
    // valida el PIN antes de crear nada en disco
    if !(4..=6).contains(&pin.len()) || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(Error::Validacion("El PIN debe tener de 4 a 6 números".into()));
    }
    let ruta = PathBuf::from(carpeta.trim());
    let (lib, llave) = carpeta::crear(&ruta, &contrasena, &tienda)?;
    let duena = usuarios::crear(&lib.conn, &nombre, Rol::Duena, &pin)?;
    let en_llavero = llavero::guardar(&lib.meta.id, &llave);
    recordar_carpeta(&app, &ruta);
    permitir_portadas(&app, &lib);
    let mut abierta = Abierta::nueva(lib);
    abierta.sesion = Some(duena);
    *fase = Fase::Abierta(Box::new(abierta));
    Ok(describir(&app, &fase, en_llavero))
}

/// Abre una carpeta existente (mudanza a otro PC o restauración) con la contraseña maestra.
#[tauri::command]
pub fn abrir_carpeta(app: AppHandle, estado: State<Estado>, carpeta: String, contrasena: String) -> Res<EstadoInicial> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    let ruta = PathBuf::from(carpeta.trim());
    if !carpeta::existe(&ruta) {
        return Err(Error::Validacion("Esa carpeta no tiene datos de la librería".into()));
    }
    let (lib, llave) = carpeta::abrir_con_contrasena(&ruta, &contrasena)?;
    let en_llavero = llavero::guardar(&lib.meta.id, &llave);
    recordar_carpeta(&app, &ruta);
    permitir_portadas(&app, &lib);
    *fase = Fase::Abierta(Box::new(Abierta::nueva(lib)));
    Ok(describir(&app, &fase, en_llavero))
}

/// Desbloquea la carpeta recordada con la contraseña maestra (cuando el llavero no tiene la llave).
#[tauri::command]
pub fn desbloquear(app: AppHandle, estado: State<Estado>, contrasena: String) -> Res<EstadoInicial> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    let Fase::Bloqueada { carpeta, .. } = &*fase else {
        return Err(Error::Validacion("La librería no está bloqueada".into()));
    };
    let (lib, llave) = carpeta::abrir_con_contrasena(carpeta, &contrasena)?;
    let en_llavero = llavero::guardar(&lib.meta.id, &llave);
    permitir_portadas(&app, &lib);
    *fase = Fase::Abierta(Box::new(Abierta::nueva(lib)));
    Ok(describir(&app, &fase, en_llavero))
}

#[tauri::command]
pub fn usuarias(estado: State<Estado>) -> Res<Vec<Usuaria>> {
    // para la pantalla de entrada: sin preferencias (solo nombre, rol y avatar)
    con_abierta(&estado, |a| {
        Ok(usuarios::listar(&a.lib.conn)?
            .into_iter()
            .map(|mut u| {
                u.preferencias = serde_json::json!({});
                u
            })
            .collect())
    })
}

#[tauri::command]
pub fn iniciar_sesion(estado: State<Estado>, id: i64, pin: String) -> Res<Usuaria> {
    con_abierta(&estado, |a| {
        let u = a.intentos.iniciar_sesion(&a.lib.conn, id, &pin)?;
        a.sesion = Some(u.clone());
        Ok(u)
    })
}

#[tauri::command]
pub fn cerrar_sesion(estado: State<Estado>) -> Res<()> {
    con_abierta(&estado, |a| {
        a.sesion = None;
        Ok(())
    })
}

#[tauri::command]
pub fn preferencias_guardar(estado: State<Estado>, cambios: serde_json::Value) -> Res<serde_json::Value> {
    con_abierta(&estado, |a| {
        let id = a.usuaria()?.id;
        let p = usuarios::guardar_preferencias(&a.lib.conn, id, &cambios)?;
        if let Some(s) = a.sesion.as_mut() {
            s.preferencias = p.clone();
        }
        Ok(p)
    })
}

#[tauri::command]
pub fn usuaria_crear(estado: State<Estado>, nombre: String, rol: Rol, pin: String) -> Res<Usuaria> {
    con_abierta(&estado, |a| {
        a.duena("crear cuentas")?;
        usuarios::crear(&a.lib.conn, &nombre, rol, &pin)
    })
}

/// La Dueña cambia cualquier PIN; cada persona puede cambiar el suyo.
#[tauri::command]
pub fn usuaria_cambiar_pin(estado: State<Estado>, id: i64, pin: String) -> Res<()> {
    con_abierta(&estado, |a| {
        let yo = a.usuaria()?;
        if yo.id != id && yo.rol != Rol::Duena {
            return Err(Error::Permiso("cambiar el PIN de otra persona".into()));
        }
        usuarios::cambiar_pin(&a.lib.conn, id, &pin)
    })
}

/// Olvida la llave guardada en este equipo (la próxima vez pedirá la contraseña maestra).
#[tauri::command]
pub fn olvidar_llave(estado: State<Estado>) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("cambiar la seguridad del equipo")?;
        llavero::borrar(&a.lib.meta.id);
        Ok(())
    })
}
