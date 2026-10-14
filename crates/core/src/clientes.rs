//! Clientes: ficha con teléfono/WhatsApp, correo, tipo de cliente, notas e historial (compras y encargos).

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result, invalido};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cliente {
    pub id: i64,
    pub nombre: String,
    pub telefono: String,
    pub correo: String,
    pub tipo_cliente_id: Option<i64>,
    pub notas: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClienteEntrada {
    pub id: Option<i64>,
    pub nombre: String,
    pub telefono: String,
    pub correo: String,
    pub tipo_cliente_id: Option<i64>,
    pub notas: String,
}

const SELECT: &str = "SELECT id, nombre, telefono, correo, tipo_cliente_id, notas FROM clientes";

fn fila(f: &rusqlite::Row) -> rusqlite::Result<Cliente> {
    Ok(Cliente { id: f.get(0)?, nombre: f.get(1)?, telefono: f.get(2)?, correo: f.get(3)?, tipo_cliente_id: f.get(4)?, notas: f.get(5)? })
}

/// Solo los dígitos del teléfono (para comparar y para WhatsApp).
pub fn digitos(telefono: &str) -> String {
    telefono.chars().filter(char::is_ascii_digit).collect()
}

/// Busca por nombre o teléfono (sin importar mayúsculas ni espacios del número). Vacío: los más recientes.
pub fn buscar(conn: &Connection, texto: &str) -> Result<Vec<Cliente>> {
    let t = texto.trim().replace(['%', '_'], "");
    let patron = format!("%{t}%");
    let num = digitos(&t);
    let num = if num.len() >= 3 { format!("%{num}%") } else { "\u{0}".into() };
    let mut st = conn.prepare(&format!(
        "{SELECT} WHERE nombre LIKE ?1 OR telefono LIKE ?1
            OR replace(replace(replace(telefono, ' ', ''), '-', ''), '+', '') LIKE ?2
          ORDER BY id DESC LIMIT 30"
    ))?;
    let filas = st.query_map([patron, num], fila)?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub fn obtener(conn: &Connection, id: i64) -> Result<Cliente> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], fila).optional()?.ok_or_else(|| Error::NoEncontrado("ese cliente".into()))
}

/// Alta o edición de la ficha.
pub fn guardar(conn: &Connection, e: &ClienteEntrada) -> Result<Cliente> {
    let nombre = e.nombre.trim();
    if nombre.is_empty() {
        return invalido("Escribe el nombre del cliente");
    }
    if nombre.chars().count() > 80 {
        return invalido("El nombre es demasiado largo (máximo 80 letras)");
    }
    let telefono = e.telefono.trim();
    let n = digitos(telefono).len();
    if !telefono.is_empty() && !(6..=15).contains(&n) {
        return invalido("El teléfono debe tener entre 6 y 15 números");
    }
    let correo = e.correo.trim();
    if !correo.is_empty() {
        let ok = correo.split_once('@').is_some_and(|(u, d)| !u.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.'));
        if !ok || correo.contains(' ') {
            return invalido("Ese correo no parece válido");
        }
    }
    match e.id {
        Some(id) => {
            let n = conn.execute(
                "UPDATE clientes SET nombre = ?2, telefono = ?3, correo = ?4, tipo_cliente_id = ?5, notas = ?6 WHERE id = ?1",
                params![id, nombre, telefono, correo, e.tipo_cliente_id, e.notas.trim()],
            )?;
            if n == 0 {
                return Err(Error::NoEncontrado("ese cliente".into()));
            }
            obtener(conn, id)
        }
        None => {
            conn.execute(
                "INSERT INTO clientes (nombre, telefono, correo, tipo_cliente_id, notas) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![nombre, telefono, correo, e.tipo_cliente_id, e.notas.trim()],
            )?;
            obtener(conn, conn.last_insert_rowid())
        }
    }
}

/// Alta rápida (desde Vender o un encargo): solo nombre, teléfono y tipo.
pub fn crear_rapido(conn: &Connection, e: &ClienteEntrada) -> Result<Cliente> {
    guardar(conn, &ClienteEntrada { id: None, ..e.clone() })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compra {
    pub venta_id: i64,
    pub fecha: String,
    pub total_cent: i64,
    pub libros: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EncargoCorto {
    pub id: i64,
    pub titulo: String,
    pub estado: String,
    pub creado: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ficha {
    pub cliente: Cliente,
    pub compras: Vec<Compra>,
    pub encargos: Vec<EncargoCorto>,
    pub total_comprado_cent: i64,
}

/// La ficha con su historial: compras (sin las anuladas) y encargos, lo más nuevo primero.
pub fn ficha(conn: &Connection, id: i64) -> Result<Ficha> {
    let cliente = obtener(conn, id)?;
    let mut st = conn.prepare(
        "SELECT v.id, v.fecha, v.total_cent,
                (SELECT group_concat(CASE WHEN i.cantidad > 1 THEN i.cantidad || '× ' ELSE '' END || i.titulo, ', ')
                   FROM venta_items i WHERE i.venta_id = v.id)
           FROM ventas v WHERE v.cliente_id = ?1 AND v.anulada = 0 ORDER BY v.fecha DESC LIMIT 200",
    )?;
    let compras: Vec<Compra> = st
        .query_map([id], |f| {
            Ok(Compra {
                venta_id: f.get(0)?,
                fecha: f.get(1)?,
                total_cent: f.get(2)?,
                libros: f.get::<_, Option<String>>(3)?.unwrap_or_default(),
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut st = conn.prepare("SELECT id, titulo, estado, creado FROM encargos WHERE cliente_id = ?1 ORDER BY creado DESC LIMIT 200")?;
    let encargos = st
        .query_map([id], |f| Ok(EncargoCorto { id: f.get(0)?, titulo: f.get(1)?, estado: f.get(2)?, creado: f.get(3)? }))?
        .collect::<rusqlite::Result<_>>()?;
    let total = compras.iter().map(|c| c.total_cent).sum();
    Ok(Ficha { cliente, compras, encargos, total_comprado_cent: total })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::en_memoria;

    #[test]
    fn alta_edicion_y_busqueda() {
        let c = en_memoria();
        let e = ClienteEntrada { nombre: "  Rosa Quispe ".into(), telefono: "987 654 321".into(), ..Default::default() };
        let r = guardar(&c, &e).unwrap();
        assert_eq!(r.nombre, "Rosa Quispe");
        assert_eq!(buscar(&c, "rosa").unwrap().len(), 1);
        assert_eq!(buscar(&c, "987654").unwrap().len(), 1, "el número se encuentra sin espacios");
        let r = guardar(&c, &ClienteEntrada { id: Some(r.id), correo: "rosa@correo.pe".into(), ..e.clone() }).unwrap();
        assert_eq!(r.correo, "rosa@correo.pe");
        assert!(guardar(&c, &ClienteEntrada { correo: "rosa@".into(), ..e.clone() }).is_err());
        assert!(guardar(&c, &ClienteEntrada { telefono: "12".into(), ..e.clone() }).is_err());
        assert!(guardar(&c, &ClienteEntrada { nombre: " ".into(), ..e }).is_err());
        assert!(ficha(&c, r.id).unwrap().compras.is_empty());
    }
}
