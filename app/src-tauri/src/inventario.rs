//! Comandos del inventario, la búsqueda, las portadas y la tienda en bloques (hito 2).

use std::path::PathBuf;

use libreria_core::busqueda::{self, Filtros};
use libreria_core::isbn::{self, Sugerencia};
use libreria_core::libros::{self, Categoria, Contadores, Libro, LibroEntrada};
use libreria_core::tienda::{self, Plantilla, Tienda};
use libreria_core::{Error, Result, portadas};
use serde::Serialize;
use tauri::State;

use crate::estado::{Abierta, CLAVE_VENDEDORES_EDITAN, Estado, Fase, vendedores_editan};

type Res<T> = std::result::Result<T, Error>;

fn con_abierta<T>(estado: &State<Estado>, f: impl FnOnce(&mut Abierta) -> Result<T>) -> Res<T> {
    let mut fase = estado.0.lock().map_err(|_| Error::Validacion("Estado interno dañado".into()))?;
    match &mut *fase {
        Fase::Abierta(a) => f(a),
        _ => Err(Error::Validacion("La librería todavía no está abierta".into())),
    }
}

#[tauri::command]
pub fn categorias(estado: State<Estado>) -> Res<Vec<Categoria>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        libros::categorias(&a.lib.conn)
    })
}

#[tauri::command]
pub fn libros_buscar(estado: State<Estado>, consulta: String, filtros: Option<Filtros>) -> Res<Vec<Libro>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        let ver = a.ve_costos();
        a.indice()?;
        let indice = a.indice.as_ref().expect("índice");
        busqueda::buscar(&a.lib.conn, indice, &consulta, &filtros.unwrap_or_default(), ver)
    })
}

#[tauri::command]
pub fn libro_obtener(estado: State<Estado>, id: i64) -> Res<Libro> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        libros::obtener(&a.lib.conn, id, a.ve_costos())
    })
}

#[tauri::command]
pub fn libro_guardar(estado: State<Estado>, entrada: LibroEntrada) -> Res<Libro> {
    con_abierta(&estado, |a| {
        let yo = a.puede_editar_libros()?.id;
        let ver = a.ve_costos();
        let l = libros::guardar(&mut a.lib.conn, &entrada, Some(yo), ver)?;
        a.indice = None;
        Ok(l)
    })
}

#[tauri::command]
pub fn libro_desactivar(estado: State<Estado>, id: i64) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("dar de baja libros")?;
        libros::desactivar(&a.lib.conn, id)?;
        a.indice = None;
        Ok(())
    })
}

#[tauri::command]
pub fn stock_ajustar(estado: State<Estado>, id: i64, delta: i64, motivo: String, nota: Option<String>) -> Res<Libro> {
    con_abierta(&estado, |a| {
        let yo = a.puede_editar_libros()?.id;
        let ver = a.ve_costos();
        let l = libros::ajustar_stock(&mut a.lib.conn, id, delta, &motivo, nota.as_deref().unwrap_or(""), Some(yo), ver)?;
        a.indice = None;
        Ok(l)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumen {
    contadores: Contadores,
    stock_bajo: Vec<Libro>,
}

#[tauri::command]
pub fn inventario_resumen(estado: State<Estado>) -> Res<Resumen> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        Ok(Resumen { contadores: libros::contadores(&a.lib.conn)?, stock_bajo: libros::stock_bajo(&a.lib.conn, 8, a.ve_costos())? })
    })
}

/// Datos del libro desde Open Library / Google Books (no toca la base: no bloquea a nadie).
#[tauri::command]
pub async fn isbn_consultar(isbn: String) -> Res<Sugerencia> {
    isbn::consultar(&isbn).await
}

fn guardar_portada(estado: &State<Estado>, id: i64, bytes: &[u8]) -> Res<Libro> {
    con_abierta(estado, |a| {
        a.puede_editar_libros()?;
        libros::obtener(&a.lib.conn, id, false)?;
        let nombre = portadas::guardar(&a.lib.ruta_portadas(), id, bytes)?;
        libros::fijar_portada(&a.lib.conn, id, Some(&nombre))?;
        libros::obtener(&a.lib.conn, id, a.ve_costos())
    })
}

#[tauri::command]
pub async fn portada_desde_url(estado: State<'_, Estado>, id: i64, url: String) -> Res<Libro> {
    // la descarga va fuera del candado: la app sigue respondiendo mientras baja
    let bytes = portadas::descargar(&url).await?;
    guardar_portada(&estado, id, &bytes)
}

#[tauri::command]
pub fn portada_desde_archivo(estado: State<Estado>, id: i64, ruta: String) -> Res<Libro> {
    let bytes = std::fs::read(PathBuf::from(&ruta)).map_err(|_| Error::Validacion("No se pudo leer ese archivo".into()))?;
    guardar_portada(&estado, id, &bytes)
}

#[tauri::command]
pub fn portada_quitar(estado: State<Estado>, id: i64) -> Res<Libro> {
    con_abierta(&estado, |a| {
        a.puede_editar_libros()?;
        if let Some(p) = libros::obtener(&a.lib.conn, id, false)?.portada {
            let _ = std::fs::remove_file(a.lib.ruta_portadas().join(p));
        }
        libros::fijar_portada(&a.lib.conn, id, None)?;
        libros::obtener(&a.lib.conn, id, a.ve_costos())
    })
}

/// Carpeta de portadas (la interfaz arma las URL del protocolo de assets).
#[tauri::command]
pub fn ruta_portadas(estado: State<Estado>) -> Res<String> {
    con_abierta(&estado, |a| Ok(a.lib.ruta_portadas().to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn tienda_cargar(estado: State<Estado>) -> Res<Option<Tienda>> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        tienda::cargar(&a.lib.conn)
    })
}

#[tauri::command]
pub fn tienda_guardar(estado: State<Estado>, tienda: Tienda) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("diseñar la tienda")?;
        tienda::guardar(&mut a.lib.conn, &tienda)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plantillas {
    lista: Vec<Plantilla>,
    defecto: Option<String>,
}

#[tauri::command]
pub fn plantillas_listar(estado: State<Estado>) -> Res<Plantillas> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        Ok(Plantillas { lista: tienda::plantillas(&a.lib.conn)?, defecto: tienda::plantilla_defecto(&a.lib.conn)? })
    })
}

#[tauri::command]
pub fn plantilla_guardar(estado: State<Estado>, nombre: String, tienda: Tienda) -> Res<Plantilla> {
    con_abierta(&estado, |a| {
        a.duena("guardar plantillas de la tienda")?;
        tienda::guardar_plantilla(&a.lib.conn, &nombre, &tienda)
    })
}

#[tauri::command]
pub fn plantilla_borrar(estado: State<Estado>, id: String) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("borrar plantillas")?;
        tienda::borrar_plantilla(&a.lib.conn, &id)
    })
}

#[tauri::command]
pub fn plantilla_defecto(estado: State<Estado>, id: Option<String>) -> Res<()> {
    con_abierta(&estado, |a| {
        a.duena("cambiar la plantilla por defecto")?;
        tienda::fijar_plantilla_defecto(&a.lib.conn, id.as_deref())
    })
}

/// Lee (y, si se pasa `valor`, cambia) si los vendedores pueden agregar y editar libros.
#[tauri::command]
pub fn permiso_vendedores_editan(estado: State<Estado>, valor: Option<bool>) -> Res<bool> {
    con_abierta(&estado, |a| {
        a.usuaria()?;
        if let Some(v) = valor {
            a.duena("cambiar los permisos")?;
            a.lib.conn.execute(
                "INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = ?2",
                [CLAVE_VENDEDORES_EDITAN, if v { "1" } else { "0" }],
            )?;
        }
        Ok(vendedores_editan(&a.lib.conn))
    })
}
