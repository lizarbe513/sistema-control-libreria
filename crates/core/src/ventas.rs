//! Ventas: cálculo de descuentos y redondeo, registro (con descuento de stock), anulación y resúmenes.
//! Todos los montos van en céntimos. El cálculo vive aquí y solo aquí: la interfaz lo imita para mostrar totales
//! mientras se arma la venta, pero al registrar siempre se recalcula en este módulo.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result, invalido};
use crate::libros::mover_stock;
use crate::usuarios::{Rol, Usuaria};

/// Descuento escrito a mano: un porcentaje entero o un monto en céntimos.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "tipo", content = "valor", rename_all = "lowercase")]
pub enum Descuento {
    Pct(i64),
    Monto(i64),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Metodo {
    Efectivo,
    Tarjeta,
    YapePlin,
    Transferencia,
}

impl Metodo {
    fn texto(self) -> &'static str {
        match self {
            Metodo::Efectivo => "efectivo",
            Metodo::Tarjeta => "tarjeta",
            Metodo::YapePlin => "yape_plin",
            Metodo::Transferencia => "transferencia",
        }
    }
    fn desde(t: &str) -> Metodo {
        match t {
            "tarjeta" => Metodo::Tarjeta,
            "yape_plin" => Metodo::YapePlin,
            "transferencia" => Metodo::Transferencia,
            _ => Metodo::Efectivo,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEntrada {
    pub libro_id: i64,
    pub cantidad: i64,
    #[serde(default)]
    pub descuento: Option<Descuento>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagoEntrada {
    pub metodo: Metodo,
    /// Lo que este pago aporta al total (en efectivo, sin contar el vuelto).
    pub monto_cent: i64,
    /// Solo efectivo: lo que entregó el cliente. El vuelto es la diferencia con `monto_cent`.
    #[serde(default)]
    pub recibido_cent: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VentaEntrada {
    pub items: Vec<ItemEntrada>,
    pub tipo_cliente_id: i64,
    #[serde(default)]
    pub cliente_id: Option<i64>,
    /// Nombre que dio el cliente (opcional). Vacío: el del cliente registrado o «Cliente».
    #[serde(default)]
    pub cliente_nombre: Option<String>,
    /// Descuento al total, después de los de cada libro y el del tipo de cliente.
    #[serde(default)]
    pub descuento: Option<Descuento>,
    pub pagos: Vec<PagoEntrada>,
}

// ── cálculo ──────────────────────────────────────────────────────────────────

fn validar_descuento(d: Option<Descuento>) -> Result<()> {
    match d {
        Some(Descuento::Pct(p)) if !(0..=100).contains(&p) => invalido("El descuento debe estar entre 0 % y 100 %"),
        Some(Descuento::Monto(m)) if m < 0 => invalido("El descuento no puede ser negativo"),
        _ => Ok(()),
    }
}

/// Cuánto se descuenta de `base`. Con porcentaje, lo que queda se redondea hacia abajo al céntimo: a favor del cliente.
pub fn monto_descuento(base: i64, d: Option<Descuento>) -> i64 {
    match d {
        None => 0,
        Some(Descuento::Pct(p)) => base - base * (100 - p) / 100,
        Some(Descuento::Monto(m)) => m.min(base),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Linea {
    pub bruto_cent: i64,
    /// Descuento del libro más el del tipo de cliente.
    pub descuento_cent: i64,
    pub total_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Calculo {
    pub lineas: Vec<Linea>,
    pub subtotal_cent: i64,
    /// Todos los descuentos juntos (libros, tipo de cliente y total).
    pub descuento_cent: i64,
    /// Total antes del redondeo de efectivo.
    pub total_previo_cent: i64,
}

/// `lineas`: (precio unitario, cantidad, descuento del libro). Orden: libro → tipo de cliente → total.
pub fn calcular(lineas: &[(i64, i64, Option<Descuento>)], tipo_pct: i64, total: Option<Descuento>) -> Result<Calculo> {
    validar_descuento(total)?;
    let mut res = Vec::with_capacity(lineas.len());
    for &(precio, cantidad, d) in lineas {
        validar_descuento(d)?;
        let bruto = precio * cantidad;
        let tras_libro = bruto - monto_descuento(bruto, d);
        let tras_tipo = tras_libro * (100 - tipo_pct) / 100;
        res.push(Linea { bruto_cent: bruto, descuento_cent: bruto - tras_tipo, total_cent: tras_tipo });
    }
    let subtotal: i64 = res.iter().map(|l| l.bruto_cent).sum();
    let base: i64 = res.iter().map(|l| l.total_cent).sum();
    let previo = base - monto_descuento(base, total);
    Ok(Calculo { lineas: res, subtotal_cent: subtotal, descuento_cent: subtotal - previo, total_previo_cent: previo })
}

/// En efectivo no circulan monedas de 1 y 5 céntimos: lo que se paga en efectivo se baja a múltiplo de 10 céntimos,
/// a favor del cliente. Los demás métodos cobran exacto. Devuelve cuánto se perdona.
pub fn redondeo_efectivo(total_previo: i64, pagos: &[PagoEntrada]) -> i64 {
    if !pagos.iter().any(|p| p.metodo == Metodo::Efectivo) {
        return 0;
    }
    let otros: i64 = pagos.iter().filter(|p| p.metodo != Metodo::Efectivo).map(|p| p.monto_cent).sum();
    let efectivo = total_previo - otros;
    if efectivo >= 10 { efectivo % 10 } else { 0 }
}

pub fn soles(c: i64) -> String {
    format!("S/ {}.{:02}", c / 100, c % 100)
}

// ── tipos de cliente y tope ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TipoCliente {
    pub id: i64,
    pub nombre: String,
    pub descuento_pct: i64,
    pub activo: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TipoEntrada {
    pub id: Option<i64>,
    pub nombre: String,
    pub descuento_pct: i64,
    pub activo: bool,
}

pub fn tipos(conn: &Connection, solo_activos: bool) -> Result<Vec<TipoCliente>> {
    let mut st =
        conn.prepare("SELECT id, nombre, descuento_pct, activo FROM tipos_cliente WHERE activo = 1 OR ?1 = 0 ORDER BY orden, id")?;
    let filas = st.query_map([solo_activos], |f| {
        Ok(TipoCliente { id: f.get(0)?, nombre: f.get(1)?, descuento_pct: f.get(2)?, activo: f.get::<_, i64>(3)? == 1 })
    })?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

fn solo_duena(quien: &Usuaria, accion: &str) -> Result<()> {
    if quien.rol == Rol::Duena { Ok(()) } else { Err(Error::Permiso(accion.into())) }
}

pub fn guardar_tipo(conn: &mut Connection, e: &TipoEntrada, quien: &Usuaria) -> Result<Vec<TipoCliente>> {
    solo_duena(quien, "cambiar los tipos de cliente")?;
    let nombre = e.nombre.trim();
    if nombre.is_empty() {
        return invalido("Escribe el nombre del tipo de cliente");
    }
    if !(0..=100).contains(&e.descuento_pct) {
        return invalido("El descuento debe estar entre 0 % y 100 %");
    }
    let tx = conn.transaction()?;
    match e.id {
        Some(id) => {
            let n = tx.execute(
                "UPDATE tipos_cliente SET nombre = ?2, descuento_pct = ?3, activo = ?4 WHERE id = ?1",
                params![id, nombre, e.descuento_pct, e.activo],
            )?;
            if n == 0 {
                return Err(Error::NoEncontrado("ese tipo de cliente".into()));
            }
        }
        None => {
            tx.execute(
                "INSERT INTO tipos_cliente (nombre, descuento_pct, orden, activo)
                 VALUES (?1, ?2, (SELECT COALESCE(MAX(orden), 0) + 1 FROM tipos_cliente), ?3)",
                params![nombre, e.descuento_pct, e.activo],
            )?;
        }
    }
    let activos: i64 = tx.query_row("SELECT count(*) FROM tipos_cliente WHERE activo = 1", [], |f| f.get(0))?;
    if activos == 0 {
        return invalido("Debe quedar al menos un tipo de cliente activo");
    }
    tx.commit()?;
    tipos(conn, false)
}

const TOPE_DEFECTO: i64 = 10;

/// Porcentaje máximo de descuento a mano para vendedoras (la Dueña no tiene límite).
pub fn tope_descuento(conn: &Connection) -> Result<i64> {
    let v: Option<String> =
        conn.query_row("SELECT valor FROM config WHERE clave = 'tope_descuento_vendedora'", [], |f| f.get(0)).optional()?;
    Ok(v.and_then(|t| t.parse().ok()).unwrap_or(TOPE_DEFECTO))
}

pub fn fijar_tope(conn: &Connection, pct: i64, quien: &Usuaria) -> Result<i64> {
    solo_duena(quien, "cambiar el tope de descuento")?;
    if !(0..=100).contains(&pct) {
        return invalido("El tope debe estar entre 0 % y 100 %");
    }
    conn.execute(
        "INSERT INTO config (clave, valor) VALUES ('tope_descuento_vendedora', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1",
        [pct.to_string()],
    )?;
    Ok(pct)
}

// ── ventas ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ItemVenta {
    pub libro_id: i64,
    pub titulo: String,
    pub cantidad: i64,
    pub precio_unit_cent: i64,
    pub descuento_cent: i64,
    pub total_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PagoVenta {
    pub metodo: Metodo,
    pub monto_cent: i64,
    pub recibido_cent: Option<i64>,
    pub vuelto_cent: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Venta {
    pub id: i64,
    pub fecha: String,
    pub usuario_id: i64,
    pub vendedora: String,
    pub cliente_id: Option<i64>,
    /// Siempre tiene valor: el nombre dado, el del cliente registrado o «Cliente».
    pub cliente: String,
    pub tipo_nombre: String,
    pub tipo_pct: i64,
    pub subtotal_cent: i64,
    pub descuento_cent: i64,
    pub redondeo_cent: i64,
    pub total_cent: i64,
    pub anulada: bool,
    pub anulada_fecha: Option<String>,
    pub motivo_anulacion: String,
    pub items: Vec<ItemVenta>,
    pub pagos: Vec<PagoVenta>,
}

const SELECT_VENTA: &str = "
    SELECT v.id, v.fecha, v.usuario_id, u.nombre, v.cliente_id, v.cliente_nombre, v.tipo_nombre, v.tipo_pct, v.subtotal_cent,
           v.descuento_cent, v.redondeo_cent, v.total_cent, v.anulada, v.anulada_fecha, v.motivo_anulacion
      FROM ventas v JOIN usuarios u ON u.id = v.usuario_id ";

fn cargar(conn: &Connection, f: &rusqlite::Row) -> rusqlite::Result<Venta> {
    let id: i64 = f.get(0)?;
    let mut items = conn.prepare(
        "SELECT libro_id, titulo, cantidad, precio_unit_cent, descuento_cent, total_cent FROM venta_items WHERE venta_id = ?1 ORDER BY id",
    )?;
    let items = items
        .query_map([id], |i| {
            Ok(ItemVenta {
                libro_id: i.get(0)?,
                titulo: i.get(1)?,
                cantidad: i.get(2)?,
                precio_unit_cent: i.get(3)?,
                descuento_cent: i.get(4)?,
                total_cent: i.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut pagos = conn.prepare("SELECT metodo, monto_cent, recibido_cent, vuelto_cent FROM pagos WHERE venta_id = ?1 ORDER BY id")?;
    let pagos = pagos
        .query_map([id], |p| {
            Ok(PagoVenta {
                metodo: Metodo::desde(&p.get::<_, String>(0)?),
                monto_cent: p.get(1)?,
                recibido_cent: p.get(2)?,
                vuelto_cent: p.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Venta {
        id,
        fecha: f.get(1)?,
        usuario_id: f.get(2)?,
        vendedora: f.get(3)?,
        cliente_id: f.get(4)?,
        cliente: f.get(5)?,
        tipo_nombre: f.get(6)?,
        tipo_pct: f.get(7)?,
        subtotal_cent: f.get(8)?,
        descuento_cent: f.get(9)?,
        redondeo_cent: f.get(10)?,
        total_cent: f.get(11)?,
        anulada: f.get::<_, i64>(12)? == 1,
        anulada_fecha: f.get(13)?,
        motivo_anulacion: f.get(14)?,
        items,
        pagos,
    })
}

pub fn obtener(conn: &Connection, id: i64) -> Result<Venta> {
    conn.query_row(&format!("{SELECT_VENTA} WHERE v.id = ?1"), [id], |f| cargar(conn, f))
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("esa venta".into()))
}

/// Ventas con fecha en `[desde, hasta)` (instantes ISO en UTC: la interfaz convierte el día local), las más nuevas primero.
pub fn listar(conn: &Connection, desde: &str, hasta: &str) -> Result<Vec<Venta>> {
    let mut st = conn.prepare(&format!("{SELECT_VENTA} WHERE v.fecha >= ?1 AND v.fecha < ?2 ORDER BY v.fecha DESC, v.id DESC"))?;
    let filas = st.query_map([desde, hasta], |f| cargar(conn, f))?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub fn registrar(conn: &mut Connection, e: &VentaEntrada, quien: &Usuaria) -> Result<Venta> {
    if e.items.is_empty() {
        return invalido("Agrega al menos un libro a la venta");
    }
    if e.items.iter().any(|i| i.cantidad <= 0) {
        return invalido("La cantidad debe ser al menos 1");
    }
    let tx = conn.transaction()?;
    let (tipo_nombre, tipo_pct): (String, i64) = tx
        .query_row("SELECT nombre, descuento_pct FROM tipos_cliente WHERE id = ?1 AND activo = 1", [e.tipo_cliente_id], |f| {
            Ok((f.get(0)?, f.get(1)?))
        })
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("ese tipo de cliente".into()))?;
    // nombre del cliente: el que escribió la vendedora, o el de la ficha registrada, o «Cliente»
    let registrado: Option<String> = match e.cliente_id {
        Some(c) => Some(
            tx.query_row("SELECT nombre FROM clientes WHERE id = ?1", [c], |f| f.get(0))
                .optional()?
                .ok_or_else(|| Error::NoEncontrado("ese cliente".into()))?,
        ),
        None => None,
    };
    let escrito = e.cliente_nombre.as_deref().map(str::trim).filter(|n| !n.is_empty());
    let cliente_nombre: String = escrito.map(String::from).or(registrado).unwrap_or_else(|| "Cliente".into());
    if cliente_nombre.chars().count() > 80 {
        return invalido("El nombre del cliente es demasiado largo (máximo 80 letras)");
    }

    // precios vigentes (el precio que manda la interfaz no se usa: lo que cobra es el de la base)
    let mut libros = Vec::with_capacity(e.items.len());
    for i in &e.items {
        let (titulo, precio): (String, i64) = tx
            .query_row("SELECT titulo, precio_cent FROM libros WHERE id = ?1 AND activo = 1", [i.libro_id], |f| Ok((f.get(0)?, f.get(1)?)))
            .optional()?
            .ok_or_else(|| Error::NoEncontrado("uno de los libros".into()))?;
        libros.push((titulo, precio));
    }
    let lineas: Vec<_> = e.items.iter().zip(&libros).map(|(i, (_, p))| (*p, i.cantidad, i.descuento)).collect();
    let calc = calcular(&lineas, tipo_pct, e.descuento)?;

    // tope de descuento a mano para vendedoras
    if quien.rol != Rol::Duena {
        let tope = tope_descuento(&tx)?;
        let pasa = |base: i64, d: Option<Descuento>| monto_descuento(base, d) * 100 > base * tope;
        let base: i64 = calc.lineas.iter().map(|l| l.total_cent).sum();
        let por_libro = lineas.iter().any(|&(p, c, d)| pasa(p * c, d));
        if por_libro || pasa(base, e.descuento) {
            return invalido(format!("Los descuentos a mano llegan hasta {tope} % sin la Dueña"));
        }
    }

    // pagos
    if e.pagos.is_empty() {
        return invalido("Agrega al menos un pago");
    }
    if e.pagos.iter().any(|p| p.monto_cent <= 0) {
        return invalido("Cada pago debe ser de más de S/ 0.00");
    }
    let redondeo = redondeo_efectivo(calc.total_previo_cent, &e.pagos);
    let total = calc.total_previo_cent - redondeo;
    let pagado: i64 = e.pagos.iter().map(|p| p.monto_cent).sum();
    if pagado < total {
        return invalido(format!("Faltan {} por cobrar", soles(total - pagado)));
    }
    if pagado > total {
        return invalido(format!("Los pagos suman {} más que el total", soles(pagado - total)));
    }
    for p in &e.pagos {
        if let Some(r) = p.recibido_cent
            && (p.metodo != Metodo::Efectivo || r < p.monto_cent)
        {
            return invalido("Lo recibido en efectivo no puede ser menos que el monto del pago");
        }
    }

    tx.execute(
        "INSERT INTO ventas (usuario_id, cliente_id, tipo_cliente_id, tipo_nombre, tipo_pct, subtotal_cent, descuento_cent, redondeo_cent, total_cent, cliente_nombre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![quien.id, e.cliente_id, e.tipo_cliente_id, tipo_nombre, tipo_pct, calc.subtotal_cent, calc.descuento_cent, redondeo, total, cliente_nombre],
    )?;
    let id = tx.last_insert_rowid();
    for ((i, (titulo, precio)), l) in e.items.iter().zip(&libros).zip(&calc.lineas) {
        tx.execute(
            "INSERT INTO venta_items (venta_id, libro_id, titulo, cantidad, precio_unit_cent, descuento_cent, total_cent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, i.libro_id, titulo, i.cantidad, precio, l.descuento_cent, l.total_cent],
        )?;
        mover_stock(&tx, i.libro_id, -i.cantidad, "venta", &format!("venta #{id}"), Some(quien.id), true)?;
    }
    for p in &e.pagos {
        let (recibido, vuelto) = match (p.metodo, p.recibido_cent) {
            (Metodo::Efectivo, Some(r)) => (Some(r), Some(r - p.monto_cent)),
            (Metodo::Efectivo, None) => (Some(p.monto_cent), Some(0)),
            _ => (None, None),
        };
        tx.execute(
            "INSERT INTO pagos (venta_id, metodo, monto_cent, recibido_cent, vuelto_cent) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, p.metodo.texto(), p.monto_cent, recibido, vuelto],
        )?;
    }
    tx.commit()?;
    obtener(conn, id)
}

/// Anula una venta (solo la Dueña): queda en el historial, tachada, y el stock vuelve a la tienda.
pub fn anular(conn: &mut Connection, id: i64, motivo: &str, quien: &Usuaria) -> Result<Venta> {
    solo_duena(quien, "anular ventas")?;
    let motivo = motivo.trim();
    if motivo.is_empty() {
        return invalido("Escribe el motivo de la anulación");
    }
    let tx = conn.transaction()?;
    let anulada: i64 = tx
        .query_row("SELECT anulada FROM ventas WHERE id = ?1", [id], |f| f.get(0))
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("esa venta".into()))?;
    if anulada == 1 {
        return invalido("Esta venta ya estaba anulada");
    }
    tx.execute(
        "UPDATE ventas SET anulada = 1, anulada_por = ?2, anulada_fecha = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), motivo_anulacion = ?3 WHERE id = ?1",
        params![id, quien.id, motivo],
    )?;
    let items: Vec<(i64, i64)> = {
        let mut st = tx.prepare("SELECT libro_id, cantidad FROM venta_items WHERE venta_id = ?1")?;
        st.query_map([id], |f| Ok((f.get(0)?, f.get(1)?)))?.collect::<rusqlite::Result<_>>()?
    };
    for (libro, cantidad) in items {
        mover_stock(&tx, libro, cantidad, "anulacion", &format!("anulación venta #{id}"), Some(quien.id), false)?;
    }
    tx.commit()?;
    obtener(conn, id)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PorMetodo {
    pub metodo: Metodo,
    pub monto_cent: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resumen {
    pub ventas: i64,
    pub anuladas: i64,
    pub unidades: i64,
    pub total_cent: i64,
    pub por_metodo: Vec<PorMetodo>,
}

/// Resumen de las ventas (sin las anuladas) con fecha en `[desde, hasta)`.
pub fn resumen(conn: &Connection, desde: &str, hasta: &str) -> Result<Resumen> {
    let (ventas, total): (i64, i64) = conn.query_row(
        "SELECT count(*), COALESCE(SUM(total_cent), 0) FROM ventas WHERE anulada = 0 AND fecha >= ?1 AND fecha < ?2",
        [desde, hasta],
        |f| Ok((f.get(0)?, f.get(1)?)),
    )?;
    let anuladas: i64 =
        conn.query_row("SELECT count(*) FROM ventas WHERE anulada = 1 AND fecha >= ?1 AND fecha < ?2", [desde, hasta], |f| f.get(0))?;
    let unidades: i64 = conn.query_row(
        "SELECT COALESCE(SUM(i.cantidad), 0) FROM venta_items i JOIN ventas v ON v.id = i.venta_id
          WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2",
        [desde, hasta],
        |f| f.get(0),
    )?;
    let mut st = conn.prepare(
        "SELECT p.metodo, SUM(p.monto_cent) FROM pagos p JOIN ventas v ON v.id = p.venta_id
          WHERE v.anulada = 0 AND v.fecha >= ?1 AND v.fecha < ?2 GROUP BY p.metodo ORDER BY p.metodo",
    )?;
    let por_metodo = st
        .query_map([desde, hasta], |f| Ok(PorMetodo { metodo: Metodo::desde(&f.get::<_, String>(0)?), monto_cent: f.get(1)? }))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(Resumen { ventas, anuladas, unidades, total_cent: total, por_metodo })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;
    use crate::libros::{LibroEntrada, guardar, obtener as libro};
    use crate::usuarios::crear;

    fn efectivo(m: i64) -> PagoEntrada {
        PagoEntrada { metodo: Metodo::Efectivo, monto_cent: m, recibido_cent: None }
    }
    fn yape(m: i64) -> PagoEntrada {
        PagoEntrada { metodo: Metodo::YapePlin, monto_cent: m, recibido_cent: None }
    }

    struct Mundo {
        c: Connection,
        duena: Usuaria,
        vendedora: Usuaria,
        a: i64,
        b: i64,
    }

    fn mundo() -> Mundo {
        let mut c = en_memoria();
        let duena = crear(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let vendedora = crear(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        let mut alta = |t: &str, precio: i64, stock: i64| {
            guardar(
                &mut c,
                &LibroEntrada { titulo: t.into(), categoria: "literarias".into(), precio_cent: precio, stock, ..Default::default() },
                None,
                true,
            )
            .unwrap()
            .id
        };
        let a = alta("El Principito", 3500, 5);
        let b = alta("Paco Yunque", 1249, 2);
        Mundo { c, duena, vendedora, a, b }
    }

    fn venta(items: Vec<ItemEntrada>, tipo: i64, pagos: Vec<PagoEntrada>) -> VentaEntrada {
        VentaEntrada { items, tipo_cliente_id: tipo, cliente_id: None, cliente_nombre: None, descuento: None, pagos }
    }
    fn item(libro_id: i64, cantidad: i64) -> ItemEntrada {
        ItemEntrada { libro_id, cantidad, descuento: None }
    }

    #[test]
    fn semillas_de_tipos_de_cliente() {
        let m = mundo();
        let t: Vec<_> = tipos(&m.c, true).unwrap().into_iter().map(|t| (t.nombre, t.descuento_pct)).collect();
        assert_eq!(t, [("Público".to_string(), 0), ("Profesor".to_string(), 15), ("Mayorista".to_string(), 25)]);
        assert_eq!(tope_descuento(&m.c).unwrap(), 10);
    }

    #[test]
    fn descuentos_en_orden_y_a_favor_del_cliente() {
        // 2 × 35,00 con 10 % al libro → 63,00; Profesor −15 % → 53,55; −5 % al total → 50,8725 → 50,87 (queda lo menor)
        let c = calcular(&[(3500, 2, Some(Descuento::Pct(10)))], 15, Some(Descuento::Pct(5))).unwrap();
        assert_eq!(c.subtotal_cent, 7000);
        assert_eq!(c.lineas[0].total_cent, 5355);
        assert_eq!(c.total_previo_cent, 5087);
        assert_eq!(c.descuento_cent, 7000 - 5087);
        // monto fijo mayor que la base: no pasa de cero
        assert_eq!(calcular(&[(1000, 1, Some(Descuento::Monto(5000)))], 0, None).unwrap().total_previo_cent, 0);
        assert!(calcular(&[(1000, 1, Some(Descuento::Pct(101)))], 0, None).is_err());
    }

    #[test]
    fn redondeo_solo_en_efectivo() {
        assert_eq!(redondeo_efectivo(3746, &[efectivo(3746)]), 6);
        assert_eq!(redondeo_efectivo(3746, &[yape(3746)]), 0);
        // efectivo + Yape: se redondea solo lo que va en efectivo (3746 − 2000 = 1746 → 6 céntimos)
        assert_eq!(redondeo_efectivo(3746, &[yape(2000), efectivo(1740)]), 6);
        // si el efectivo es exacto a 10 céntimos, no hay redondeo
        assert_eq!(redondeo_efectivo(3750, &[yape(1750), efectivo(2000)]), 0);
    }

    #[test]
    fn venta_con_pago_dividido_y_vuelto() {
        let mut m = mundo();
        // 35,00 + 12,49 = 47,49. Yape 20,00 y el resto en efectivo: 27,49 → se cobra 27,40 (redondeo 9)
        let pagos = vec![yape(2000), PagoEntrada { metodo: Metodo::Efectivo, monto_cent: 2740, recibido_cent: Some(3000) }];
        let v = registrar(&mut m.c, &venta(vec![item(m.a, 1), item(m.b, 1)], 1, pagos), &m.vendedora).unwrap();
        assert_eq!((v.subtotal_cent, v.redondeo_cent, v.total_cent), (4749, 9, 4740));
        assert_eq!(v.pagos[1].vuelto_cent, Some(260));
        assert_eq!(libro(&m.c, m.a, false).unwrap().stock, 4);
        assert_eq!(libro(&m.c, m.b, false).unwrap().stock, 1);
        let mov: i64 = m.c.query_row("SELECT count(*) FROM movimientos_stock WHERE motivo = 'venta'", [], |f| f.get(0)).unwrap();
        assert_eq!(mov, 2);
    }

    #[test]
    fn pagos_incorrectos_no_dejan_nada() {
        let mut m = mundo();
        let corta = registrar(&mut m.c, &venta(vec![item(m.a, 1)], 1, vec![efectivo(3000)]), &m.duena).unwrap_err();
        assert!(corta.to_string().contains("Faltan S/ 5.00"), "{corta}");
        let larga = registrar(&mut m.c, &venta(vec![item(m.a, 1)], 1, vec![efectivo(3500), yape(100)]), &m.duena).unwrap_err();
        assert!(larga.to_string().contains("más que el total"), "{larga}");
        assert!(registrar(&mut m.c, &venta(vec![item(m.a, 1)], 1, vec![yape(3500)]), &m.duena).is_ok());
        // sin stock suficiente la transacción completa se deshace
        let e = registrar(&mut m.c, &venta(vec![item(m.a, 1), item(m.b, 3)], 1, vec![yape(7247)]), &m.duena).unwrap_err();
        assert!(e.to_string().contains("Solo hay 2 de «Paco Yunque»"), "{e}");
        assert_eq!(libro(&m.c, m.a, false).unwrap().stock, 4);
        let n: i64 = m.c.query_row("SELECT count(*) FROM ventas", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn tope_de_descuento_para_vendedoras() {
        let mut m = mundo();
        let con = |pct| VentaEntrada { descuento: Some(Descuento::Pct(pct)), ..venta(vec![item(m.a, 1)], 1, vec![yape(0)]) };
        let mut v = con(20);
        v.pagos = vec![yape(2800)];
        let e = registrar(&mut m.c, &v, &m.vendedora).unwrap_err();
        assert!(e.to_string().contains("10 %"), "{e}");
        // la Dueña no tiene tope
        assert_eq!(registrar(&mut m.c, &v, &m.duena).unwrap().total_cent, 2800);
        // el descuento del tipo de cliente no cuenta contra el tope (Mayorista −25 %)
        let r = registrar(&mut m.c, &venta(vec![item(m.a, 1)], 3, vec![yape(2625)]), &m.vendedora).unwrap();
        assert_eq!(r.total_cent, 2625);
        // por libro, en monto: 4,00 de 35,00 es más del 10 %
        let mut v = venta(vec![ItemEntrada { descuento: Some(Descuento::Monto(400)), ..item(m.a, 1) }], 1, vec![yape(3100)]);
        assert!(registrar(&mut m.c, &v, &m.vendedora).is_err());
        v.items[0].descuento = Some(Descuento::Monto(350));
        v.pagos = vec![yape(3150)];
        assert!(registrar(&mut m.c, &v, &m.vendedora).is_ok());
    }

    #[test]
    fn nombre_del_cliente_es_opcional() {
        let mut m = mundo();
        let mut v = venta(vec![item(m.a, 1)], 1, vec![yape(3500)]);
        // sin nombre: «Cliente»
        assert_eq!(registrar(&mut m.c, &v, &m.vendedora).unwrap().cliente, "Cliente");
        // espacios no cuentan; el nombre escrito se conserva (recortado)
        v.cliente_nombre = Some("   ".into());
        assert_eq!(registrar(&mut m.c, &v, &m.vendedora).unwrap().cliente, "Cliente");
        v.cliente_nombre = Some("  Rosa Quispe ".into());
        assert_eq!(registrar(&mut m.c, &v, &m.vendedora).unwrap().cliente, "Rosa Quispe");
        // con cliente registrado y sin nombre escrito, usa el de la ficha
        let c = crate::clientes::crear_rapido(
            &m.c,
            &crate::clientes::ClienteEntrada { nombre: "Prof. Mendoza".into(), telefono: String::new(), tipo_cliente_id: Some(2) },
        )
        .unwrap();
        v.cliente_id = Some(c.id);
        v.cliente_nombre = None;
        assert_eq!(registrar(&mut m.c, &v, &m.vendedora).unwrap().cliente, "Prof. Mendoza");
        v.cliente_nombre = Some("x".repeat(81));
        assert!(registrar(&mut m.c, &v, &m.vendedora).is_err());
    }

    #[test]
    fn anular_devuelve_el_stock() {
        let mut m = mundo();
        let v = registrar(&mut m.c, &venta(vec![item(m.a, 2)], 1, vec![yape(7000)]), &m.vendedora).unwrap();
        assert_eq!(libro(&m.c, m.a, false).unwrap().stock, 3);
        assert!(matches!(anular(&mut m.c, v.id, "error", &m.vendedora), Err(Error::Permiso(_))));
        assert!(anular(&mut m.c, v.id, "  ", &m.duena).is_err());
        let a = anular(&mut m.c, v.id, "se equivocó", &m.duena).unwrap();
        assert!(a.anulada);
        assert_eq!(libro(&m.c, m.a, false).unwrap().stock, 5);
        assert!(anular(&mut m.c, v.id, "otra vez", &m.duena).unwrap_err().to_string().contains("ya estaba anulada"));
        // si el libro se dio de baja después, la anulación igual funciona
        let v2 = registrar(&mut m.c, &venta(vec![item(m.b, 1)], 1, vec![yape(1249)]), &m.duena).unwrap();
        crate::libros::desactivar(&m.c, m.b).unwrap();
        assert!(anular(&mut m.c, v2.id, "devuelto", &m.duena).is_ok());
    }

    #[test]
    fn resumen_y_listado_del_dia() {
        let mut m = mundo();
        registrar(&mut m.c, &venta(vec![item(m.a, 1)], 1, vec![efectivo(3500)]), &m.duena).unwrap();
        let v2 = registrar(&mut m.c, &venta(vec![item(m.a, 2)], 1, vec![yape(7000)]), &m.vendedora).unwrap();
        anular(&mut m.c, v2.id, "prueba", &m.duena).unwrap();
        let (d, h) = ("2000-01-01T00:00:00Z", "2999-01-01T00:00:00Z");
        let r = resumen(&m.c, d, h).unwrap();
        assert_eq!((r.ventas, r.anuladas, r.unidades, r.total_cent), (1, 1, 1, 3500));
        assert_eq!(r.por_metodo, [PorMetodo { metodo: Metodo::Efectivo, monto_cent: 3500 }]);
        let l = listar(&m.c, d, h).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].vendedora, "Luis");
        assert!(listar(&m.c, "2000-01-01T00:00:00Z", "2000-01-02T00:00:00Z").unwrap().is_empty());
    }

    #[test]
    fn tipos_solo_la_duena_los_cambia() {
        let mut m = mundo();
        let e = TipoEntrada { id: None, nombre: "Estudiante".into(), descuento_pct: 5, activo: true };
        assert!(matches!(guardar_tipo(&mut m.c, &e, &m.vendedora), Err(Error::Permiso(_))));
        assert_eq!(guardar_tipo(&mut m.c, &e, &m.duena).unwrap().len(), 4);
        assert!(guardar_tipo(&mut m.c, &TipoEntrada { descuento_pct: 120, ..e.clone() }, &m.duena).is_err());
        assert_eq!(fijar_tope(&m.c, 20, &m.duena).unwrap(), 20);
        assert_eq!(tope_descuento(&m.c).unwrap(), 20);
        assert!(fijar_tope(&m.c, 5, &m.vendedora).is_err());
    }
}
