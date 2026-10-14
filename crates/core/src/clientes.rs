//! Clientes: ficha mínima para asociarlos a una venta (el hito de encargos la amplía).

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use crate::error::{Result, invalido};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cliente {
    pub id: i64,
    pub nombre: String,
    pub telefono: String,
    pub tipo_cliente_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClienteEntrada {
    pub nombre: String,
    #[serde(default)]
    pub telefono: String,
    pub tipo_cliente_id: Option<i64>,
}

fn fila(f: &rusqlite::Row) -> rusqlite::Result<Cliente> {
    Ok(Cliente { id: f.get(0)?, nombre: f.get(1)?, telefono: f.get(2)?, tipo_cliente_id: f.get(3)? })
}

/// Busca por nombre o teléfono (sin importar mayúsculas). Con texto vacío devuelve los más recientes.
pub fn buscar(conn: &Connection, texto: &str) -> Result<Vec<Cliente>> {
    let patron = format!("%{}%", texto.trim().replace(['%', '_'], ""));
    let mut st = conn.prepare(
        "SELECT id, nombre, telefono, tipo_cliente_id FROM clientes
          WHERE nombre LIKE ?1 OR telefono LIKE ?1 ORDER BY id DESC LIMIT 20",
    )?;
    let filas = st.query_map([patron], fila)?;
    Ok(filas.collect::<rusqlite::Result<_>>()?)
}

pub fn crear_rapido(conn: &Connection, e: &ClienteEntrada) -> Result<Cliente> {
    let nombre = e.nombre.trim();
    if nombre.is_empty() {
        return invalido("Escribe el nombre del cliente");
    }
    conn.execute(
        "INSERT INTO clientes (nombre, telefono, tipo_cliente_id) VALUES (?1, ?2, ?3)",
        params![nombre, e.telefono.trim(), e.tipo_cliente_id],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row("SELECT id, nombre, telefono, tipo_cliente_id FROM clientes WHERE id = ?1", [id], fila)?)
}
