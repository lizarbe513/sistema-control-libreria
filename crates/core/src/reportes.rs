//! Reportes para la Dueña: ventas por período, más vendidos, caja, ganancia y libros sin movimiento, más su exportación a CSV.
//! Los períodos llegan como instantes UTC `[desde, hasta)`; `tz_min` es el desfase local respecto de UTC (Perú: −300)
//! y sirve solo para agrupar por día/mes y mostrar fechas locales.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::{Result, invalido};
use crate::ventas::{self, Metodo, PorMetodo};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Agrupar {
    Dia,
    Mes,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Consulta {
    pub desde: String,
    pub hasta: String,
    /// Minutos que se suman a UTC para obtener la hora local (Perú: −300).
    #[serde(default)]
    pub tz_min: i64,
    pub agrupar: Agrupar,
    /// Un libro está «sin movimiento» si no se vende ni recibe stock desde hace tantos días.
    #[serde(default = "dias_por_defecto")]
    pub dias_sin_mov: i64,
    /// Instante actual (UTC, ISO). La interfaz lo manda; así el núcleo no depende del reloj.
    pub ahora: String,
}

fn dias_por_defecto() -> i64 {
    90
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Punto {
    /// `2026-10-14` (día) o `2026-10` (mes), en hora local.
    pub etiqueta: String,
    pub ventas: i64,
    pub unidades: i64,
    pub total_cent: i64,
    pub ganancia_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Totales {
    pub ventas: i64,
    pub anuladas: i64,
    pub unidades: i64,
    pub total_cent: i64,
    /// Lo vendido menos el costo de esos libros (con el costo del día de la venta).
    pub ganancia_cent: i64,
    pub descuentos_cent: i64,
    pub redondeo_cent: i64,
    pub ticket_promedio_cent: i64,
    /// Adelantos de encargos recibidos en el período (menos devoluciones): entran en la caja.
    pub adelantos_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibroVendido {
    pub libro_id: i64,
    pub titulo: String,
    pub unidades: i64,
    pub total_cent: i64,
    pub ganancia_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CategoriaVendida {
    pub clave: String,
    pub nombre: String,
    pub color: String,
    pub unidades: i64,
    pub total_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Grupo {
    pub nombre: String,
    pub ventas: i64,
    pub total_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SinMovimiento {
    pub libro_id: i64,
    pub titulo: String,
    pub autor: String,
    pub categoria: String,
    pub stock: i64,
    pub costo_cent: i64,
    pub precio_cent: i64,
    /// Días desde la última venta o ingreso de stock.
    pub dias: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reporte {
    pub totales: Totales,
    pub serie: Vec<Punto>,
    pub caja: Vec<PorMetodo>,
    pub mas_vendidos: Vec<LibroVendido>,
    pub categorias: Vec<CategoriaVendida>,
    pub por_tipo: Vec<Grupo>,
    pub por_vendedora: Vec<Grupo>,
    pub sin_movimiento: Vec<SinMovimiento>,
    pub sin_movimiento_total: i64,
    /// Plata detenida en esos libros (stock × costo).
    pub inmovilizado_cent: i64,
}

const DIAS_MAX: i64 = 1100;

fn modificador(tz_min: i64) -> String {
    format!("{tz_min:+} minutes")
}

fn validar(c: &Consulta, limitar_largo: bool) -> Result<()> {
    if c.desde >= c.hasta {
        return invalido("El período no es válido: «desde» debe ser antes que «hasta»");
    }
    if !(-840..=840).contains(&c.tz_min) {
        return invalido("Zona horaria no válida");
    }
    if !(1..=3650).contains(&c.dias_sin_mov) {
        return invalido("Los días sin movimiento deben estar entre 1 y 3650");
    }
    let dias: i64 =
        Connection::open_in_memory()?
            .query_row("SELECT CAST(julianday(?2) - julianday(?1) AS INTEGER)", [&c.desde, &c.hasta], |f| f.get(0))?;
    // la serie día a día es lo único que crece con el largo del período
    if limitar_largo && dias > DIAS_MAX {
        return invalido("El período es demasiado largo (máximo 3 años)");
    }
    Ok(())
}

const ITEMS_POR_VENTA: &str =
    "(SELECT venta_id, SUM(cantidad) unid, SUM(cantidad * costo_unit_cent) costo FROM venta_items GROUP BY venta_id)";

pub fn serie(conn: &Connection, c: &Consulta) -> Result<Vec<Punto>> {
    let formato = if c.agrupar == Agrupar::Dia { "%Y-%m-%d" } else { "%Y-%m" };
    let m = modificador(c.tz_min);
    let mut st = conn.prepare(&format!(
        "WITH RECURSIVE d(k) AS (
            SELECT date(?3, ?2) UNION ALL SELECT date(k, '+1 day') FROM d WHERE k < date(?4, ?2, '-1 second')
         ), claves AS (SELECT DISTINCT strftime(?1, k) AS k FROM d),
         ventas_k AS (
            SELECT strftime(?1, v.fecha, ?2) AS k, count(*) n, SUM(v.total_cent) t, SUM(COALESCE(u.unid, 0)) un, SUM(COALESCE(u.costo, 0)) costo
              FROM ventas v LEFT JOIN {ITEMS_POR_VENTA} u ON u.venta_id = v.id
             WHERE v.anulada = 0 AND v.fecha >= ?3 AND v.fecha < ?4 GROUP BY 1)
         SELECT claves.k, COALESCE(n, 0), COALESCE(un, 0), COALESCE(t, 0), COALESCE(t - costo, 0)
           FROM claves LEFT JOIN ventas_k ON ventas_k.k = claves.k ORDER BY claves.k"
    ))?;
    let filas = st.query_map(rusqlite::params![formato, m, c.desde, c.hasta], |f| {
        Ok(Punto { etiqueta: f.get(0)?, ventas: f.get(1)?, unidades: f.get(2)?, total_cent: f.get(3)?, ganancia_cent: f.get(4)? })
    })?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub fn totales(conn: &Connection, c: &Consulta) -> Result<Totales> {
    let r = ventas::resumen(conn, &c.desde, &c.hasta)?;
    let (costo, descuentos, redondeo): (i64, i64, i64) = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(COALESCE(u.costo, 0)), 0), COALESCE(SUM(v.descuento_cent), 0), COALESCE(SUM(v.redondeo_cent), 0)
               FROM ventas v LEFT JOIN {ITEMS_POR_VENTA} u ON u.venta_id = v.id
              WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2"
        ),
        [&c.desde, &c.hasta],
        |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)),
    )?;
    Ok(Totales {
        ventas: r.ventas,
        anuladas: r.anuladas,
        unidades: r.unidades,
        total_cent: r.total_cent,
        ganancia_cent: r.total_cent - costo,
        descuentos_cent: descuentos,
        redondeo_cent: redondeo,
        ticket_promedio_cent: if r.ventas > 0 { r.total_cent / r.ventas } else { 0 },
        adelantos_cent: r.adelantos_cent,
    })
}

pub fn mas_vendidos(conn: &Connection, c: &Consulta, limite: i64) -> Result<Vec<LibroVendido>> {
    let mut st = conn.prepare(
        "SELECT i.libro_id, MAX(i.titulo), SUM(i.cantidad), SUM(i.total_cent), SUM(i.total_cent - i.cantidad * i.costo_unit_cent)
           FROM venta_items i JOIN ventas v ON v.id = i.venta_id
          WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2
          GROUP BY i.libro_id ORDER BY 3 DESC, 4 DESC, 2 LIMIT ?3",
    )?;
    let filas = st.query_map(rusqlite::params![c.desde, c.hasta, limite], |f| {
        Ok(LibroVendido { libro_id: f.get(0)?, titulo: f.get(1)?, unidades: f.get(2)?, total_cent: f.get(3)?, ganancia_cent: f.get(4)? })
    })?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub fn categorias(conn: &Connection, c: &Consulta) -> Result<Vec<CategoriaVendida>> {
    let mut st = conn.prepare(
        "SELECT k.clave, k.nombre, k.color, SUM(i.cantidad), SUM(i.total_cent)
           FROM venta_items i JOIN ventas v ON v.id = i.venta_id JOIN libros l ON l.id = i.libro_id JOIN categorias k ON k.id = l.categoria_id
          WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2
          GROUP BY k.id ORDER BY 5 DESC",
    )?;
    let filas = st.query_map([&c.desde, &c.hasta], |f| {
        Ok(CategoriaVendida { clave: f.get(0)?, nombre: f.get(1)?, color: f.get(2)?, unidades: f.get(3)?, total_cent: f.get(4)? })
    })?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

fn grupos(conn: &Connection, c: &Consulta, expresion: &str, extra_join: &str) -> Result<Vec<Grupo>> {
    let mut st = conn.prepare(&format!(
        "SELECT {expresion}, count(*), SUM(v.total_cent) FROM ventas v {extra_join}
          WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2 GROUP BY 1 ORDER BY 3 DESC"
    ))?;
    let filas = st.query_map([&c.desde, &c.hasta], |f| Ok(Grupo { nombre: f.get(0)?, ventas: f.get(1)?, total_cent: f.get(2)? }))?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

/// Libros con stock, sin ventas ni ingresos desde `dias_sin_mov` días. Los más antiguos primero.
const SIN_MOV: &str = "
    SELECT l.id, l.titulo, l.autor, k.nombre, l.stock, l.costo_cent, l.precio_cent,
           MAX(COALESCE((SELECT MAX(v.fecha) FROM venta_items i JOIN ventas v ON v.id = i.venta_id WHERE i.libro_id = l.id AND v.anulada = 0), ''),
               COALESCE((SELECT MAX(m.fecha) FROM movimientos_stock m WHERE m.libro_id = l.id AND m.motivo IN ('alta', 'ingreso')), ''),
               l.creado) AS ref
      FROM libros l JOIN categorias k ON k.id = l.categoria_id
     WHERE l.activo = 1 AND l.stock > 0";

pub fn sin_movimiento(conn: &Connection, c: &Consulta, limite: i64) -> Result<(Vec<SinMovimiento>, i64, i64)> {
    let corte: String =
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, ?2)", [&c.ahora, &format!("-{} days", c.dias_sin_mov)], |f| f.get(0))?;
    let mut st = conn.prepare(&format!(
        "SELECT * FROM (SELECT x.*, CAST(julianday(?2) - julianday(x.ref) AS INTEGER) AS dias FROM ({SIN_MOV}) x WHERE x.ref < ?1) ORDER BY ref ASC, id LIMIT ?3"
    ))?;
    let lista = st
        .query_map(rusqlite::params![corte, c.ahora, limite], |f| {
            Ok(SinMovimiento {
                libro_id: f.get(0)?,
                titulo: f.get(1)?,
                autor: f.get(2)?,
                categoria: f.get(3)?,
                stock: f.get(4)?,
                costo_cent: f.get(5)?,
                precio_cent: f.get(6)?,
                dias: f.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let (total, inmovilizado): (i64, i64) = conn.query_row(
        &format!("SELECT count(*), COALESCE(SUM(x.stock * x.costo_cent), 0) FROM ({SIN_MOV}) x WHERE x.ref < ?1"),
        [&corte],
        |f| Ok((f.get(0)?, f.get(1)?)),
    )?;
    Ok((lista, total, inmovilizado))
}

pub fn reporte(conn: &Connection, c: &Consulta) -> Result<Reporte> {
    validar(c, true)?;
    let (sin_movimiento, sin_movimiento_total, inmovilizado_cent) = sin_movimiento(conn, c, 50)?;
    Ok(Reporte {
        totales: totales(conn, c)?,
        serie: serie(conn, c)?,
        caja: ventas::resumen(conn, &c.desde, &c.hasta)?.por_metodo,
        mas_vendidos: mas_vendidos(conn, c, 10)?,
        categorias: categorias(conn, c)?,
        por_tipo: grupos(conn, c, "v.tipo_nombre", "")?,
        por_vendedora: grupos(conn, c, "u.nombre", "JOIN usuarios u ON u.id = v.usuario_id")?,
        sin_movimiento,
        sin_movimiento_total,
        inmovilizado_cent,
    })
}

// ── CSV ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TipoCsv {
    Ventas,
    MasVendidos,
    SinMovimiento,
    Caja,
}

/// Campo de texto para CSV: entre comillas si hace falta, y a prueba de «inyección de fórmulas» en Excel.
fn campo(t: &str) -> String {
    let t = if t.starts_with(['=', '+', '-', '@', '\t', '\r']) { format!("'{t}") } else { t.to_string() };
    if t.contains([',', '"', '\n', '\r']) { format!("\"{}\"", t.replace('"', "\"\"")) } else { t }
}

fn soles(c: i64) -> String {
    format!("{}{}.{:02}", if c < 0 { "-" } else { "" }, c.abs() / 100, c.abs() % 100)
}

fn linea(campos: &[String]) -> String {
    format!("{}\r\n", campos.join(","))
}

fn metodo_nombre(m: Metodo) -> &'static str {
    match m {
        Metodo::Efectivo => "Efectivo",
        Metodo::Tarjeta => "Tarjeta",
        Metodo::YapePlin => "Yape/Plin",
        Metodo::Transferencia => "Transferencia",
    }
}

/// El contenido del CSV (sin BOM; quien lo guarda en archivo lo antepone para que Excel lea las tildes).
pub fn csv(conn: &Connection, tipo: TipoCsv, c: &Consulta) -> Result<String> {
    validar(c, false)?;
    let mut s = String::new();
    match tipo {
        TipoCsv::Ventas => {
            s += &linea(
                &[
                    "Venta",
                    "Fecha",
                    "Hora",
                    "Estado",
                    "Vendedora",
                    "Cliente",
                    "Tipo de cliente",
                    "Libro",
                    "Cantidad",
                    "Precio unitario",
                    "Descuento del ítem",
                    "Total del ítem",
                    "Total de la venta",
                    "Métodos de pago",
                ]
                .map(String::from),
            );
            let m = modificador(c.tz_min);
            let mut st = conn.prepare(
                "SELECT v.id, strftime('%Y-%m-%d', v.fecha, ?3), strftime('%H:%M', v.fecha, ?3), v.anulada, u.nombre, v.cliente_nombre, v.tipo_nombre,
                        i.titulo, i.cantidad, i.precio_unit_cent, i.descuento_cent, i.total_cent, v.total_cent,
                        (SELECT group_concat(p.metodo || ' ' || printf('%d.%02d', p.monto_cent / 100, p.monto_cent % 100), ' + ') FROM pagos p WHERE p.venta_id = v.id)
                   FROM ventas v JOIN usuarios u ON u.id = v.usuario_id JOIN venta_items i ON i.venta_id = v.id
                  WHERE v.fecha >= ?1 AND v.fecha < ?2 ORDER BY v.fecha, v.id, i.id",
            )?;
            let filas = st.query_map(rusqlite::params![c.desde, c.hasta, m], |f| {
                Ok((
                    f.get::<_, i64>(0)?,
                    f.get::<_, String>(1)?,
                    f.get::<_, String>(2)?,
                    f.get::<_, i64>(3)?,
                    f.get::<_, String>(4)?,
                    f.get::<_, String>(5)?,
                    f.get::<_, String>(6)?,
                    f.get::<_, String>(7)?,
                    f.get::<_, i64>(8)?,
                    f.get::<_, i64>(9)?,
                    f.get::<_, i64>(10)?,
                    f.get::<_, i64>(11)?,
                    f.get::<_, i64>(12)?,
                    f.get::<_, Option<String>>(13)?.unwrap_or_default(),
                ))
            })?;
            for r in filas {
                let r = r?;
                let metodos =
                    r.13.replace("efectivo", "Efectivo")
                        .replace("tarjeta", "Tarjeta")
                        .replace("yape_plin", "Yape/Plin")
                        .replace("transferencia", "Transferencia");
                s += &linea(&[
                    r.0.to_string(),
                    r.1,
                    r.2,
                    if r.3 == 1 { "Anulada".into() } else { "Vigente".into() },
                    campo(&r.4),
                    campo(&r.5),
                    campo(&r.6),
                    campo(&r.7),
                    r.8.to_string(),
                    soles(r.9),
                    soles(r.10),
                    soles(r.11),
                    soles(r.12),
                    campo(&metodos),
                ]);
            }
        }
        TipoCsv::MasVendidos => {
            s += &linea(&["Posición", "Libro", "Unidades", "Vendido", "Ganancia estimada"].map(String::from));
            for (i, l) in mas_vendidos(conn, c, 1000)?.iter().enumerate() {
                s += &linea(&[(i + 1).to_string(), campo(&l.titulo), l.unidades.to_string(), soles(l.total_cent), soles(l.ganancia_cent)]);
            }
        }
        TipoCsv::SinMovimiento => {
            s += &linea(
                &[
                    "Libro",
                    "Autor",
                    "Categoría",
                    "Stock",
                    "Costo unitario",
                    "Precio",
                    "Días sin movimiento",
                    "Dinero detenido (stock × costo)",
                ]
                .map(String::from),
            );
            for l in sin_movimiento(conn, c, 100_000)?.0 {
                s += &linea(&[
                    campo(&l.titulo),
                    campo(&l.autor),
                    campo(&l.categoria),
                    l.stock.to_string(),
                    soles(l.costo_cent),
                    soles(l.precio_cent),
                    l.dias.to_string(),
                    soles(l.stock * l.costo_cent),
                ]);
            }
        }
        TipoCsv::Caja => {
            s += &linea(&["Método de pago", "Monto cobrado"].map(String::from));
            let t = totales(conn, c)?;
            for p in ventas::resumen(conn, &c.desde, &c.hasta)?.por_metodo {
                s += &linea(&[metodo_nombre(p.metodo).into(), soles(p.monto_cent)]);
            }
            s += &linea(&["Incluye adelantos de encargos".into(), soles(t.adelantos_cent)]);
        }
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;
    use crate::libros::{LibroEntrada, guardar};
    use crate::usuarios::{Rol, Usuaria, crear};
    use crate::ventas::{ItemEntrada, PagoEntrada, VentaEntrada, registrar};

    fn libro(c: &mut Connection, t: &str, cat: &str, precio: i64, costo: i64, stock: i64) -> i64 {
        guardar(
            c,
            &LibroEntrada {
                titulo: t.into(),
                categoria: cat.into(),
                precio_cent: precio,
                costo_cent: Some(costo),
                stock,
                ..Default::default()
            },
            None,
            true,
        )
        .unwrap()
        .id
    }

    fn vender(c: &mut Connection, quien: &Usuaria, libro: i64, cant: i64, metodo: Metodo, monto: i64, tipo: i64) -> i64 {
        let e = VentaEntrada {
            items: vec![ItemEntrada { libro_id: libro, cantidad: cant, descuento: None }],
            tipo_cliente_id: tipo,
            cliente_id: None,
            cliente_nombre: None,
            descuento: None,
            encargo_id: None,
            pagos: vec![PagoEntrada { metodo, monto_cent: monto, recibido_cent: None }],
        };
        registrar(c, &e, quien).unwrap().id
    }

    fn consulta(desde: &str, hasta: &str, agrupar: Agrupar) -> Consulta {
        Consulta {
            desde: desde.into(),
            hasta: hasta.into(),
            tz_min: -300,
            agrupar,
            dias_sin_mov: 90,
            ahora: "2026-10-14T20:00:00.000Z".into(),
        }
    }

    #[test]
    fn reporte_completo() {
        let mut c = en_memoria();
        let duena = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let a = libro(&mut c, "El Principito", "literarias", 3500, 2000, 10);
        let b = libro(&mut c, "Cálculo", "universitarios", 18900, 15000, 5);
        let sin = libro(&mut c, "Polvoriento", "otros", 1000, 400, 4);
        vender(&mut c, &duena, a, 2, Metodo::YapePlin, 7000, 1);
        let v2 = vender(&mut c, &duena, b, 1, Metodo::Efectivo, 18900, 1);
        vender(&mut c, &duena, a, 1, Metodo::Tarjeta, 2975, 2); // Profesor −15 %
        crate::ventas::anular(&mut c, v2, "prueba", &duena).unwrap();
        // fechas controladas: todas las ventas en el mismo día local (14 oct, hora de Lima)
        c.execute("UPDATE ventas SET fecha = '2026-10-14T15:00:00.000Z'", []).unwrap();
        c.execute("UPDATE movimientos_stock SET fecha = '2026-01-01T00:00:00.000Z'", []).unwrap();
        c.execute("UPDATE libros SET creado = '2026-01-01T00:00:00.000Z'", []).unwrap();
        let q = consulta("2026-10-13T05:00:00.000Z", "2026-10-16T05:00:00.000Z", Agrupar::Dia);
        let r = reporte(&c, &q).unwrap();
        assert_eq!((r.totales.ventas, r.totales.anuladas, r.totales.unidades), (2, 1, 3));
        assert_eq!(r.totales.total_cent, 7000 + 2975);
        // ganancia: 7000 − 2×2000 = 3000 y 2975 − 2000 = 975
        assert_eq!(r.totales.ganancia_cent, 3975);
        assert_eq!(r.totales.ticket_promedio_cent, 9975 / 2);
        assert_eq!(r.totales.descuentos_cent, 525);
        // serie con los días sin ventas en cero (13, 14 y 15 de octubre)
        let dias: Vec<_> = r.serie.iter().map(|p| (p.etiqueta.as_str(), p.ventas, p.total_cent)).collect();
        assert_eq!(dias, [("2026-10-13", 0, 0), ("2026-10-14", 2, 9975), ("2026-10-15", 0, 0)]);
        // más vendidos y categorías (sin la venta anulada)
        assert_eq!((r.mas_vendidos[0].titulo.as_str(), r.mas_vendidos[0].unidades), ("El Principito", 3));
        assert_eq!(r.mas_vendidos.len(), 1);
        assert_eq!(r.categorias.len(), 1);
        // tipos de cliente, vendedoras y caja
        assert_eq!(r.por_tipo.iter().map(|g| g.nombre.as_str()).collect::<Vec<_>>(), ["Público", "Profesor"]);
        assert_eq!(r.por_vendedora[0].ventas, 2);
        assert_eq!(r.caja.len(), 2);
        // sin movimiento: «Cálculo» (anulada) y «Polvoriento» no vendieron; «El Principito» sí
        let sm: Vec<_> = r.sin_movimiento.iter().map(|l| l.titulo.as_str()).collect();
        assert_eq!(sm, ["Cálculo", "Polvoriento"]);
        assert_eq!(r.sin_movimiento_total, 2);
        assert_eq!(r.inmovilizado_cent, 5 * 15000 + 4 * 400);
        assert!(r.sin_movimiento[0].dias > 250);
        assert!(r.sin_movimiento.iter().all(|l| l.libro_id != a));
        let _ = sin;
        // por meses
        let m = reporte(&c, &consulta("2026-08-01T05:00:00.000Z", "2026-11-01T05:00:00.000Z", Agrupar::Mes)).unwrap();
        assert_eq!(m.serie.iter().map(|p| p.etiqueta.as_str()).collect::<Vec<_>>(), ["2026-08", "2026-09", "2026-10"]);
        assert_eq!(m.serie[2].total_cent, 9975);
        // período vacío o inválido
        assert!(reporte(&c, &consulta("2026-10-16T05:00:00.000Z", "2026-10-13T05:00:00.000Z", Agrupar::Dia)).is_err());
        assert!(reporte(&c, &consulta("2020-01-01T05:00:00.000Z", "2026-10-13T05:00:00.000Z", Agrupar::Dia)).is_err());
    }

    #[test]
    fn el_costo_queda_fijo_en_la_venta() {
        let mut c = en_memoria();
        let duena = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let a = libro(&mut c, "El Principito", "literarias", 3500, 2000, 10);
        vender(&mut c, &duena, a, 1, Metodo::Tarjeta, 3500, 1);
        c.execute("UPDATE libros SET costo_cent = 3000", []).unwrap(); // el costo sube después
        let q = Consulta {
            ahora: "2099-01-01T00:00:00.000Z".into(),
            ..consulta("2000-01-01T00:00:00.000Z", "2999-01-01T00:00:00.000Z", Agrupar::Mes)
        };
        let t = totales(&c, &Consulta { hasta: "2030-01-01T00:00:00.000Z".into(), ..q }).unwrap();
        assert_eq!(t.ganancia_cent, 1500);
    }

    #[test]
    fn csv_seguro_y_completo() {
        let mut c = en_memoria();
        let duena = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let a = libro(&mut c, "=SUMA(1+1), \"raro\"", "literarias", 3500, 2000, 10);
        vender(&mut c, &duena, a, 2, Metodo::YapePlin, 7000, 1);
        let q = consulta("2000-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z", Agrupar::Mes);
        let v = csv(&c, TipoCsv::Ventas, &q).unwrap();
        let lineas: Vec<_> = v.lines().collect();
        assert_eq!(lineas.len(), 2);
        assert!(lineas[0].starts_with("Venta,Fecha,Hora,Estado,Vendedora"));
        // una celda que empieza con «=» se neutraliza y las comas y comillas se escapan
        assert!(lineas[1].contains("\"'=SUMA(1+1), \"\"raro\"\"\""), "{}", lineas[1]);
        assert!(lineas[1].contains(",2,35.00,0.00,70.00,70.00,Yape/Plin 70.00"), "{}", lineas[1]);
        assert!(csv(&c, TipoCsv::MasVendidos, &q).unwrap().contains(",2,70.00,30.00"));
        assert!(csv(&c, TipoCsv::Caja, &q).unwrap().contains("Yape/Plin,70.00"));
        assert!(csv(&c, TipoCsv::SinMovimiento, &q).unwrap().starts_with("Libro,Autor"));
    }
}
