//! Libros del inventario: alta, edición, stock (con movimientos), etiquetas y categorías.
//! Los montos van en céntimos (`i64`). El costo solo se entrega a quien puede verlo (la Dueña).

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result, invalido};
use crate::isbn;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Ubicacion {
    pub estante: String,
    pub tramo: i64,
    pub repisa: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Libro {
    pub id: i64,
    pub isbn: Option<String>,
    pub codigo: String,
    pub titulo: String,
    pub autor: String,
    pub editorial: String,
    pub anio: Option<i64>,
    pub sinopsis: String,
    /// Archivo dentro de `portadas/` (None: se usa la portada generada).
    pub portada: Option<String>,
    pub color_tapa: String,
    pub formato: String,
    pub categoria: String,
    pub precio_cent: i64,
    /// None si quien consulta no puede ver costos.
    pub costo_cent: Option<i64>,
    pub stock: i64,
    pub stock_minimo: i64,
    pub ubicacion: Option<Ubicacion>,
    pub etiquetas: Vec<String>,
    pub actualizado: String,
}

/// Lo que llega del formulario. En una edición, el stock se ignora (se cambia con [`ajustar_stock`]).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LibroEntrada {
    pub id: Option<i64>,
    pub isbn: Option<String>,
    pub titulo: String,
    pub autor: String,
    pub editorial: String,
    pub anio: Option<i64>,
    pub sinopsis: String,
    pub categoria: String,
    pub precio_cent: i64,
    pub costo_cent: Option<i64>,
    pub stock: i64,
    pub stock_minimo: Option<i64>,
    pub ubicacion: Option<Ubicacion>,
    pub etiquetas: Vec<String>,
    pub color_tapa: Option<String>,
    pub formato: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Categoria {
    pub clave: String,
    pub nombre: String,
    pub color: String,
    pub patron: String,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Contadores {
    pub libros: i64,
    pub unidades: i64,
    pub sin_stock: i64,
    pub stock_bajo: i64,
    pub sin_ubicacion: i64,
}

const FORMATOS: [&str; 4] = ["normal", "grueso", "infantil", "delgado"];
const TAPAS: [&str; 12] =
    ["#6FA8DC", "#E9B949", "#4A4E69", "#5DBB8A", "#7E57C2", "#C0392B", "#F27A9B", "#3E8E7E", "#F0A070", "#2C3E50", "#B39DDB", "#B9770E"];
const SEP: &str = "\u{1f}";

/// Color de tapa estable a partir del título (para la portada generada).
fn tapa_por_defecto(titulo: &str) -> String {
    let h = titulo.bytes().fold(5381u32, |h, b| h.wrapping_mul(33) ^ b as u32);
    TAPAS[h as usize % TAPAS.len()].to_string()
}

const SELECT: &str = "
    SELECT l.id, l.isbn, l.codigo, l.titulo, l.autor, l.editorial, l.anio, l.sinopsis, l.portada, l.color_tapa,
           l.formato, c.clave, l.precio_cent, l.costo_cent, l.stock, l.stock_minimo, l.estante_id, l.tramo, l.repisa,
           l.actualizado,
           (SELECT group_concat(e.nombre, char(31)) FROM libro_etiqueta le JOIN etiquetas e ON e.id = le.etiqueta_id
             WHERE le.libro_id = l.id) AS etiquetas
      FROM libros l JOIN categorias c ON c.id = l.categoria_id";

fn fila(f: &rusqlite::Row, ver_costo: bool) -> rusqlite::Result<Libro> {
    let estante: Option<String> = f.get(16)?;
    let tramo: Option<i64> = f.get(17)?;
    let repisa: Option<i64> = f.get(18)?;
    let etiquetas: Option<String> = f.get(20)?;
    let mut etiquetas: Vec<String> = etiquetas.map(|t| t.split(SEP).map(String::from).collect()).unwrap_or_default();
    etiquetas.sort_by_key(|e| e.to_lowercase());
    Ok(Libro {
        id: f.get(0)?,
        isbn: f.get(1)?,
        codigo: f.get(2)?,
        titulo: f.get(3)?,
        autor: f.get(4)?,
        editorial: f.get(5)?,
        anio: f.get(6)?,
        sinopsis: f.get(7)?,
        portada: f.get(8)?,
        color_tapa: f.get(9)?,
        formato: f.get(10)?,
        categoria: f.get(11)?,
        precio_cent: f.get(12)?,
        costo_cent: if ver_costo { Some(f.get(13)?) } else { None },
        stock: f.get(14)?,
        stock_minimo: f.get(15)?,
        ubicacion: match (estante, tramo, repisa) {
            (Some(estante), Some(tramo), Some(repisa)) => Some(Ubicacion { estante, tramo, repisa }),
            _ => None,
        },
        etiquetas,
        actualizado: f.get(19)?,
    })
}

pub fn obtener(conn: &Connection, id: i64, ver_costo: bool) -> Result<Libro> {
    conn.query_row(&format!("{SELECT} WHERE l.id = ?1 AND l.activo = 1"), [id], |f| fila(f, ver_costo))
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("ese libro".into()))
}

/// Varios libros, en el orden pedido (los que no existan se omiten).
pub fn obtener_varios(conn: &Connection, ids: &[i64], ver_costo: bool) -> Result<Vec<Libro>> {
    let mut st = conn.prepare_cached(&format!("{SELECT} WHERE l.id = ?1 AND l.activo = 1"))?;
    let mut salida = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(l) = st.query_row([id], |f| fila(f, ver_costo)).optional()? {
            salida.push(l);
        }
    }
    Ok(salida)
}

pub fn por_codigo(conn: &Connection, codigo: &str, ver_costo: bool) -> Result<Option<Libro>> {
    let codigo = isbn::normalizar(codigo).unwrap_or_else(|| codigo.trim().to_uppercase());
    Ok(conn
        .query_row(&format!("{SELECT} WHERE (l.codigo = ?1 OR l.isbn = ?1) AND l.activo = 1"), [&codigo], |f| fila(f, ver_costo))
        .optional()?)
}

pub fn categorias(conn: &Connection) -> Result<Vec<Categoria>> {
    let mut st = conn.prepare("SELECT clave, nombre, color, patron FROM categorias ORDER BY orden")?;
    let v = st
        .query_map([], |f| Ok(Categoria { clave: f.get(0)?, nombre: f.get(1)?, color: f.get(2)?, patron: f.get(3)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// Colores pastel y patrones para las categorías nuevas: se van rotando para que cada una se distinga.
const PALETA: [&str; 10] = ["#E9E3FB", "#DDEFFB", "#FCEFC7", "#FBD3DE", "#FDE2D0", "#DDF3E4", "#E3F4F4", "#F6E1F5", "#EFEBD8", "#E0E7FF"];
const PATRONES: [&str; 7] = ["marco", "dorado", "rayos", "confeti", "andino", "cuadricula", "ondas"];

fn obtener_categoria(conn: &Connection, clave: &str) -> Result<Categoria> {
    conn.query_row("SELECT clave, nombre, color, patron FROM categorias WHERE clave = ?1", [clave], |f| {
        Ok(Categoria { clave: f.get(0)?, nombre: f.get(1)?, color: f.get(2)?, patron: f.get(3)? })
    })
    .optional()?
    .ok_or_else(|| Error::NoEncontrado("esa categoría".into()))
}

fn validar_nombre_categoria(conn: &Connection, nombre: &str, excepto: Option<&str>) -> Result<()> {
    if nombre.is_empty() || nombre.chars().count() > 40 {
        return invalido("Escribe el nombre de la categoría (hasta 40 letras)");
    }
    let repetida: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM categorias WHERE lower(nombre) = lower(?1) AND clave IS NOT ?2)",
        params![nombre, excepto],
        |f| f.get(0),
    )?;
    if repetida {
        return invalido(format!("Ya existe la categoría «{nombre}»"));
    }
    Ok(())
}

/// Categoría nueva: la clave sale del nombre; el color y el patrón se eligen solos (rotando la paleta).
pub fn crear_categoria(conn: &Connection, nombre: &str) -> Result<Categoria> {
    let nombre = nombre.trim();
    validar_nombre_categoria(conn, nombre, None)?;
    let base = crate::busqueda::normalizar(nombre).split_whitespace().collect::<Vec<_>>().join("-");
    let base = if base.is_empty() { "categoria".to_string() } else { base.chars().take(30).collect() };
    let mut clave = base.clone();
    let mut n = 2;
    while conn.query_row("SELECT EXISTS(SELECT 1 FROM categorias WHERE clave = ?1)", [&clave], |f| f.get::<_, bool>(0))? {
        clave = format!("{base}-{n}");
        n += 1;
    }
    let (cuantas, orden): (i64, i64) =
        conn.query_row("SELECT count(*), coalesce(max(orden), 0) FROM categorias", [], |f| Ok((f.get(0)?, f.get(1)?)))?;
    let i = cuantas as usize;
    conn.execute(
        "INSERT INTO categorias (clave, nombre, color, patron, orden) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![clave, nombre, PALETA[i % PALETA.len()], PATRONES[i % PATRONES.len()], orden + 1],
    )?;
    obtener_categoria(conn, &clave)
}

/// Cambia el nombre y el color (un color `#RRGGBB`). La clave no cambia: los libros siguen apuntando a ella.
pub fn editar_categoria(conn: &Connection, clave: &str, nombre: &str, color: &str) -> Result<Categoria> {
    let nombre = nombre.trim();
    obtener_categoria(conn, clave)?;
    validar_nombre_categoria(conn, nombre, Some(clave))?;
    if !(color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit())) {
        return invalido("El color no es válido");
    }
    conn.execute("UPDATE categorias SET nombre = ?2, color = ?3 WHERE clave = ?1", params![clave, nombre, color])?;
    obtener_categoria(conn, clave)
}

/// Solo se elimina una categoría sin libros (ni dados de baja: su historial la sigue nombrando).
pub fn eliminar_categoria(conn: &Connection, clave: &str) -> Result<()> {
    obtener_categoria(conn, clave)?;
    let (activos, total): (i64, i64) = conn.query_row(
        "SELECT coalesce(sum(l.activo), 0), count(*) FROM libros l JOIN categorias c ON c.id = l.categoria_id WHERE c.clave = ?1",
        [clave],
        |f| Ok((f.get(0)?, f.get(1)?)),
    )?;
    if activos > 0 {
        return invalido(format!("Tiene {activos} libro(s): muévelos a otra categoría antes de eliminarla"));
    }
    if total > 0 {
        return invalido("Tiene libros dados de baja en el historial: no se puede eliminar, pero sí renombrar");
    }
    conn.execute("DELETE FROM categorias WHERE clave = ?1", [clave])?;
    Ok(())
}

/// Cuántos libros activos hay en cada categoría (para Ajustes).
pub fn libros_por_categoria(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut st = conn.prepare(
        "SELECT c.clave, count(l.id) FROM categorias c LEFT JOIN libros l ON l.categoria_id = c.id AND l.activo = 1 GROUP BY c.id",
    )?;
    let v = st.query_map([], |f| Ok((f.get(0)?, f.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn validar(conn: &Connection, e: &LibroEntrada) -> Result<(Option<String>, i64)> {
    let titulo = e.titulo.trim();
    if titulo.is_empty() {
        return invalido("Escribe el título del libro");
    }
    if titulo.chars().count() > 300 {
        return invalido("El título es demasiado largo");
    }
    if e.precio_cent < 0 || e.costo_cent.is_some_and(|c| c < 0) {
        return invalido("Los precios no pueden ser negativos");
    }
    if e.stock < 0 || e.stock_minimo.is_some_and(|s| s < 0) {
        return invalido("El stock no puede ser negativo");
    }
    if e.anio.is_some_and(|a| !(1400..=2100).contains(&a)) {
        return invalido("Revisa el año de publicación");
    }
    if let Some(f) = &e.formato
        && !FORMATOS.contains(&f.as_str())
    {
        return invalido("Formato de libro desconocido");
    }
    if let Some(u) = &e.ubicacion
        && (u.estante.trim().is_empty() || u.tramo < 1 || u.repisa < 1)
    {
        return invalido("Elige el estante, tramo y repisa en la tienda");
    }
    let isbn = match e.isbn.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => None,
        Some(t) => Some(isbn::normalizar(t).ok_or_else(|| Error::Validacion("Ese ISBN no es válido. Revisa los números.".into()))?),
    };
    if let Some(i) = &isbn {
        let otro: Option<(i64, String)> = conn
            .query_row("SELECT id, titulo FROM libros WHERE isbn = ?1 AND activo = 1", [i], |f| Ok((f.get(0)?, f.get(1)?)))
            .optional()?;
        if let Some((id, t)) = otro
            && Some(id) != e.id
        {
            return invalido(format!("Ya existe un libro con ese ISBN: «{t}»"));
        }
    }
    let categoria: Option<i64> = conn.query_row("SELECT id FROM categorias WHERE clave = ?1", [&e.categoria], |f| f.get(0)).optional()?;
    let categoria = categoria.ok_or_else(|| Error::Validacion("Elige una categoría".into()))?;
    Ok((isbn, categoria))
}

fn guardar_etiquetas(tx: &Transaction, libro: i64, etiquetas: &[String]) -> Result<()> {
    tx.execute("DELETE FROM libro_etiqueta WHERE libro_id = ?1", [libro])?;
    let mut vistas = std::collections::HashSet::new();
    for e in etiquetas.iter().map(|e| e.trim()).filter(|e| !e.is_empty() && e.chars().count() <= 40) {
        if !vistas.insert(e.to_lowercase()) {
            continue;
        }
        tx.execute("INSERT OR IGNORE INTO etiquetas (nombre) VALUES (?1)", [e])?;
        let id: i64 = tx.query_row("SELECT id FROM etiquetas WHERE nombre = ?1", [e], |f| f.get(0))?;
        tx.execute("INSERT OR IGNORE INTO libro_etiqueta (libro_id, etiqueta_id) VALUES (?1, ?2)", [libro, id])?;
    }
    Ok(())
}

/// Crea o edita un libro. `usuario` queda registrado en el movimiento de alta.
pub fn guardar(conn: &mut Connection, e: &LibroEntrada, usuario: Option<i64>, ver_costo: bool) -> Result<Libro> {
    let (isbn, categoria) = validar(conn, e)?;
    let tx = conn.transaction()?;
    let (estante, tramo, repisa) = match &e.ubicacion {
        Some(u) => (Some(u.estante.trim().to_string()), Some(u.tramo), Some(u.repisa)),
        None => (None, None, None),
    };
    let titulo = e.titulo.trim();
    let tapa = e.color_tapa.clone().unwrap_or_else(|| tapa_por_defecto(titulo));
    let formato = e.formato.clone().unwrap_or_else(|| "normal".into());
    let id = match e.id {
        None => {
            let costo = if ver_costo { e.costo_cent.unwrap_or(0) } else { 0 };
            tx.execute(
                "INSERT INTO libros (isbn, codigo, titulo, autor, editorial, anio, sinopsis, color_tapa, formato, categoria_id,
                                     precio_cent, costo_cent, stock, stock_minimo, estante_id, tramo, repisa)
                 VALUES (?1, lower(hex(randomblob(8))), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    isbn,
                    titulo,
                    e.autor.trim(),
                    e.editorial.trim(),
                    e.anio,
                    e.sinopsis.trim(),
                    tapa,
                    formato,
                    categoria,
                    e.precio_cent,
                    costo,
                    e.stock,
                    e.stock_minimo.unwrap_or(1),
                    estante,
                    tramo,
                    repisa
                ],
            )?;
            let id = tx.last_insert_rowid();
            // el código es el ISBN; los libros sin ISBN reciben un código interno
            let codigo = isbn.clone().unwrap_or_else(|| format!("SXXI-{id:06}"));
            tx.execute("UPDATE libros SET codigo = ?2 WHERE id = ?1", params![id, codigo])?;
            if e.stock > 0 {
                tx.execute(
                    "INSERT INTO movimientos_stock (libro_id, delta, motivo, usuario_id) VALUES (?1, ?2, 'alta', ?3)",
                    params![id, e.stock, usuario],
                )?;
            }
            id
        }
        Some(id) => {
            let actual: Option<(i64, String)> = tx
                .query_row("SELECT costo_cent, codigo FROM libros WHERE id = ?1 AND activo = 1", [id], |f| Ok((f.get(0)?, f.get(1)?)))
                .optional()?;
            let (costo_actual, codigo_actual) = actual.ok_or_else(|| Error::NoEncontrado("ese libro".into()))?;
            // quien no ve costos no los puede cambiar
            let costo = if ver_costo { e.costo_cent.unwrap_or(costo_actual) } else { costo_actual };
            let codigo = match &isbn {
                Some(i) => i.clone(),
                None if codigo_actual.starts_with("SXXI-") => codigo_actual,
                None => format!("SXXI-{id:06}"),
            };
            tx.execute(
                "UPDATE libros SET isbn = ?2, codigo = ?3, titulo = ?4, autor = ?5, editorial = ?6, anio = ?7, sinopsis = ?8,
                        color_tapa = ?9, formato = ?10, categoria_id = ?11, precio_cent = ?12, costo_cent = ?13, stock_minimo = ?14,
                        estante_id = ?15, tramo = ?16, repisa = ?17, actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                  WHERE id = ?1",
                params![
                    id,
                    isbn,
                    codigo,
                    titulo,
                    e.autor.trim(),
                    e.editorial.trim(),
                    e.anio,
                    e.sinopsis.trim(),
                    tapa,
                    formato,
                    categoria,
                    e.precio_cent,
                    costo,
                    e.stock_minimo.unwrap_or(1),
                    estante,
                    tramo,
                    repisa
                ],
            )?;
            id
        }
    };
    guardar_etiquetas(&tx, id, &e.etiquetas)?;
    tx.commit()?;
    obtener(conn, id, ver_costo)
}

/// Suma o resta stock dejando el movimiento registrado. `motivo`: «ingreso» o «ajuste».
pub fn ajustar_stock(
    conn: &mut Connection,
    id: i64,
    delta: i64,
    motivo: &str,
    nota: &str,
    usuario: Option<i64>,
    ver_costo: bool,
) -> Result<Libro> {
    if !matches!(motivo, "ingreso" | "ajuste") {
        return invalido("Motivo de ajuste desconocido");
    }
    if delta == 0 {
        return invalido("Indica cuántos ejemplares sumar o restar");
    }
    let tx = conn.transaction()?;
    mover_stock(&tx, id, delta, motivo, nota, usuario, true)?;
    tx.commit()?;
    obtener(conn, id, ver_costo)
}

/// Mueve el stock dentro de la transacción de quien llama y deja el movimiento. Nunca queda negativo.
/// `solo_activo = false` permite devolver stock (anulaciones) de un libro que se dio de baja después de venderlo.
pub(crate) fn mover_stock(
    tx: &Transaction,
    id: i64,
    delta: i64,
    motivo: &str,
    nota: &str,
    usuario: Option<i64>,
    solo_activo: bool,
) -> Result<()> {
    let fila: Option<(i64, String)> = tx
        .query_row("SELECT stock, titulo FROM libros WHERE id = ?1 AND (activo = 1 OR ?2 = 0)", params![id, solo_activo], |f| {
            Ok((f.get(0)?, f.get(1)?))
        })
        .optional()?;
    let (stock, titulo) = fila.ok_or_else(|| Error::NoEncontrado("ese libro".into()))?;
    if stock + delta < 0 {
        return invalido(format!("Solo hay {stock} de «{titulo}» en stock: no puede quedar negativo"));
    }
    tx.execute(
        "UPDATE libros SET stock = stock + ?2, actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id, delta],
    )?;
    tx.execute(
        "INSERT INTO movimientos_stock (libro_id, delta, motivo, nota, usuario_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, delta, motivo, nota.trim(), usuario],
    )?;
    Ok(())
}

/// Da de baja (no borra: queda el historial). El ISBN se libera para poder volver a darlo de alta.
pub fn desactivar(conn: &Connection, id: i64) -> Result<()> {
    let n = conn.execute(
        "UPDATE libros SET activo = 0, isbn = NULL, codigo = codigo || '~baja' || id,
                actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1 AND activo = 1",
        [id],
    )?;
    if n == 0 {
        return Err(Error::NoEncontrado("ese libro".into()));
    }
    Ok(())
}

pub fn fijar_portada(conn: &Connection, id: i64, archivo: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE libros SET portada = ?2, actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1 AND activo = 1",
        params![id, archivo],
    )?;
    Ok(())
}

pub fn contadores(conn: &Connection) -> Result<Contadores> {
    Ok(conn.query_row(
        "SELECT count(*), coalesce(sum(stock), 0), coalesce(sum(stock = 0), 0), coalesce(sum(stock > 0 AND stock <= stock_minimo), 0),
                coalesce(sum(estante_id IS NULL), 0)
           FROM libros WHERE activo = 1",
        [],
        |f| {
            Ok(Contadores { libros: f.get(0)?, unidades: f.get(1)?, sin_stock: f.get(2)?, stock_bajo: f.get(3)?, sin_ubicacion: f.get(4)? })
        },
    )?)
}

/// Libros con pocas unidades (incluye los agotados), los más urgentes primero.
pub fn stock_bajo(conn: &Connection, limite: i64, ver_costo: bool) -> Result<Vec<Libro>> {
    let mut st = conn.prepare(&format!("{SELECT} WHERE l.activo = 1 AND l.stock <= l.stock_minimo ORDER BY l.stock, l.titulo LIMIT ?1"))?;
    let v = st.query_map([limite], |f| fila(f, ver_costo))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::db::en_memoria;

    #[test]
    fn categorias_nuevas() {
        let mut c = en_memoria();
        let antes = categorias(&c).unwrap().len();
        let k = crear_categoria(&c, "  Ciencia Ficción ").unwrap();
        assert_eq!((k.clave.as_str(), k.nombre.as_str()), ("ciencia-ficcion", "Ciencia Ficción"));
        assert!(k.color.starts_with('#') && !k.patron.is_empty());
        assert_eq!(categorias(&c).unwrap().len(), antes + 1);
        assert_eq!(categorias(&c).unwrap().last().unwrap().clave, "ciencia-ficcion", "va al final");
        assert!(crear_categoria(&c, "ciencia ficción").is_err(), "nombre repetido");
        assert!(crear_categoria(&c, " ").is_err());
        // editar
        let k = editar_categoria(&c, "ciencia-ficcion", "Sci-fi", "#AABBCC").unwrap();
        assert_eq!((k.nombre.as_str(), k.color.as_str()), ("Sci-fi", "#AABBCC"));
        assert!(editar_categoria(&c, "ciencia-ficcion", "Otros", "#AABBCC").is_err(), "choca con otra");
        assert!(editar_categoria(&c, "ciencia-ficcion", "Sci-fi", "rojo").is_err());
        // un libro en la categoría nueva impide eliminarla
        let mut e = entrada("Fundación");
        e.categoria = "ciencia-ficcion".into();
        let l = guardar(&mut c, &e, None, true).unwrap();
        assert_eq!(l.categoria, "ciencia-ficcion");
        assert!(eliminar_categoria(&c, "ciencia-ficcion").is_err());
        assert_eq!(libros_por_categoria(&c).unwrap().iter().find(|(k, _)| k == "ciencia-ficcion").unwrap().1, 1);
        // una vacía, sí
        crear_categoria(&c, "Revistas").unwrap();
        eliminar_categoria(&c, "revistas").unwrap();
        assert!(!categorias(&c).unwrap().iter().any(|k| k.clave == "revistas"));
    }

    pub fn entrada(titulo: &str) -> LibroEntrada {
        LibroEntrada { titulo: titulo.into(), categoria: "literarias".into(), precio_cent: 3500, ..Default::default() }
    }

    #[test]
    fn alta_con_isbn_y_sin_isbn() {
        let mut c = en_memoria();
        let a = guardar(
            &mut c,
            &LibroEntrada {
                isbn: Some("978-84-9838-114-6".into()),
                autor: "Antoine de Saint-Exupéry".into(),
                stock: 4,
                costo_cent: Some(2000),
                etiquetas: vec!["clásico".into(), "Clásico".into(), " infantil ".into()],
                ubicacion: Some(Ubicacion { estante: "A".into(), tramo: 1, repisa: 3 }),
                ..entrada("El Principito")
            },
            None,
            true,
        )
        .unwrap();
        assert_eq!(a.codigo, "9788498381146");
        assert_eq!(a.costo_cent, Some(2000));
        assert_eq!(a.etiquetas, ["clásico", "infantil"]);
        assert_eq!(a.ubicacion, Some(Ubicacion { estante: "A".into(), tramo: 1, repisa: 3 }));
        let b = guardar(&mut c, &entrada("Paco Yunque"), None, true).unwrap();
        assert_eq!(b.codigo, format!("SXXI-{:06}", b.id));
        // ISBN repetido
        let e = guardar(&mut c, &LibroEntrada { isbn: Some("9788498381146".into()), ..entrada("Otro") }, None, true).unwrap_err();
        assert!(e.to_string().contains("El Principito"), "{e}");
        // ISBN inválido
        assert!(guardar(&mut c, &LibroEntrada { isbn: Some("9788498381148".into()), ..entrada("X") }, None, true).is_err());
        // el alta con stock deja un movimiento
        let n: i64 =
            c.query_row("SELECT count(*) FROM movimientos_stock WHERE libro_id = ?1 AND motivo = 'alta'", [a.id], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
        assert_eq!(por_codigo(&c, "9788498381146", false).unwrap().unwrap().id, a.id);
        assert_eq!(por_codigo(&c, &b.codigo.to_lowercase(), false).unwrap().unwrap().id, b.id);
    }

    #[test]
    fn el_vendedor_no_ve_ni_cambia_el_costo() {
        let mut c = en_memoria();
        let a = guardar(&mut c, &LibroEntrada { costo_cent: Some(1800), ..entrada("Cien años de soledad") }, None, true).unwrap();
        let visto = obtener(&c, a.id, false).unwrap();
        assert_eq!(visto.costo_cent, None);
        // edita el precio sin conocer el costo: el costo se conserva
        let ed = guardar(
            &mut c,
            &LibroEntrada { id: Some(a.id), precio_cent: 6900, costo_cent: Some(1), ..entrada("Cien años de soledad") },
            None,
            false,
        )
        .unwrap();
        assert_eq!(ed.precio_cent, 6900);
        assert_eq!(obtener(&c, a.id, true).unwrap().costo_cent, Some(1800));
    }

    #[test]
    fn stock_con_movimientos_y_sin_negativos() {
        let mut c = en_memoria();
        let a = guardar(&mut c, &LibroEntrada { stock: 2, stock_minimo: Some(1), ..entrada("Los ríos profundos") }, None, true).unwrap();
        assert_eq!(ajustar_stock(&mut c, a.id, 3, "ingreso", "llegó pedido", None, true).unwrap().stock, 5);
        assert!(ajustar_stock(&mut c, a.id, -9, "ajuste", "", None, true).is_err());
        assert_eq!(ajustar_stock(&mut c, a.id, -5, "ajuste", "inventario", None, true).unwrap().stock, 0);
        let k = contadores(&c).unwrap();
        assert_eq!((k.libros, k.sin_stock, k.stock_bajo, k.sin_ubicacion), (1, 1, 0, 1));
        assert_eq!(stock_bajo(&c, 10, true).unwrap().len(), 1);
        // una edición no toca el stock
        let ed = guardar(&mut c, &LibroEntrada { id: Some(a.id), stock: 99, ..entrada("Los ríos profundos") }, None, true).unwrap();
        assert_eq!(ed.stock, 0);
    }

    #[test]
    fn baja_libera_el_isbn() {
        let mut c = en_memoria();
        let a = guardar(&mut c, &LibroEntrada { isbn: Some("9788497592208".into()), ..entrada("Cien años") }, None, true).unwrap();
        desactivar(&c, a.id).unwrap();
        assert!(obtener(&c, a.id, true).is_err());
        assert!(guardar(&mut c, &LibroEntrada { isbn: Some("9788497592208".into()), ..entrada("Cien años") }, None, true).is_ok());
    }

    #[test]
    fn validaciones_y_categorias() {
        let mut c = en_memoria();
        assert_eq!(categorias(&c).unwrap().len(), 9);
        assert!(guardar(&mut c, &entrada("  "), None, true).is_err());
        assert!(guardar(&mut c, &LibroEntrada { categoria: "nada".into(), ..entrada("X") }, None, true).is_err());
        assert!(guardar(&mut c, &LibroEntrada { precio_cent: -1, ..entrada("X") }, None, true).is_err());
        assert!(guardar(&mut c, &LibroEntrada { anio: Some(3000), ..entrada("X") }, None, true).is_err());
        assert!(
            guardar(
                &mut c,
                &LibroEntrada { ubicacion: Some(Ubicacion { estante: "A".into(), tramo: 0, repisa: 1 }), ..entrada("X") },
                None,
                true
            )
            .is_err()
        );
    }
}
