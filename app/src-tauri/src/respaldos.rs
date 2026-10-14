//! Comandos de respaldos, restauración, cambio de contraseña maestra y «olvidé mi PIN» (hito 6).

use std::path::{Path, PathBuf};
use std::time::Duration;

use libreria_core::Error;
use libreria_core::carpeta::{self, Libreria};
use libreria_core::respaldos::{self, Configuracion, Respaldo, Resultado};
use libreria_core::usuarios;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::comandos::{EstadoInicial, describir};
use crate::estado::{Abierta, Estado, Fase, permitir_portadas, recordar_carpeta};
use crate::llavero;

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut Abierta) -> libreria_core::Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoRespaldos {
    configuracion: Configuracion,
    /// La carpeta externa existe ahora (pendrive conectado, carpeta de la nube…).
    externo_disponible: bool,
    carpeta_interna: String,
    interno: Vec<Respaldo>,
    externo: Vec<Respaldo>,
}

fn estado_de(lib: &Libreria) -> libreria_core::Result<EstadoRespaldos> {
    let configuracion = respaldos::configuracion(&lib.conn)?;
    let dir_externo = configuracion.externo.as_ref().map(PathBuf::from);
    let externo_disponible = dir_externo.as_ref().is_some_and(|d| d.is_dir());
    Ok(EstadoRespaldos {
        externo: dir_externo.filter(|d| d.is_dir()).map(|d| respaldos::listar(&d)).unwrap_or_default(),
        configuracion,
        externo_disponible,
        carpeta_interna: respaldos::dir_interno(&lib.carpeta).to_string_lossy().into_owned(),
        interno: respaldos::listar(&respaldos::dir_interno(&lib.carpeta)),
    })
}

#[tauri::command]
pub fn respaldo_estado(estado: State<Estado>) -> Res<EstadoRespaldos> {
    con_abierta(&estado, |a| {
        a.duena("ver los respaldos")?;
        estado_de(&a.lib)
    })
}

#[tauri::command]
pub fn respaldo_config(estado: State<Estado>, externo: Option<String>, conservar: i64) -> Res<EstadoRespaldos> {
    con_abierta(&estado, |a| {
        let yo = a.duena("cambiar los respaldos")?.clone();
        respaldos::fijar_configuracion(&a.lib.conn, externo.as_deref(), conservar, &yo)?;
        estado_de(&a.lib)
    })
}

/// Respaldo manual: al interno, al externo (si hay) y, si se elige, a otra carpeta.
#[tauri::command]
pub fn respaldo_crear(estado: State<Estado>, destino: Option<String>) -> Res<Resultado> {
    con_abierta(&estado, |a| {
        a.duena("hacer respaldos")?;
        respaldos::hacer_manual(&a.lib, destino.as_deref().map(Path::new))
    })
}

/// Abre la carpeta de respaldos del equipo en el explorador de archivos.
#[tauri::command]
pub fn respaldo_mostrar(app: AppHandle, estado: State<Estado>) -> Res<()> {
    let dir = con_abierta(&estado, |a| {
        a.duena("ver los respaldos")?;
        let d = respaldos::dir_interno(&a.lib.carpeta);
        std::fs::create_dir_all(&d)?;
        Ok(d)
    })?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| Error::Validacion(format!("No se pudo abrir la carpeta: {e}")))
}

/// Deja la carpeta abierta otra vez con la llave del llavero; si no se puede, queda bloqueada (pide la contraseña).
fn reabrir(app: &AppHandle, fase: &mut Fase, carpeta: &Path, id: &str, tienda: &str) -> bool {
    if let Some(llave) = llavero::leer(id)
        && let Ok(lib) = carpeta::abrir(carpeta, &llave)
    {
        permitir_portadas(app, &lib);
        *fase = Fase::Abierta(Box::new(Abierta::nueva(lib)));
        return true;
    }
    *fase = Fase::Bloqueada { carpeta: carpeta.to_path_buf(), tienda: tienda.to_string() };
    false
}

/// Restaura un respaldo sobre los datos actuales (solo la Dueña). Primero lo verifica con la contraseña (si falla, no se
/// toca nada ni se pierde la sesión); luego hace un respaldo de seguridad de lo actual y reemplaza. Termina sin sesión.
#[tauri::command]
pub fn respaldo_restaurar(app: AppHandle, estado: State<Estado>, zip: String, contrasena: String) -> Res<EstadoInicial> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    let (carpeta_dir, id_viejo, tienda, preparado) = match &*fase {
        Fase::Abierta(a) => {
            a.duena("restaurar un respaldo")?;
            let preparado = respaldos::preparar(Path::new(&zip), &a.lib.carpeta, &contrasena)?;
            respaldos::hacer_de_seguridad(&a.lib)?;
            (a.lib.carpeta.clone(), a.lib.meta.id.clone(), a.lib.meta.tienda.clone(), preparado)
        }
        _ => return Err(Error::Validacion("La librería todavía no está abierta".into())),
    };
    // se suelta la conexión antes de reemplazar los archivos
    *fase = Fase::Bloqueada { carpeta: carpeta_dir.clone(), tienda: tienda.clone() };
    match respaldos::aplicar(preparado) {
        Ok(_) => {
            let (lib, llave) = carpeta::abrir_con_contrasena(&carpeta_dir, &contrasena)?;
            let en_llavero = llavero::guardar(&lib.meta.id, &llave);
            permitir_portadas(&app, &lib);
            *fase = Fase::Abierta(Box::new(Abierta::nueva(lib)));
            Ok(describir(&app, &fase, en_llavero))
        }
        Err(e) => {
            // la carpeta quedó como estaba: se vuelve a abrir con la llave de siempre
            reabrir(&app, &mut fase, &carpeta_dir, &id_viejo, &tienda);
            Err(e)
        }
    }
}

/// PC nuevo: restaura un respaldo en una carpeta nueva, la abre y guarda su llave.
#[tauri::command]
pub fn respaldo_restaurar_nuevo(
    app: AppHandle,
    estado: State<Estado>,
    zip: String,
    carpeta: String,
    contrasena: String,
) -> Res<EstadoInicial> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    if matches!(&*fase, Fase::Abierta(_)) {
        return Err(Error::Validacion("Ya hay una librería abierta: restaura desde Ajustes".into()));
    }
    let ruta = PathBuf::from(carpeta.trim());
    if ruta.as_os_str().is_empty() {
        return Err(Error::Validacion("Elige la carpeta donde quedarán los datos".into()));
    }
    let (lib, llave) = respaldos::restaurar_nueva(Path::new(&zip), &ruta, &contrasena)?;
    let en_llavero = llavero::guardar(&lib.meta.id, &llave);
    recordar_carpeta(&app, &ruta);
    permitir_portadas(&app, &lib);
    *fase = Fase::Abierta(Box::new(Abierta::nueva(lib)));
    Ok(describir(&app, &fase, en_llavero))
}

/// Cambia la contraseña maestra (solo la Dueña). Antes hace un respaldo de seguridad. Devuelve si el llavero se actualizó.
#[tauri::command]
pub fn contrasena_cambiar(estado: State<Estado>, actual: String, nueva: String) -> Res<bool> {
    con_abierta(&estado, |a| {
        a.duena("cambiar la contraseña maestra")?;
        a.intentos.comprobar(0)?;
        if let Err(e) = carpeta::verificar_contrasena(&a.lib, &actual) {
            if matches!(e, Error::LlaveIncorrecta) {
                a.intentos.fallo(0);
            }
            return Err(e);
        }
        a.intentos.exito(0);
        respaldos::hacer_de_seguridad(&a.lib)?;
        let llave = carpeta::cambiar_contrasena(&a.lib, &actual, &nueva)?;
        Ok(llavero::guardar(&a.lib.meta.id, &llave))
    })
}

/// «Olvidé mi PIN»: con la contraseña maestra, la Dueña elige un PIN nuevo (sin sesión). Con límite de intentos.
#[tauri::command]
pub fn pin_recuperar(estado: State<Estado>, id: i64, contrasena: String, pin_nuevo: String) -> Res<()> {
    con_abierta(&estado, |a| {
        a.intentos.comprobar(0)?;
        // primero la contraseña maestra, después el PIN: un PIN inválido no gasta intentos
        match carpeta::verificar_contrasena(&a.lib, &contrasena) {
            Ok(_) => a.intentos.exito(0),
            Err(Error::LlaveIncorrecta) => {
                a.intentos.fallo(0);
                return Err(Error::LlaveIncorrecta);
            }
            Err(e) => return Err(e),
        }
        usuarios::restablecer_pin_duena(&a.lib.conn, id, &pin_nuevo)?;
        a.intentos.exito(id);
        Ok(())
    })
}

// ── respaldo automático ───────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AvisoRespaldo {
    hecho: bool,
    aviso: Option<String>,
}

/// Si toca (una vez al día) hace el respaldo con la librería abierta. Devuelve el resultado, si hubo.
pub fn respaldo_si_toca(app: &AppHandle) -> Option<Resultado> {
    let estado = app.state::<Estado>();
    let fase = estado.0.lock().ok()?;
    let Fase::Abierta(a) = &*fase else {
        return None;
    };
    respaldos::hacer_automatico(&a.lib).ok().flatten()
}

/// Hilo en segundo plano: revisa poco después de abrir y luego cada hora (la app puede quedar abierta varios días).
pub fn iniciar_automatico(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(20));
        loop {
            if let Some(r) = respaldo_si_toca(&app) {
                let _ = app.emit("respaldo", AvisoRespaldo { hecho: true, aviso: r.aviso });
            }
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
