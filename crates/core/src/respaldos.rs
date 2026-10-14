//! Respaldos: un `.zip` con la base (que sigue **cifrada**: el zip es seguro aunque viaje a la nube), los metadatos, las
//! portadas y el QR de cobro. Hay respaldo automático diario, manual y de seguridad (antes de restaurar o cambiar la
//! contraseña). Restaurar verifica todo antes de tocar la carpeta.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::carpeta::{self, ARCHIVO_DB, ARCHIVO_META, DIR_PORTADAS, DIR_RESPALDOS, Libreria, Meta};
use crate::db;
use crate::error::{Error, Result, invalido};
use crate::llave::Llave;
use crate::usuarios::{Rol, Usuaria};

const ARCHIVO_QR: &str = "qr-yape.png";
const MANIFIESTO: &str = "respaldo.json";
const PREFIJO: &str = "respaldo-";
const TOPE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
pub const CONSERVAR_DEFECTO: i64 = 14;
const HORAS_ENTRE_AUTOMATICOS: f64 = 24.0;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Auto,
    Manual,
    Seguridad,
}

impl Tipo {
    fn texto(self) -> &'static str {
        match self {
            Tipo::Auto => "auto",
            Tipo::Manual => "manual",
            Tipo::Seguridad => "seguridad",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Respaldo {
    pub archivo: String,
    pub ruta: String,
    pub bytes: u64,
    /// Instante UTC (ISO); la interfaz lo muestra en hora local.
    pub fecha: String,
    pub tipo: Tipo,
}

#[derive(Debug, Serialize, Deserialize)]
struct Manifiesto {
    version: u32,
    fecha: String,
    tienda: String,
    id: String,
    tipo: Tipo,
}

fn ahora(conn: &Connection) -> Result<(String, String)> {
    Ok(conn
        .query_row("SELECT strftime('%Y%m%dT%H%M%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", [], |f| Ok((f.get(0)?, f.get(1)?)))?)
}

/// `respaldo-20261014T213000Z-auto.zip` → («2026-10-14T21:30:00Z», auto).
fn leer_nombre(nombre: &str) -> Option<(String, Tipo)> {
    let resto = nombre.strip_prefix(PREFIJO)?.strip_suffix(".zip")?;
    let (sello, tipo) = resto.split_once('-')?;
    let tipo = match tipo.split('-').next()? {
        "auto" => Tipo::Auto,
        "manual" => Tipo::Manual,
        "seguridad" => Tipo::Seguridad,
        _ => return None,
    };
    let b = sello.as_bytes();
    if b.len() != 16
        || b[8] != b'T'
        || b[15] != b'Z'
        || !sello[..8].bytes().all(|c| c.is_ascii_digit())
        || !sello[9..15].bytes().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let iso = format!("{}-{}-{}T{}:{}:{}Z", &sello[0..4], &sello[4..6], &sello[6..8], &sello[9..11], &sello[11..13], &sello[13..15]);
    Some((iso, tipo))
}

/// Dónde se guardan los respaldos internos.
pub fn dir_interno(carpeta: &Path) -> PathBuf {
    carpeta.join(DIR_RESPALDOS)
}

fn nombre_libre(dir: &Path, sello: &str, tipo: Tipo) -> String {
    let base = format!("{PREFIJO}{sello}-{}", tipo.texto());
    let mut n = 1;
    loop {
        let nombre = if n == 1 { format!("{base}.zip") } else { format!("{base}-{n}.zip") };
        if !dir.join(&nombre).exists() {
            return nombre;
        }
        n += 1;
    }
}

fn agregar_archivo(zip: &mut ZipWriter<File>, nombre: &str, ruta: &Path, opciones: SimpleFileOptions) -> Result<()> {
    zip.start_file(nombre, opciones).map_err(zip_err)?;
    io::copy(&mut File::open(ruta)?, zip)?;
    Ok(())
}

fn zip_err(e: zip::result::ZipError) -> Error {
    Error::Validacion(format!("No se pudo leer o escribir el respaldo: {e}"))
}

/// Crea un respaldo en `destino`. Se escribe a un temporal y se renombra al final: nunca queda un zip a medias.
pub fn crear(lib: &Libreria, destino: &Path, tipo: Tipo) -> Result<Respaldo> {
    fs::create_dir_all(destino)?;
    lib.consolidar()?; // todo lo pendiente va al archivo principal; nadie más escribe mientras se copia
    let (sello, fecha) = ahora(&lib.conn)?;
    let nombre = nombre_libre(destino, &sello, tipo);
    let tmp = destino.join(format!(".{nombre}.tmp"));
    let resultado = (|| -> Result<()> {
        let mut zip = ZipWriter::new(File::create(&tmp)?);
        let op = SimpleFileOptions::default().compression_method(CompressionMethod::Stored).large_file(true);
        let manifiesto = Manifiesto { version: 1, fecha: fecha.clone(), tienda: lib.meta.tienda.clone(), id: lib.meta.id.clone(), tipo };
        zip.start_file(MANIFIESTO, op).map_err(zip_err)?;
        zip.write_all(serde_json::to_string_pretty(&manifiesto)?.as_bytes())?;
        agregar_archivo(&mut zip, ARCHIVO_DB, &lib.carpeta.join(ARCHIVO_DB), op)?;
        agregar_archivo(&mut zip, ARCHIVO_META, &lib.carpeta.join(ARCHIVO_META), op)?;
        let qr = lib.carpeta.join(ARCHIVO_QR);
        if qr.is_file() {
            agregar_archivo(&mut zip, ARCHIVO_QR, &qr, op)?;
        }
        if let Ok(rd) = fs::read_dir(lib.ruta_portadas()) {
            for e in rd.flatten() {
                if e.path().is_file() {
                    agregar_archivo(&mut zip, &format!("{DIR_PORTADAS}/{}", e.file_name().to_string_lossy()), &e.path(), op)?;
                }
            }
        }
        zip.finish().map_err(zip_err)?.sync_all()?;
        fs::rename(&tmp, destino.join(&nombre))?;
        Ok(())
    })();
    if let Err(e) = resultado {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    let ruta = destino.join(&nombre);
    Ok(Respaldo { archivo: nombre, bytes: fs::metadata(&ruta)?.len(), ruta: ruta.to_string_lossy().into_owned(), fecha, tipo })
}

/// Los respaldos de una carpeta, del más nuevo al más viejo (por el nombre: no se abren los zips).
pub fn listar(dir: &Path) -> Vec<Respaldo> {
    let Ok(rd) = fs::read_dir(dir) else {
        return vec![];
    };
    let mut v: Vec<Respaldo> = rd
        .flatten()
        .filter_map(|e| {
            let nombre = e.file_name().to_string_lossy().into_owned();
            let (fecha, tipo) = leer_nombre(&nombre)?;
            Some(Respaldo { bytes: e.metadata().ok()?.len(), ruta: e.path().to_string_lossy().into_owned(), archivo: nombre, fecha, tipo })
        })
        .collect();
    v.sort_by(|a, b| b.fecha.cmp(&a.fecha).then(b.archivo.cmp(&a.archivo)));
    v
}

/// Borra los automáticos más viejos, dejando los últimos `conservar`. Los manuales y de seguridad no se tocan.
pub fn aplicar_retencion(dir: &Path, conservar: i64) {
    let autos: Vec<_> = listar(dir).into_iter().filter(|r| r.tipo == Tipo::Auto).collect();
    for r in autos.into_iter().skip(conservar.max(1) as usize) {
        let _ = fs::remove_file(&r.ruta);
    }
}

// ── configuración ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Configuracion {
    /// Carpeta externa (pendrive, OneDrive, Google Drive…) donde se copia cada respaldo.
    pub externo: Option<String>,
    pub conservar: i64,
    pub ultimo_auto: Option<String>,
}

fn leer(conn: &Connection, clave: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT valor FROM config WHERE clave = ?1", [clave], |f| f.get(0)).optional()?)
}

fn escribir(conn: &Connection, clave: &str, valor: Option<&str>) -> Result<()> {
    match valor {
        Some(v) => {
            conn.execute("INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = ?2", [clave, v])?
        }
        None => conn.execute("DELETE FROM config WHERE clave = ?1", [clave])?,
    };
    Ok(())
}

pub fn configuracion(conn: &Connection) -> Result<Configuracion> {
    Ok(Configuracion {
        externo: leer(conn, "respaldo_externo")?.filter(|t| !t.trim().is_empty()),
        conservar: leer(conn, "respaldo_conservar")?.and_then(|t| t.parse().ok()).unwrap_or(CONSERVAR_DEFECTO),
        ultimo_auto: leer(conn, "respaldo_ultimo_auto")?,
    })
}

/// Solo la Dueña.
pub fn fijar_configuracion(conn: &Connection, externo: Option<&str>, conservar: i64, quien: &Usuaria) -> Result<Configuracion> {
    if quien.rol != Rol::Duena {
        return Err(Error::Permiso("cambiar los respaldos".into()));
    }
    if !(3..=60).contains(&conservar) {
        return invalido("Conservar entre 3 y 60 respaldos");
    }
    let externo = externo.map(str::trim).filter(|t| !t.is_empty());
    if let Some(e) = externo
        && !Path::new(e).is_dir()
    {
        return invalido("No se encontró esa carpeta: conecta el pendrive o elige otra");
    }
    escribir(conn, "respaldo_externo", externo)?;
    escribir(conn, "respaldo_conservar", Some(&conservar.to_string()))?;
    configuracion(conn)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resultado {
    pub respaldo: Respaldo,
    /// Algo que la Dueña debe saber (p. ej. la carpeta externa no estaba disponible). El respaldo interno sí se hizo.
    pub aviso: Option<String>,
}

/// Copia el respaldo a la carpeta externa, si hay. Devuelve un aviso si no se pudo.
fn copiar_al_externo(conn: &Connection, r: &Respaldo, conservar: i64) -> Result<Option<String>> {
    let Some(externo) = configuracion(conn)?.externo else {
        return Ok(None);
    };
    let dir = PathBuf::from(&externo);
    if !dir.is_dir() {
        return Ok(Some(format!("No se encontró la carpeta externa de respaldos ({externo}). ¿Está conectado el pendrive?")));
    }
    match fs::copy(&r.ruta, dir.join(&r.archivo)) {
        Ok(_) => {
            aplicar_retencion(&dir, conservar);
            Ok(None)
        }
        Err(e) => Ok(Some(format!("No se pudo copiar el respaldo a la carpeta externa: {e}"))),
    }
}

/// Respaldo manual: al interno y al externo. Con `otra` además se guarda una copia en esa carpeta.
pub fn hacer_manual(lib: &Libreria, otra: Option<&Path>) -> Result<Resultado> {
    let r = crear(lib, &dir_interno(&lib.carpeta), Tipo::Manual)?;
    let conf = configuracion(&lib.conn)?;
    let mut aviso = copiar_al_externo(&lib.conn, &r, conf.conservar)?;
    if let Some(o) = otra {
        fs::create_dir_all(o)?;
        if let Err(e) = fs::copy(&r.ruta, o.join(&r.archivo)) {
            aviso = Some(format!("No se pudo guardar la copia en esa carpeta: {e}"));
        }
    }
    Ok(Resultado { respaldo: r, aviso })
}

/// Antes de restaurar o cambiar la contraseña: nunca se borra solo.
pub fn hacer_de_seguridad(lib: &Libreria) -> Result<Respaldo> {
    crear(lib, &dir_interno(&lib.carpeta), Tipo::Seguridad)
}

/// ¿Ya pasó un día desde el último respaldo automático?
pub fn toca_automatico(conn: &Connection) -> Result<bool> {
    let Some(ultimo) = configuracion(conn)?.ultimo_auto else {
        return Ok(true);
    };
    let horas: Option<f64> = conn.query_row("SELECT (julianday('now') - julianday(?1)) * 24", [&ultimo], |f| f.get(0)).optional()?;
    Ok(horas.is_none_or(|h| h >= HORAS_ENTRE_AUTOMATICOS || h < 0.0))
}

/// El respaldo diario: si toca, hace el interno, lo copia al externo y aplica la retención. `None` si todavía no toca.
pub fn hacer_automatico(lib: &Libreria) -> Result<Option<Resultado>> {
    if !toca_automatico(&lib.conn)? {
        return Ok(None);
    }
    let r = crear(lib, &dir_interno(&lib.carpeta), Tipo::Auto)?;
    let conf = configuracion(&lib.conn)?;
    escribir(&lib.conn, "respaldo_ultimo_auto", Some(&r.fecha))?;
    aplicar_retencion(&dir_interno(&lib.carpeta), conf.conservar);
    let aviso = copiar_al_externo(&lib.conn, &r, conf.conservar)?;
    Ok(Some(Resultado { respaldo: r, aviso }))
}

// ── restaurar ─────────────────────────────────────────────────────────────────

fn nombre_permitido(n: &str) -> bool {
    match n {
        MANIFIESTO | ARCHIVO_DB | ARCHIVO_META | ARCHIVO_QR => true,
        _ => n
            .strip_prefix("portadas/")
            .is_some_and(|f| !f.is_empty() && !f.starts_with('.') && !f.contains(['/', '\\', ':']) && !f.contains("..")),
    }
}

fn limpiar(ruta: &Path) {
    let _ = fs::remove_dir_all(ruta);
}

/// Extrae el zip a `staging`, verificando nombres y tamaños. Devuelve el `Meta` del respaldo.
fn extraer(zip: &Path, staging: &Path) -> Result<Meta> {
    let mut arch = ZipArchive::new(File::open(zip).map_err(|_| Error::Validacion("No se pudo abrir ese archivo".into()))?)
        .map_err(|_| Error::Validacion("Ese archivo no es un respaldo de la librería (zip dañado o de otro programa)".into()))?;
    let mut total: u64 = 0;
    let mut vistos = Vec::new();
    for i in 0..arch.len() {
        let e = arch.by_index(i).map_err(zip_err)?;
        if e.is_dir() {
            continue;
        }
        let nombre = e.name().map(|n| n.into_owned()).map_err(zip_err)?;
        if !nombre_permitido(&nombre) {
            return invalido("Ese archivo no es un respaldo de la librería: trae archivos que no corresponden");
        }
        total = total.saturating_add(e.size());
        vistos.push(nombre);
    }
    if total > TOPE_BYTES {
        return invalido("Ese respaldo es demasiado grande");
    }
    for req in [MANIFIESTO, ARCHIVO_DB, ARCHIVO_META] {
        if !vistos.iter().any(|v| v == req) {
            return invalido("Ese archivo no es un respaldo de la librería: le faltan partes");
        }
    }
    limpiar(staging);
    fs::create_dir_all(staging.join(DIR_PORTADAS))?;
    for i in 0..arch.len() {
        let mut e = arch.by_index(i).map_err(zip_err)?;
        if e.is_dir() {
            continue;
        }
        let destino = staging.join(e.name().map_err(zip_err)?.as_ref());
        let mut f = File::create(&destino)?;
        io::copy(&mut (&mut e).take(TOPE_BYTES), &mut f)?;
    }
    let meta: Meta = serde_json::from_str(&fs::read_to_string(staging.join(ARCHIVO_META))?)?;
    Ok(meta)
}

/// Restaura el zip en `destino` (una carpeta de datos existente o una nueva). Antes de tocar nada verifica que el
/// respaldo se abre con `contrasena`; si algo falla, la carpeta queda como estaba. La base no debe estar abierta.
pub fn restaurar_en(zip: &Path, destino: &Path, contrasena: &str) -> Result<Meta> {
    fs::create_dir_all(destino)?;
    let staging = destino.join(".restaurando");
    let hecho = (|| -> Result<Meta> {
        let meta = extraer(zip, &staging)?;
        let sal = hex::decode(&meta.sal).map_err(|_| Error::Validacion("El respaldo está dañado (metadatos)".into()))?;
        let llave = Llave::derivar(contrasena, &sal)?;
        {
            // se abre una copia de verdad: con la contraseña equivocada, o dañada, falla aquí y no se cambia nada
            let c = db::abrir(&staging.join(ARCHIVO_DB), &llave)?;
            c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        }
        for sufijo in ["-wal", "-shm"] {
            let _ = fs::remove_file(staging.join(format!("{ARCHIVO_DB}{sufijo}")));
        }
        intercambiar(&staging, destino)?;
        Ok(meta)
    })();
    limpiar(&staging);
    hecho
}

fn intercambiar(staging: &Path, destino: &Path) -> Result<()> {
    let db_vieja = destino.join(format!("{ARCHIVO_DB}.anterior"));
    let por_borrar = [db_vieja.clone(), destino.join(format!("{DIR_PORTADAS}.anterior"))];
    for p in &por_borrar {
        if p.is_dir() {
            limpiar(p);
        } else {
            let _ = fs::remove_file(p);
        }
    }
    // la base: la vieja se aparta, la nueva entra; si algo falla, se devuelve
    let actual = destino.join(ARCHIVO_DB);
    let habia = actual.is_file();
    if habia {
        fs::rename(&actual, &db_vieja)?;
    }
    for sufijo in ["-wal", "-shm"] {
        let _ = fs::remove_file(destino.join(format!("{ARCHIVO_DB}{sufijo}")));
    }
    if let Err(e) = fs::rename(staging.join(ARCHIVO_DB), &actual) {
        if habia {
            let _ = fs::rename(&db_vieja, &actual);
        }
        return Err(e.into());
    }
    fs::rename(staging.join(ARCHIVO_META), destino.join(ARCHIVO_META))?;
    // portadas y QR
    let portadas = destino.join(DIR_PORTADAS);
    let portadas_viejas = destino.join(format!("{DIR_PORTADAS}.anterior"));
    if portadas.is_dir() {
        fs::rename(&portadas, &portadas_viejas)?;
    }
    fs::rename(staging.join(DIR_PORTADAS), &portadas)?;
    let _ = fs::remove_file(destino.join(ARCHIVO_QR));
    if staging.join(ARCHIVO_QR).is_file() {
        fs::rename(staging.join(ARCHIVO_QR), destino.join(ARCHIVO_QR))?;
    }
    fs::create_dir_all(destino.join(DIR_RESPALDOS))?;
    for p in &por_borrar {
        if p.is_dir() {
            limpiar(p);
        } else {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}

/// Restaura en una carpeta nueva (PC nuevo): la carpeta no debe tener ya una librería. Devuelve la carpeta abierta y su llave.
pub fn restaurar_nueva(zip: &Path, destino: &Path, contrasena: &str) -> Result<(Libreria, Llave)> {
    if carpeta::existe(destino) {
        return invalido("Esa carpeta ya tiene datos de una librería: elige otra carpeta vacía");
    }
    restaurar_en(zip, destino, contrasena)?;
    carpeta::abrir_con_contrasena(destino, contrasena)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::usuarios::crear as crear_usuaria;

    fn mundo() -> (tempfile::TempDir, PathBuf, Libreria) {
        let dir = tempfile::tempdir().unwrap();
        let c = dir.path().join("Librería");
        let (lib, _) = carpeta::crear(&c, "contraseña buena", "SIGLO XXI").unwrap();
        fs::write(c.join(DIR_PORTADAS).join("1-1.jpg"), b"portada uno").unwrap();
        fs::write(c.join(ARCHIVO_QR), b"qr").unwrap();
        (dir, c, lib)
    }

    fn duena(lib: &Libreria) -> Usuaria {
        crear_usuaria(&lib.conn, "Marisol", Rol::Duena, "2468").unwrap()
    }

    #[test]
    fn nombres_de_respaldo() {
        assert_eq!(leer_nombre("respaldo-20261014T213000Z-auto.zip"), Some(("2026-10-14T21:30:00Z".into(), Tipo::Auto)));
        assert_eq!(leer_nombre("respaldo-20261014T213000Z-manual-2.zip").map(|x| x.1), Some(Tipo::Manual));
        assert_eq!(leer_nombre("respaldo-x.zip"), None);
        assert_eq!(leer_nombre("otro.zip"), None);
        assert_eq!(leer_nombre("respaldo-20261014T213000Z-raro.zip"), None);
    }

    #[test]
    fn ida_y_vuelta_con_portadas_y_qr() {
        let (_d, c, lib) = mundo();
        lib.conn.execute("INSERT INTO config (clave, valor) VALUES ('antes', 'si')", []).unwrap();
        let r = crear(&lib, &dir_interno(&c), Tipo::Manual).unwrap();
        assert!(r.archivo.starts_with("respaldo-") && r.archivo.ends_with("-manual.zip"));
        assert!(r.bytes > 0);
        // los cambios posteriores se pierden al restaurar
        lib.conn.execute("INSERT INTO config (clave, valor) VALUES ('despues', 'si')", []).unwrap();
        fs::write(c.join(DIR_PORTADAS).join("2-1.jpg"), b"portada nueva").unwrap();
        fs::remove_file(c.join(ARCHIVO_QR)).unwrap();
        drop(lib);
        let meta = restaurar_en(Path::new(&r.ruta), &c, "contraseña buena").unwrap();
        assert_eq!(meta.tienda, "SIGLO XXI");
        let (lib, _) = carpeta::abrir_con_contrasena(&c, "contraseña buena").unwrap();
        let claves: Vec<String> = lib
            .conn
            .prepare("SELECT clave FROM config ORDER BY clave")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(|x| x.unwrap())
            .collect();
        assert!(claves.contains(&"antes".to_string()) && !claves.contains(&"despues".to_string()), "{claves:?}");
        assert_eq!(fs::read(c.join(DIR_PORTADAS).join("1-1.jpg")).unwrap(), b"portada uno");
        assert!(!c.join(DIR_PORTADAS).join("2-1.jpg").exists());
        assert_eq!(fs::read(c.join(ARCHIVO_QR)).unwrap(), b"qr");
        assert!(!c.join(".restaurando").exists() && !c.join("libreria.db.anterior").exists() && !c.join("portadas.anterior").exists());
        assert_eq!(listar(&dir_interno(&c)).len(), 1, "el respaldo sigue en su carpeta");
    }

    #[test]
    fn restaurar_mal_deja_todo_como_estaba() {
        let (d, c, lib) = mundo();
        let r = crear(&lib, &dir_interno(&c), Tipo::Manual).unwrap();
        lib.conn.execute("INSERT INTO config (clave, valor) VALUES ('actual', 'si')", []).unwrap();
        lib.consolidar().unwrap();
        drop(lib);
        // contraseña equivocada
        assert!(matches!(restaurar_en(Path::new(&r.ruta), &c, "contraseña mala"), Err(Error::LlaveIncorrecta)));
        // un zip que no es un respaldo
        let falso = d.path().join("falso.zip");
        fs::write(&falso, b"no es un zip").unwrap();
        assert!(restaurar_en(&falso, &c, "contraseña buena").is_err());
        // un zip con rutas peligrosas (zip-slip) o archivos ajenos
        let malo = d.path().join("malo.zip");
        {
            let mut z = ZipWriter::new(File::create(&malo).unwrap());
            let op = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            for n in [MANIFIESTO, ARCHIVO_DB, ARCHIVO_META, "portadas/../../fuera.txt"] {
                z.start_file(n, op).unwrap();
                z.write_all(b"x").unwrap();
            }
            z.finish().unwrap();
        }
        assert!(restaurar_en(&malo, &c, "contraseña buena").is_err());
        assert!(!d.path().join("fuera.txt").exists());
        // la carpeta sigue intacta y abre con sus datos actuales
        let (lib, _) = carpeta::abrir_con_contrasena(&c, "contraseña buena").unwrap();
        let n: i64 = lib.conn.query_row("SELECT count(*) FROM config WHERE clave = 'actual'", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
        assert!(!c.join(".restaurando").exists());
    }

    #[test]
    fn restaurar_en_un_pc_nuevo() {
        let (d, c, lib) = mundo();
        duena(&lib);
        let r = crear(&lib, &dir_interno(&c), Tipo::Manual).unwrap();
        drop(lib);
        let nuevo = d.path().join("otra").join("Librería");
        let (lib2, llave) = restaurar_nueva(Path::new(&r.ruta), &nuevo, "contraseña buena").unwrap();
        assert_eq!(crate::usuarios::listar(&lib2.conn).unwrap().len(), 1);
        assert!(carpeta::abrir(&nuevo, &llave).is_ok());
        assert!(nuevo.join(DIR_RESPALDOS).is_dir());
        // no se restaura encima de otra librería
        assert!(restaurar_nueva(Path::new(&r.ruta), &nuevo, "contraseña buena").is_err());
    }

    #[test]
    fn retencion_solo_borra_automaticos_viejos() {
        let dir = tempfile::tempdir().unwrap();
        for (sello, tipo) in [
            ("20261001", "auto"),
            ("20261002", "auto"),
            ("20261003", "auto"),
            ("20261004", "manual"),
            ("20261005", "seguridad"),
            ("20261006", "auto"),
        ] {
            fs::write(dir.path().join(format!("respaldo-{sello}T100000Z-{tipo}.zip")), b"x").unwrap();
        }
        fs::write(dir.path().join("notas.txt"), b"x").unwrap();
        aplicar_retencion(dir.path(), 2);
        let quedan: Vec<_> = listar(dir.path()).into_iter().map(|r| (r.fecha[..10].to_string(), r.tipo)).collect();
        assert_eq!(
            quedan,
            [
                ("2026-10-06".into(), Tipo::Auto),
                ("2026-10-05".into(), Tipo::Seguridad),
                ("2026-10-04".into(), Tipo::Manual),
                ("2026-10-03".into(), Tipo::Auto)
            ]
        );
        assert!(dir.path().join("notas.txt").exists());
    }

    #[test]
    fn automatico_una_vez_al_dia_con_externo() {
        let (d, c, lib) = mundo();
        let quien = duena(&lib);
        assert!(toca_automatico(&lib.conn).unwrap());
        let externo = d.path().join("pendrive");
        fs::create_dir_all(&externo).unwrap();
        assert!(fijar_configuracion(&lib.conn, Some("/no/existe/de-verdad"), 14, &quien).is_err());
        assert!(fijar_configuracion(&lib.conn, Some(externo.to_str().unwrap()), 2, &quien).is_err());
        let conf = fijar_configuracion(&lib.conn, Some(externo.to_str().unwrap()), 7, &quien).unwrap();
        assert_eq!((conf.conservar, conf.externo.as_deref()), (7, externo.to_str()));
        let r = hacer_automatico(&lib).unwrap().expect("toca");
        assert_eq!(r.aviso, None);
        assert_eq!(listar(&dir_interno(&c)).len(), 1);
        assert_eq!(listar(&externo).len(), 1, "también se copió afuera");
        // la segunda vez, el mismo día, no repite
        assert!(!toca_automatico(&lib.conn).unwrap());
        assert!(hacer_automatico(&lib).unwrap().is_none());
        // con el externo desconectado, el interno se hace igual y se avisa
        fs::remove_dir_all(&externo).unwrap();
        escribir(&lib.conn, "respaldo_ultimo_auto", Some("2000-01-01T00:00:00Z")).unwrap();
        let r = hacer_automatico(&lib).unwrap().expect("toca de nuevo");
        assert!(r.aviso.unwrap().contains("carpeta externa"));
        assert_eq!(listar(&dir_interno(&c)).len(), 2);
        // las vendedoras no cambian los respaldos
        let vend = crear_usuaria(&lib.conn, "Luis", Rol::Vendedor, "1357").unwrap();
        assert!(matches!(fijar_configuracion(&lib.conn, None, 14, &vend), Err(Error::Permiso(_))));
    }

    #[test]
    fn manual_con_copia_en_otra_carpeta() {
        let (d, c, lib) = mundo();
        let otra = d.path().join("nube");
        let r = hacer_manual(&lib, Some(&otra)).unwrap();
        assert_eq!(r.aviso, None);
        assert_eq!(listar(&otra).len(), 1);
        assert_eq!(listar(&dir_interno(&c)).len(), 1);
        let s = hacer_de_seguridad(&lib).unwrap();
        assert_eq!(s.tipo, Tipo::Seguridad);
    }
}
