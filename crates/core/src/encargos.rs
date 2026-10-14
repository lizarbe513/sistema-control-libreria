//! Encargos: libros que el cliente pide (no los hay o están agotados). Estados:
//! pendiente → pedido al proveedor → llegó → avisado → entregado (al venderlo) / cancelado.
//! Puede dejar un adelanto, que cuenta en la caja del día en que se recibe y se descuenta al entregar.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::busqueda::normalizar;
use crate::clientes::{self, ClienteEntrada, digitos};
use crate::error::{Error, Result, invalido};
use crate::usuarios::{Rol, Usuaria};
use crate::ventas::{Metodo, soles};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Estado {
    Pendiente,
    Pedido,
    Llego,
    Avisado,
    Entregado,
    Cancelado,
}

impl Estado {
    pub fn texto(self) -> &'static str {
        match self {
            Estado::Pendiente => "pendiente",
            Estado::Pedido => "pedido",
            Estado::Llego => "llego",
            Estado::Avisado => "avisado",
            Estado::Entregado => "entregado",
            Estado::Cancelado => "cancelado",
        }
    }
    fn desde(t: &str) -> Estado {
        match t {
            "pedido" => Estado::Pedido,
            "llego" => Estado::Llego,
            "avisado" => Estado::Avisado,
            "entregado" => Estado::Entregado,
            "cancelado" => Estado::Cancelado,
            _ => Estado::Pendiente,
        }
    }
    pub fn activo(self) -> bool {
        !matches!(self, Estado::Entregado | Estado::Cancelado)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdelantoEntrada {
    pub metodo: Metodo,
    pub monto_cent: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EncargoEntrada {
    /// Cliente ya registrado…
    pub cliente_id: Option<i64>,
    /// …o uno nuevo, que se registra en la misma operación.
    pub cliente: Option<ClienteEntrada>,
    pub libro_id: Option<i64>,
    pub titulo: String,
    pub autor: String,
    pub cantidad: Option<i64>,
    pub notas: String,
    pub adelanto: Option<AdelantoEntrada>,
    /// Costo del proveedor (opcional).
    pub costo_cent: Option<i64>,
    /// Precio que se le dice al cliente. Sin precio y con costo, se calcula con el margen de Ajustes.
    pub precio_acordado_cent: Option<i64>,
    /// Portada de referencia (de la búsqueda en internet) mientras el libro no está en el inventario.
    pub portada_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Encargo {
    pub id: i64,
    pub cliente_id: i64,
    pub cliente: String,
    pub telefono: String,
    pub libro_id: Option<i64>,
    pub titulo: String,
    pub autor: String,
    pub cantidad: i64,
    pub estado: Estado,
    pub notas: String,
    pub creado: String,
    pub actualizado: String,
    pub fecha_pedido: Option<String>,
    pub fecha_llego: Option<String>,
    pub fecha_aviso: Option<String>,
    pub fecha_cierre: Option<String>,
    pub venta_id: Option<i64>,
    /// Adelanto neto (adelantos menos devoluciones).
    pub adelanto_cent: i64,
    /// Del libro enlazado (para la tarjeta y el saldo).
    pub precio_cent: Option<i64>,
    pub stock: Option<i64>,
    pub portada: Option<String>,
    pub color_tapa: Option<String>,
    pub formato: Option<String>,
    pub categoria: Option<String>,
    pub costo_cent: Option<i64>,
    pub precio_acordado_cent: Option<i64>,
    pub portada_url: Option<String>,
}

const SELECT: &str = "
    SELECT e.id, e.cliente_id, c.nombre, c.telefono, e.libro_id, e.titulo, e.autor, e.cantidad, e.estado, e.notas,
           e.creado, e.actualizado, e.fecha_pedido, e.fecha_llego, e.fecha_aviso, e.fecha_cierre, e.venta_id,
           (SELECT COALESCE(SUM(monto_cent), 0) FROM encargo_pagos p WHERE p.encargo_id = e.id),
           l.precio_cent, l.stock, l.portada, l.color_tapa, l.formato, k.clave,
           e.costo_cent, e.precio_acordado_cent, e.portada_url
      FROM encargos e JOIN clientes c ON c.id = e.cliente_id
      LEFT JOIN libros l ON l.id = e.libro_id LEFT JOIN categorias k ON k.id = l.categoria_id";

fn fila(f: &rusqlite::Row) -> rusqlite::Result<Encargo> {
    Ok(Encargo {
        id: f.get(0)?,
        cliente_id: f.get(1)?,
        cliente: f.get(2)?,
        telefono: f.get(3)?,
        libro_id: f.get(4)?,
        titulo: f.get(5)?,
        autor: f.get(6)?,
        cantidad: f.get(7)?,
        estado: Estado::desde(&f.get::<_, String>(8)?),
        notas: f.get(9)?,
        creado: f.get(10)?,
        actualizado: f.get(11)?,
        fecha_pedido: f.get(12)?,
        fecha_llego: f.get(13)?,
        fecha_aviso: f.get(14)?,
        fecha_cierre: f.get(15)?,
        venta_id: f.get(16)?,
        adelanto_cent: f.get(17)?,
        precio_cent: f.get(18)?,
        stock: f.get(19)?,
        portada: f.get(20)?,
        color_tapa: f.get(21)?,
        formato: f.get(22)?,
        categoria: f.get(23)?,
        costo_cent: f.get(24)?,
        precio_acordado_cent: f.get(25)?,
        portada_url: f.get(26)?,
    })
}

pub fn obtener(conn: &Connection, id: i64) -> Result<Encargo> {
    conn.query_row(&format!("{SELECT} WHERE e.id = ?1"), [id], fila).optional()?.ok_or_else(|| Error::NoEncontrado("ese encargo".into()))
}

/// Activos (los más antiguos primero: son los que más esperan) o cerrados (los recientes primero).
pub fn listar(conn: &Connection, activos: bool) -> Result<Vec<Encargo>> {
    let sql = if activos {
        format!("{SELECT} WHERE e.estado NOT IN ('entregado', 'cancelado') ORDER BY e.creado, e.id")
    } else {
        format!("{SELECT} WHERE e.estado IN ('entregado', 'cancelado') ORDER BY e.fecha_cierre DESC, e.id DESC LIMIT 100")
    };
    let mut st = conn.prepare(&sql)?;
    let filas = st.query_map([], fila)?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub(crate) fn adelanto_neto(conn: &Connection, id: i64) -> Result<i64> {
    Ok(conn.query_row("SELECT COALESCE(SUM(monto_cent), 0) FROM encargo_pagos WHERE encargo_id = ?1", [id], |f| f.get(0))?)
}

pub fn crear(conn: &mut Connection, e: &EncargoEntrada, quien: &Usuaria) -> Result<Encargo> {
    let cantidad = e.cantidad.unwrap_or(1);
    if !(1..=999).contains(&cantidad) {
        return invalido("La cantidad debe ser al menos 1");
    }
    if let Some(a) = &e.adelanto
        && a.monto_cent <= 0
    {
        return invalido("El adelanto debe ser de más de S/ 0.00");
    }
    if e.costo_cent.is_some_and(|c| c < 0) || e.precio_acordado_cent.is_some_and(|c| c < 0) {
        return invalido("El costo y el precio no pueden ser negativos");
    }
    if e.portada_url.as_deref().is_some_and(|u| !(u.starts_with("https://") || u.starts_with("http://"))) {
        return invalido("Dirección de portada no válida");
    }
    let tx = conn.transaction()?;
    let (mut titulo, mut autor) = (e.titulo.trim().to_string(), e.autor.trim().to_string());
    if let Some(l) = e.libro_id {
        let (t, a): (String, String) = tx
            .query_row("SELECT titulo, autor FROM libros WHERE id = ?1 AND activo = 1", [l], |f| Ok((f.get(0)?, f.get(1)?)))
            .optional()?
            .ok_or_else(|| Error::NoEncontrado("ese libro".into()))?;
        if titulo.is_empty() {
            titulo = t;
        }
        if autor.is_empty() {
            autor = a;
        }
    }
    if titulo.is_empty() {
        return invalido("Escribe qué libro encarga el cliente");
    }
    let cliente_id = match (e.cliente_id, &e.cliente) {
        (Some(id), _) => clientes::obtener(&tx, id)?.id,
        (None, Some(nuevo)) => clientes::crear_rapido(&tx, nuevo)?.id,
        (None, None) => return invalido("Elige o registra al cliente que hace el encargo"),
    };
    // el precio: el acordado; o, con costo, costo + margen; o, si el libro ya está, el de la tienda
    let precio = match (e.precio_acordado_cent, e.costo_cent) {
        (Some(p), _) => Some(p),
        (None, Some(c)) => Some(precio_con_margen(c, margen(&tx)?)),
        (None, None) => None,
    };
    let portada_url = if e.libro_id.is_some() { None } else { e.portada_url.clone() };
    tx.execute(
        "INSERT INTO encargos (cliente_id, libro_id, titulo, autor, cantidad, notas, usuario_id, costo_cent, precio_acordado_cent, portada_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![cliente_id, e.libro_id, titulo, autor, cantidad, e.notas.trim(), quien.id, e.costo_cent, precio, portada_url],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(a) = &e.adelanto {
        tx.execute(
            "INSERT INTO encargo_pagos (encargo_id, metodo, monto_cent, usuario_id) VALUES (?1, ?2, ?3, ?4)",
            params![id, a.metodo.texto(), a.monto_cent, quien.id],
        )?;
    }
    tx.commit()?;
    obtener(conn, id)
}

/// Mueve el encargo entre los estados activos, o lo cancela. «Entregado» solo ocurre al registrar la venta.
/// Al cancelar con `devolver_adelanto`, se anota la devolución (negativa) con fecha de hoy, por cada método.
pub fn cambiar_estado(conn: &mut Connection, id: i64, estado: Estado, devolver_adelanto: bool, quien: &Usuaria) -> Result<Encargo> {
    if estado == Estado::Entregado {
        return invalido("Para entregar un encargo, usa «Vender y entregar»");
    }
    let tx = conn.transaction()?;
    let actual: String = tx
        .query_row("SELECT estado FROM encargos WHERE id = ?1", [id], |f| f.get(0))
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("ese encargo".into()))?;
    if !Estado::desde(&actual).activo() {
        return invalido(format!("Ese encargo ya está {actual}"));
    }
    let columna = match estado {
        Estado::Pedido => Some("fecha_pedido"),
        Estado::Llego => Some("fecha_llego"),
        Estado::Avisado => Some("fecha_aviso"),
        Estado::Cancelado => Some("fecha_cierre"),
        _ => None,
    };
    let fecha = columna.map(|c| format!(", {c} = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")).unwrap_or_default();
    tx.execute(
        &format!("UPDATE encargos SET estado = ?2, actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'){fecha} WHERE id = ?1"),
        params![id, estado.texto()],
    )?;
    if estado == Estado::Cancelado && devolver_adelanto {
        let por_metodo: Vec<(String, i64)> = {
            let mut st = tx.prepare(
                "SELECT metodo, SUM(monto_cent) FROM encargo_pagos WHERE encargo_id = ?1 GROUP BY metodo HAVING SUM(monto_cent) > 0",
            )?;
            st.query_map([id], |f| Ok((f.get(0)?, f.get(1)?)))?.collect::<rusqlite::Result<_>>()?
        };
        for (metodo, monto) in por_metodo {
            tx.execute(
                "INSERT INTO encargo_pagos (encargo_id, metodo, monto_cent, usuario_id) VALUES (?1, ?2, ?3, ?4)",
                params![id, metodo, -monto, quien.id],
            )?;
        }
    }
    tx.commit()?;
    obtener(conn, id)
}

/// Enlaza el encargo con un libro del inventario (p. ej. cuando el libro llega como alta nueva).
pub fn enlazar_libro(conn: &Connection, id: i64, libro_id: i64) -> Result<Encargo> {
    let (titulo, autor): (String, String) = conn
        .query_row("SELECT titulo, autor FROM libros WHERE id = ?1 AND activo = 1", [libro_id], |f| Ok((f.get(0)?, f.get(1)?)))
        .optional()?
        .ok_or_else(|| Error::NoEncontrado("ese libro".into()))?;
    let n = conn.execute(
        "UPDATE encargos SET libro_id = ?2, titulo = ?3, autor = CASE WHEN ?4 <> '' THEN ?4 ELSE autor END,
                actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?1 AND estado NOT IN ('entregado', 'cancelado')",
        params![id, libro_id, titulo, autor],
    )?;
    if n == 0 {
        return invalido("Ese encargo ya no está activo");
    }
    obtener(conn, id)
}

/// Encargos de un libro en ciertos estados (p. ej. pendiente/pedido, para la carta de «¡llegó!»).
pub fn por_libro(conn: &Connection, libro_id: i64, estados: &[Estado]) -> Result<Vec<Encargo>> {
    let lista = estados.iter().map(|e| format!("'{}'", e.texto())).collect::<Vec<_>>().join(",");
    let mut st = conn.prepare(&format!("{SELECT} WHERE e.libro_id = ?1 AND e.estado IN ({lista}) ORDER BY e.creado"))?;
    let filas = st.query_map([libro_id], fila)?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

fn clave(t: &str) -> String {
    normalizar(t).split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Encargos activos sin libro enlazado cuyo título se parece a `titulo` (al dar de alta un libro nuevo).
pub fn coincidencias(conn: &Connection, titulo: &str) -> Result<Vec<Encargo>> {
    let buscado = clave(titulo);
    if buscado.chars().count() < 3 {
        return Ok(vec![]);
    }
    let mut st =
        conn.prepare(&format!("{SELECT} WHERE e.libro_id IS NULL AND e.estado NOT IN ('entregado', 'cancelado') ORDER BY e.creado"))?;
    let todos: Vec<Encargo> = st.query_map([], fila)?.collect::<rusqlite::Result<_>>()?;
    Ok(todos
        .into_iter()
        .filter(|e| {
            let k = clave(&e.titulo);
            k == buscado
                || (k.chars().count() >= 5 && buscado.contains(&k))
                || (buscado.chars().count() >= 5 && k.contains(&buscado))
                || strsim::jaro_winkler(&k, &buscado) >= 0.92
        })
        .collect())
}

// ── precio con margen ─────────────────────────────────────────────────────────

pub const MARGEN_DEFECTO: i64 = 30;

/// Margen de ganancia (%) que se aplica al costo de un libro encargado.
pub fn margen(conn: &Connection) -> Result<i64> {
    let v: Option<String> = conn.query_row("SELECT valor FROM config WHERE clave = 'margen_encargos'", [], |f| f.get(0)).optional()?;
    Ok(v.and_then(|t| t.parse().ok()).unwrap_or(MARGEN_DEFECTO))
}

/// Solo la Dueña.
pub fn fijar_margen(conn: &Connection, pct: i64, quien: &Usuaria) -> Result<i64> {
    if quien.rol != Rol::Duena {
        return Err(Error::Permiso("cambiar el margen de ganancia".into()));
    }
    if !(0..=500).contains(&pct) {
        return invalido("El margen debe estar entre 0 % y 500 %");
    }
    conn.execute(
        "INSERT INTO config (clave, valor) VALUES ('margen_encargos', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1",
        [pct.to_string()],
    )?;
    Ok(pct)
}

/// Precio de venta = costo + margen %, subido al siguiente múltiplo de 10 céntimos (precios «redondos» para el cliente).
pub fn precio_con_margen(costo_cent: i64, margen_pct: i64) -> i64 {
    let arriba = |n: i64, d: i64| (n + d - 1) / d;
    let cent = arriba(costo_cent * (100 + margen_pct), 100);
    arriba(cent, 10) * 10
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

pub const PLANTILLA_DEFECTO: &str = "¡Hola, {cliente}! 📚 Te escribimos de la librería {tienda}. Ya llegó tu encargo: «{libro}». \
Te lo tenemos separado para cuando puedas pasar a recogerlo. {saldo}¡Te esperamos! 💕";

pub fn plantilla(conn: &Connection) -> Result<String> {
    let v: Option<String> = conn.query_row("SELECT valor FROM config WHERE clave = 'plantilla_whatsapp'", [], |f| f.get(0)).optional()?;
    Ok(v.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| PLANTILLA_DEFECTO.into()))
}

/// Solo la Dueña. Con texto vacío vuelve a la plantilla por defecto.
pub fn fijar_plantilla(conn: &Connection, texto: &str, quien: &Usuaria) -> Result<String> {
    if quien.rol != Rol::Duena {
        return Err(Error::Permiso("cambiar el mensaje de WhatsApp".into()));
    }
    if texto.chars().count() > 1000 {
        return invalido("El mensaje es demasiado largo (máximo 1000 letras)");
    }
    if texto.trim().is_empty() {
        conn.execute("DELETE FROM config WHERE clave = 'plantilla_whatsapp'", [])?;
    } else {
        conn.execute(
            "INSERT INTO config (clave, valor) VALUES ('plantilla_whatsapp', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1",
            [texto.trim()],
        )?;
    }
    plantilla(conn)
}

/// Rellena la plantilla para un encargo. `{saldo}`: lo que falta pagar (si se sabe el precio) o el adelanto dejado.
pub fn mensaje(conn: &Connection, id: i64, tienda: &str) -> Result<String> {
    let e = obtener(conn, id)?;
    let saldo = match (e.precio_acordado_cent.or(e.precio_cent), e.adelanto_cent) {
        (Some(p), a) if p * e.cantidad - a > 0 => format!("Saldo a pagar: {}. ", soles(p * e.cantidad - a)),
        (Some(_), a) if a > 0 => "Ya está pagado por completo. ".into(),
        (None, a) if a > 0 => format!("Ya dejaste {} de adelanto. ", soles(a)),
        _ => String::new(),
    };
    let nombre = e.cliente.split_whitespace().next().unwrap_or(&e.cliente).to_string();
    Ok(plantilla(conn)?.replace("{cliente}", &nombre).replace("{libro}", &e.titulo).replace("{tienda}", tienda).replace("{saldo}", &saldo))
}

/// `https://wa.me/<número>?text=<mensaje>`. Un celular peruano de 9 dígitos (empieza con 9) recibe el código 51.
pub fn url_whatsapp(telefono: &str, mensaje: &str) -> Result<String> {
    let mut num = digitos(telefono);
    if num.len() == 9 && num.starts_with('9') {
        num = format!("51{num}");
    }
    if num.len() < 8 {
        return invalido("Este cliente no tiene un teléfono válido para WhatsApp: agrégalo en su ficha");
    }
    Ok(format!("https://wa.me/{num}?text={}", codificar(mensaje)))
}

/// Codificación de URL (RFC 3986): todo lo que no es «no reservado» va como %XX de sus bytes UTF-8.
fn codificar(t: &str) -> String {
    let mut s = String::with_capacity(t.len() * 3);
    for b in t.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            s.push(b as char);
        } else {
            s.push_str(&format!("%{b:02X}"));
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;
    use crate::libros::{LibroEntrada, guardar};
    use crate::usuarios::crear as crear_usuaria;
    use crate::ventas::{self, ItemEntrada, PagoEntrada, VentaEntrada};

    struct Mundo {
        c: Connection,
        duena: Usuaria,
        vendedora: Usuaria,
        libro: i64,
    }

    fn mundo() -> Mundo {
        let mut c = en_memoria();
        let duena = crear_usuaria(&c, "Marisol", Rol::Duena, "2468").unwrap();
        let vendedora = crear_usuaria(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        let libro = guardar(
            &mut c,
            &LibroEntrada { titulo: "Rayuela".into(), categoria: "literarias".into(), precio_cent: 5500, ..Default::default() },
            None,
            true,
        )
        .unwrap()
        .id;
        Mundo { c, duena, vendedora, libro }
    }

    fn nuevo(m: &mut Mundo, libro: Option<i64>, titulo: &str, adelanto: Option<(Metodo, i64)>) -> Encargo {
        let e = EncargoEntrada {
            cliente: Some(ClienteEntrada { nombre: "Rosa Quispe".into(), telefono: "987 654 321".into(), ..Default::default() }),
            libro_id: libro,
            titulo: titulo.into(),
            adelanto: adelanto.map(|(metodo, monto_cent)| AdelantoEntrada { metodo, monto_cent }),
            ..Default::default()
        };
        crear(&mut m.c, &e, &m.vendedora).unwrap()
    }

    #[test]
    fn crear_con_cliente_nuevo_y_adelanto() {
        let mut m = mundo();
        let e = nuevo(&mut m, None, "  Los ríos profundos ", Some((Metodo::YapePlin, 1000)));
        assert_eq!(
            (e.titulo.as_str(), e.estado, e.adelanto_cent, e.cliente.as_str()),
            ("Los ríos profundos", Estado::Pendiente, 1000, "Rosa Quispe")
        );
        let e2 = {
            let l = m.libro;
            nuevo(&mut m, Some(l), "", None)
        };
        assert_eq!(e2.titulo, "Rayuela");
        assert_eq!(e2.precio_cent, Some(5500));
        assert!(crear(&mut m.c, &EncargoEntrada { titulo: "X".into(), ..Default::default() }, &m.vendedora).is_err(), "sin cliente");
        assert_eq!(listar(&m.c, true).unwrap().len(), 2);
    }

    #[test]
    fn estados_fechas_y_cancelacion_con_devolucion() {
        let mut m = mundo();
        let e = {
            let l = m.libro;
            nuevo(&mut m, Some(l), "", Some((Metodo::Efectivo, 2000)))
        };
        let e = cambiar_estado(&mut m.c, e.id, Estado::Pedido, false, &m.vendedora).unwrap();
        assert!(e.fecha_pedido.is_some());
        let e = cambiar_estado(&mut m.c, e.id, Estado::Llego, false, &m.vendedora).unwrap();
        assert!(e.fecha_llego.is_some());
        assert!(cambiar_estado(&mut m.c, e.id, Estado::Entregado, false, &m.vendedora).is_err());
        assert_eq!(por_libro(&m.c, m.libro, &[Estado::Llego]).unwrap().len(), 1);
        // la caja del día cuenta el adelanto; al cancelar con devolución, se compensa
        let (d, h) = ("2000-01-01T00:00:00Z", "2999-01-01T00:00:00Z");
        assert_eq!(ventas::resumen(&m.c, d, h).unwrap().adelantos_cent, 2000);
        let e = cambiar_estado(&mut m.c, e.id, Estado::Cancelado, true, &m.duena).unwrap();
        assert_eq!((e.estado, e.adelanto_cent), (Estado::Cancelado, 0));
        let r = ventas::resumen(&m.c, d, h).unwrap();
        assert_eq!(r.adelantos_cent, 0);
        assert!(r.por_metodo.is_empty());
        assert!(cambiar_estado(&mut m.c, e.id, Estado::Pendiente, false, &m.duena).is_err(), "cerrado");
        assert_eq!(listar(&m.c, false).unwrap().len(), 1);
    }

    #[test]
    fn vender_y_entregar_descuenta_el_adelanto() {
        let mut m = mundo();
        crate::libros::ajustar_stock(&mut m.c, m.libro, 2, "ingreso", "", None, true).unwrap();
        let e = {
            let l = m.libro;
            nuevo(&mut m, Some(l), "", Some((Metodo::YapePlin, 1000)))
        };
        let venta = |pagos: Vec<PagoEntrada>| VentaEntrada {
            items: vec![ItemEntrada { libro_id: m.libro, cantidad: 1, descuento: None }],
            tipo_cliente_id: 1,
            cliente_id: None,
            cliente_nombre: None,
            descuento: None,
            encargo_id: Some(e.id),
            pagos,
        };
        // 55,00 − 10,00 de adelanto = 45,00; en efectivo exacto (sin céntimos sueltos)
        let mal = ventas::registrar(
            &mut m.c,
            &venta(vec![PagoEntrada { metodo: Metodo::Efectivo, monto_cent: 5500, recibido_cent: None }]),
            &m.vendedora,
        );
        assert!(mal.unwrap_err().to_string().contains("más que el total"));
        let v = ventas::registrar(
            &mut m.c,
            &venta(vec![PagoEntrada { metodo: Metodo::Efectivo, monto_cent: 4500, recibido_cent: Some(5000) }]),
            &m.vendedora,
        )
        .unwrap();
        assert_eq!((v.total_cent, v.adelanto_cent, v.cliente.as_str()), (5500, 1000, "Rosa Quispe"));
        let e2 = obtener(&m.c, e.id).unwrap();
        assert_eq!((e2.estado, e2.venta_id), (Estado::Entregado, Some(v.id)));
        // no se entrega dos veces
        assert!(
            ventas::registrar(
                &mut m.c,
                &venta(vec![PagoEntrada { metodo: Metodo::Tarjeta, monto_cent: 4500, recibido_cent: None }]),
                &m.vendedora
            )
            .is_err()
        );
        // anular la venta reabre el encargo con su adelanto
        ventas::anular(&mut m.c, v.id, "error", &m.duena).unwrap();
        let e3 = obtener(&m.c, e.id).unwrap();
        assert_eq!((e3.estado, e3.venta_id, e3.adelanto_cent), (Estado::Avisado, None, 1000));
        // caja: el adelanto cuenta como Yape, la venta anulada no cuenta
        let r = ventas::resumen(&m.c, "2000-01-01T00:00:00Z", "2999-01-01T00:00:00Z").unwrap();
        assert_eq!(r.por_metodo.len(), 1);
        assert_eq!(r.por_metodo[0].monto_cent, 1000);
        // la ficha del cliente tiene el encargo
        assert_eq!(clientes::ficha(&m.c, e.cliente_id).unwrap().encargos.len(), 1);
    }

    #[test]
    fn redondeo_con_adelanto() {
        // 55,47 − 10,00 = 45,47 en efectivo → 45,40
        assert_eq!(
            ventas::redondeo_efectivo(5547, 1000, &[PagoEntrada { metodo: Metodo::Efectivo, monto_cent: 4540, recibido_cent: None }]),
            7
        );
    }

    #[test]
    fn precio_con_margen_y_encargo_con_costo() {
        assert_eq!(precio_con_margen(2000, 30), 2600);
        assert_eq!(precio_con_margen(2349, 30), 3060); // 30,537 → 30,60
        assert_eq!(precio_con_margen(1000, 0), 1000);
        let mut m = mundo();
        assert_eq!(margen(&m.c).unwrap(), 30);
        assert!(fijar_margen(&m.c, 40, &m.vendedora).is_err());
        assert_eq!(fijar_margen(&m.c, 50, &m.duena).unwrap(), 50);
        assert!(fijar_margen(&m.c, 900, &m.duena).is_err());
        // sin precio y con costo: costo + margen (50 %)
        let e = EncargoEntrada {
            cliente: Some(ClienteEntrada { nombre: "Ana".into(), ..Default::default() }),
            titulo: "Los heraldos negros".into(),
            costo_cent: Some(2000),
            portada_url: Some("https://covers.openlibrary.org/b/id/1-L.jpg".into()),
            ..Default::default()
        };
        let a = crear(&mut m.c, &e, &m.vendedora).unwrap();
        assert_eq!((a.costo_cent, a.precio_acordado_cent), (Some(2000), Some(3000)));
        assert_eq!(a.portada_url.as_deref(), Some("https://covers.openlibrary.org/b/id/1-L.jpg"));
        // un precio acordado manda sobre el cálculo
        let b = crear(&mut m.c, &EncargoEntrada { precio_acordado_cent: Some(3490), ..e.clone() }, &m.vendedora).unwrap();
        assert_eq!(b.precio_acordado_cent, Some(3490));
        // si es un libro del inventario no guarda portada de referencia
        let c = crear(&mut m.c, &EncargoEntrada { libro_id: Some(m.libro), portada_url: e.portada_url.clone(), ..e.clone() }, &m.vendedora)
            .unwrap();
        assert_eq!(c.portada_url, None);
        assert!(crear(&mut m.c, &EncargoEntrada { portada_url: Some("javascript:alert(1)".into()), ..e }, &m.vendedora).is_err());
        // el saldo del aviso usa el precio acordado
        let t = mensaje(&m.c, a.id, "X").unwrap();
        assert!(t.contains("Saldo a pagar: S/ 30.00"), "{t}");
    }

    #[test]
    fn coincidencias_por_titulo() {
        let mut m = mundo();
        nuevo(&mut m, None, "Los Ríos Profundos", None);
        nuevo(&mut m, None, "Rayuela", None);
        assert_eq!(coincidencias(&m.c, "los rios profundos").unwrap().len(), 1);
        assert_eq!(coincidencias(&m.c, "Los ríos profundos (edición escolar)").unwrap().len(), 1);
        assert!(coincidencias(&m.c, "Cien años de soledad").unwrap().is_empty());
        let e = coincidencias(&m.c, "rayuela").unwrap().remove(0);
        let e = enlazar_libro(&m.c, e.id, m.libro).unwrap();
        assert_eq!(e.libro_id, Some(m.libro));
        assert!(coincidencias(&m.c, "rayuela").unwrap().is_empty(), "ya enlazado");
    }

    #[test]
    fn mensaje_y_url_de_whatsapp() {
        let mut m = mundo();
        let e = {
            let l = m.libro;
            nuevo(&mut m, Some(l), "", Some((Metodo::Efectivo, 1500)))
        };
        let t = mensaje(&m.c, e.id, "SIGLO XXI").unwrap();
        assert!(t.starts_with("¡Hola, Rosa! 📚"), "{t}");
        assert!(t.contains("«Rayuela»") && t.contains("Saldo a pagar: S/ 40.00") && t.contains("SIGLO XXI"), "{t}");
        let u = url_whatsapp("987 654 321", "Hola, ¿qué tal? & 50%").unwrap();
        assert_eq!(u, "https://wa.me/51987654321?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F%20%26%2050%25");
        assert!(url_whatsapp("+34 600 111 222", "x").unwrap().starts_with("https://wa.me/34600111222?"));
        assert!(url_whatsapp("", "x").is_err());
        // plantilla
        assert!(fijar_plantilla(&m.c, "Hola {cliente}", &m.vendedora).is_err());
        assert_eq!(fijar_plantilla(&m.c, "Hola {cliente}, llegó {libro}", &m.duena).unwrap(), "Hola {cliente}, llegó {libro}");
        assert_eq!(mensaje(&m.c, e.id, "X").unwrap(), "Hola Rosa, llegó Rayuela");
        assert_eq!(fijar_plantilla(&m.c, "  ", &m.duena).unwrap(), PLANTILLA_DEFECTO);
    }
}
