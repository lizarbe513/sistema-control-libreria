//! Comandos de reportes y exportación a CSV (hito 5). Solo la Dueña.

use libreria_core::Error;
use libreria_core::reportes::{self, Consulta, Reporte, TipoCsv};
use tauri::State;

use crate::estado::{Estado, Fase};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut crate::estado::Abierta) -> libreria_core::Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn reporte(estado: State<Estado>, consulta: Consulta) -> Res<Reporte> {
    con_abierta(&estado, |a| {
        a.duena("ver los reportes")?;
        reportes::reporte(&a.lib.conn, &consulta)
    })
}

/// Guarda el CSV en la ruta elegida por la usuaria (con BOM, para que Excel lea bien las tildes).
#[tauri::command]
pub fn reporte_exportar(estado: State<Estado>, tipo: TipoCsv, consulta: Consulta, ruta: String) -> Res<String> {
    let contenido = con_abierta(&estado, |a| {
        a.duena("exportar los reportes")?;
        reportes::csv(&a.lib.conn, tipo, &consulta)
    })?;
    let mut ruta = std::path::PathBuf::from(ruta);
    if ruta.extension().is_none_or(|e| !e.eq_ignore_ascii_case("csv")) {
        ruta.set_extension("csv");
    }
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(contenido.as_bytes());
    std::fs::write(&ruta, bytes).map_err(|e| Error::Validacion(format!("No se pudo guardar el archivo: {e}")))?;
    Ok(ruta.to_string_lossy().into_owned())
}
