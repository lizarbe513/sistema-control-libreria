//! Búsqueda instantánea tolerante a tildes y errores de tipeo.
//!
//! Índice en memoria con las palabras normalizadas de cada libro (título, autor, editorial, categoría y
//! etiquetas). Cada palabra de la consulta debe coincidir con alguna del libro: exacta, por prefijo, como
//! parte de la palabra o con 1–2 errores de tipeo. El título pesa más y tener stock suma un poco.
//! Con 10 000 libros responde en pocos milisegundos (ver la prueba de rendimiento).

use rusqlite::Connection;
use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;

use crate::error::Result;
use crate::isbn;
use crate::libros::{self, Libro};

/// Minúsculas, sin tildes y solo letras/números («Ñandú» → «nandu»).
pub fn normalizar(s: &str) -> String {
    s.nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect()
}

pub fn palabras(s: &str) -> Vec<String> {
    normalizar(s).split_whitespace().map(String::from).collect()
}

/// Distancia de edición, cortando pronto si las longitudes difieren mucho.
fn distancia(a: &[char], b: &[char]) -> usize {
    if a.len().abs_diff(b.len()) > 2 {
        return 3;
    }
    let mut fila: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut previo = fila[0];
        fila[0] = i;
        for j in 1..=b.len() {
            let tmp = fila[j];
            fila[j] = (fila[j] + 1).min(fila[j - 1] + 1).min(previo + usize::from(a[i - 1] != b[j - 1]));
            previo = tmp;
        }
    }
    fila[b.len()]
}

/// Cuánto se parece la palabra buscada `q` a la palabra `w` del libro (0 = nada).
fn puntaje_palabra(q: &str, qc: &[char], w: &str) -> f32 {
    if w == q {
        return 1.0;
    }
    if w.starts_with(q) {
        return 0.9;
    }
    if qc.len() >= 3 && w.contains(q) {
        return 0.7;
    }
    if qc.len() >= 4 {
        let wc: Vec<char> = w.chars().collect();
        // compara con el comienzo de la palabra (así «principitp» encuentra «principito»)
        let corte = qc.len().max(wc.len().min(qc.len() + 1));
        let d = distancia(qc, &wc[..corte.min(wc.len())]);
        if d <= 1 {
            return 0.6;
        }
        if d <= 2 && qc.len() >= 7 {
            return 0.4;
        }
    }
    0.0
}

struct Entrada {
    id: i64,
    titulo: Vec<String>,
    resto: Vec<String>,
    titulo_orden: String,
    categoria: String,
    precio: i64,
    stock: i64,
    stock_minimo: i64,
    ubicado: bool,
}

/// Índice de búsqueda. Se reconstruye cuando cambia el inventario (es barato: una sola consulta).
pub struct Indice {
    entradas: Vec<Entrada>,
}

impl Indice {
    pub fn construir(conn: &Connection) -> Result<Indice> {
        let mut st = conn.prepare(
            "SELECT l.id, l.titulo, l.autor, l.editorial, c.nombre, c.clave, l.precio_cent, l.stock, l.stock_minimo,
                    l.estante_id IS NOT NULL,
                    (SELECT group_concat(e.nombre, ' ') FROM libro_etiqueta le JOIN etiquetas e ON e.id = le.etiqueta_id
                      WHERE le.libro_id = l.id)
               FROM libros l JOIN categorias c ON c.id = l.categoria_id WHERE l.activo = 1",
        )?;
        let entradas = st
            .query_map([], |f| {
                let titulo: String = f.get(1)?;
                let etiquetas: Option<String> = f.get(10)?;
                let resto = format!(
                    "{} {} {} {}",
                    f.get::<_, String>(2)?,
                    f.get::<_, String>(3)?,
                    f.get::<_, String>(4)?,
                    etiquetas.unwrap_or_default()
                );
                Ok(Entrada {
                    id: f.get(0)?,
                    titulo_orden: normalizar(&titulo),
                    titulo: palabras(&titulo),
                    resto: palabras(&resto),
                    categoria: f.get(5)?,
                    precio: f.get(6)?,
                    stock: f.get(7)?,
                    stock_minimo: f.get(8)?,
                    ubicado: f.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(Indice { entradas })
    }

    pub fn len(&self) -> usize {
        self.entradas.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entradas.is_empty()
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filtros {
    pub categoria: Option<String>,
    pub solo_con_stock: bool,
    pub stock_bajo: bool,
    pub sin_ubicacion: bool,
    pub precio_min: Option<i64>,
    pub precio_max: Option<i64>,
    pub limite: Option<usize>,
}

impl Filtros {
    fn acepta(&self, e: &Entrada) -> bool {
        self.categoria.as_ref().is_none_or(|c| c == &e.categoria)
            && (!self.solo_con_stock || e.stock > 0)
            && (!self.stock_bajo || e.stock <= e.stock_minimo)
            && (!self.sin_ubicacion || !e.ubicado)
            && self.precio_min.is_none_or(|p| e.precio >= p)
            && self.precio_max.is_none_or(|p| e.precio <= p)
    }
}

/// Ids que coinciden con la consulta, del más parecido al menos.
pub fn ids(indice: &Indice, consulta: &str, filtros: &Filtros) -> Vec<i64> {
    let limite = filtros.limite.unwrap_or(100).min(500);
    let qs = palabras(consulta);
    if qs.is_empty() {
        // sin texto: todo lo que pasa los filtros, por título
        let mut v: Vec<&Entrada> = indice.entradas.iter().filter(|e| filtros.acepta(e)).collect();
        v.sort_by(|a, b| a.titulo_orden.cmp(&b.titulo_orden));
        return v.into_iter().take(limite).map(|e| e.id).collect();
    }
    let qcs: Vec<Vec<char>> = qs.iter().map(|q| q.chars().collect()).collect();
    let mut res: Vec<(f32, &Entrada)> = Vec::new();
    'libros: for e in indice.entradas.iter().filter(|e| filtros.acepta(e)) {
        let mut total = 0.0;
        for (q, qc) in qs.iter().zip(&qcs) {
            let mut mejor = 0.0f32;
            for w in &e.titulo {
                mejor = mejor.max(puntaje_palabra(q, qc, w) * 1.2);
            }
            if mejor < 1.2 {
                for w in &e.resto {
                    mejor = mejor.max(puntaje_palabra(q, qc, w));
                }
            }
            if mejor == 0.0 {
                continue 'libros;
            }
            total += mejor;
        }
        res.push((total + if e.stock > 0 { 0.05 } else { 0.0 }, e));
    }
    res.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.titulo_orden.cmp(&b.1.titulo_orden)));
    res.into_iter().take(limite).map(|(_, e)| e.id).collect()
}

/// Busca libros. Si la consulta es un ISBN o un código interno, va directo a ese libro.
pub fn buscar(conn: &Connection, indice: &Indice, consulta: &str, filtros: &Filtros, ver_costo: bool) -> Result<Vec<Libro>> {
    let t = consulta.trim();
    let parece_codigo = isbn::normalizar(t).is_some() || t.to_uppercase().starts_with("SXXI-");
    if parece_codigo && let Some(l) = libros::por_codigo(conn, t, ver_costo)? {
        return Ok(vec![l]);
    }
    libros::obtener_varios(conn, &ids(indice, t, filtros), ver_costo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;
    use crate::libros::{LibroEntrada, guardar};

    fn libro(c: &mut Connection, titulo: &str, autor: &str, categoria: &str, stock: i64) -> i64 {
        let e = LibroEntrada { titulo: titulo.into(), autor: autor.into(), categoria: categoria.into(), stock, ..Default::default() };
        guardar(c, &e, None, true).unwrap().id
    }

    fn base() -> (Connection, Indice) {
        let mut c = en_memoria();
        libro(&mut c, "El Principito", "Antoine de Saint-Exupéry", "literarias", 4);
        libro(&mut c, "Corazón", "Edmondo De Amicis", "literarias", 2);
        libro(&mut c, "Cien años de soledad", "Gabriel García Márquez", "literarias", 0);
        libro(&mut c, "Padre Rico, Padre Pobre", "Robert T. Kiyosaki", "autoayuda", 6);
        libro(&mut c, "Paco Yunque", "César Vallejo", "regionales", 10);
        let i = Indice::construir(&c).unwrap();
        (c, i)
    }

    fn titulos(c: &Connection, i: &Indice, q: &str) -> Vec<String> {
        buscar(c, i, q, &Filtros::default(), false).unwrap().into_iter().map(|l| l.titulo).collect()
    }

    #[test]
    fn sin_tildes_prefijos_y_errores() {
        let (c, i) = base();
        assert_eq!(titulos(&c, &i, "corazon"), ["Corazón"]);
        assert_eq!(titulos(&c, &i, "principitp"), ["El Principito"]);
        assert_eq!(titulos(&c, &i, "princ"), ["El Principito"]);
        assert_eq!(titulos(&c, &i, "garcia marquez"), ["Cien años de soledad"]);
        assert_eq!(titulos(&c, &i, "CESAR vallejo"), ["Paco Yunque"]);
        assert_eq!(titulos(&c, &i, "kiyosaky"), ["Padre Rico, Padre Pobre"]);
        assert!(titulos(&c, &i, "harry potter").is_empty());
        // todas las palabras deben coincidir
        assert!(titulos(&c, &i, "principito vallejo").is_empty());
    }

    #[test]
    fn filtros_y_lista_completa() {
        let (c, i) = base();
        assert_eq!(titulos(&c, &i, "").len(), 5);
        let solo = |f: Filtros| buscar(&c, &i, "", &f, false).unwrap().len();
        assert_eq!(solo(Filtros { categoria: Some("literarias".into()), ..Default::default() }), 3);
        assert_eq!(solo(Filtros { solo_con_stock: true, ..Default::default() }), 4);
        assert_eq!(solo(Filtros { stock_bajo: true, ..Default::default() }), 1);
        assert_eq!(solo(Filtros { sin_ubicacion: true, ..Default::default() }), 5);
    }

    #[test]
    fn por_codigo_interno() {
        let (c, i) = base();
        let todos = buscar(&c, &i, "", &Filtros::default(), false).unwrap();
        let paco = todos.iter().find(|l| l.titulo == "Paco Yunque").unwrap();
        assert_eq!(titulos(&c, &i, &paco.codigo.to_lowercase()), ["Paco Yunque"]);
    }

    #[test]
    fn normaliza() {
        assert_eq!(normalizar("¡Ñandú, Corazón!"), " nandu  corazon ");
        assert_eq!(palabras("  Cien   AÑOS "), ["cien", "anos"]);
    }

    /// 10 000 libros: cada consulta en < 100 ms (en modo optimizado; en modo depuración solo informa).
    #[test]
    fn rendimiento_10000_libros() {
        let mut c = en_memoria();
        let silabas = ["ma", "ri", "so", "la", "pe", "dro", "ca", "mi", "no", "luz", "sol", "ver", "de", "ta", "ro", "ne"];
        let tx = c.transaction().unwrap();
        for i in 0..10_000u32 {
            let p = |k: u32| -> String { (0..3).map(|j| silabas[((i * 7 + k * 13 + j * 5) % 16) as usize]).collect() };
            tx.execute(
                "INSERT INTO libros (codigo, titulo, autor, editorial, categoria_id, stock) VALUES (?1, ?2, ?3, ?4, 1 + ?5 % 9, ?5 % 4)",
                rusqlite::params![format!("SXXI-{i:06}"), format!("{} {} {}", p(1), p(2), p(3)), format!("{} {}", p(4), p(5)), p(6), i],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        let t0 = std::time::Instant::now();
        let indice = Indice::construir(&c).unwrap();
        let construir = t0.elapsed();
        let mut peor = std::time::Duration::ZERO;
        for q in ["marisol", "marisl", "pedro luz", "sol", "camino verde", "zzzz", "ta"] {
            let t = std::time::Instant::now();
            let r = buscar(&c, &indice, q, &Filtros::default(), false).unwrap();
            peor = peor.max(t.elapsed());
            assert!(r.len() <= 100);
        }
        eprintln!("índice de {} libros en {construir:?}; consulta más lenta: {peor:?}", indice.len());
        if !cfg!(debug_assertions) {
            assert!(peor.as_millis() < 100, "búsqueda lenta: {peor:?}");
        }
    }
}
