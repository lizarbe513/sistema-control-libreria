//! La asistente como **agente**: puede proponer cambios (encargos, estados, stock, datos de libros, libros nuevos), pero
//! **ninguna herramienta de aquí modifica la base**. Cada propuesta se valida con los permisos de quien pregunta y trae
//! una explicación hecha por la app (no por la IA). El cambio ocurre solo cuando la persona lo confirma en la tarjeta, y
//! lo ejecuta la app con los mismos comandos de siempre.
//!
//! No hay herramientas para eliminar (dar de baja, cancelar, borrar): la IA solo puede dar un enlace `[[ir:…]]`.

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Value, json};

use crate::encargos::{self, Estado as EstadoEncargo};
use crate::isbn::{self, ResultadoLinea};
use crate::libros::{self, Libro, Ubicacion};

/// Lo que puede hacer quien pregunta.
#[derive(Debug, Clone, Copy)]
pub struct Permisos {
    pub duena: bool,
    /// La Dueña, o los vendedores si ella lo permitió.
    pub edita_libros: bool,
}

/// Un cambio ya validado, listo para ejecutarse al confirmar.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum Accion {
    Encargo { titulo: String, autor: String, libro_id: Option<i64>, portada_url: Option<String>, cantidad: i64, notas: String },
    EstadoEncargo { encargo_id: i64, estado: EstadoEncargo },
    Stock { libro_id: i64, delta: i64, motivo: String, nota: String },
    EditarLibro { libro_id: i64, cambios: Cambios },
    LibroNuevo { titulo: String, autor: String, editorial: String, anio: Option<i64>, isbn: Option<String>, categoria: String, precio_cent: Option<i64>, stock: i64, portada_url: Option<String> },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Cambios {
    pub precio_cent: Option<i64>,
    pub costo_cent: Option<i64>,
    pub categoria: Option<String>,
    pub ubicacion: Option<Ubicacion>,
    pub etiquetas: Option<Vec<String>>,
    pub sinopsis: Option<String>,
    pub stock_minimo: Option<i64>,
}

/// La propuesta: la acción, su explicación y qué falta completar en la tarjeta.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Propuesta {
    pub accion: Accion,
    pub titulo: String,
    pub explicacion: Vec<String>,
    pub libro_id: Option<i64>,
    pub encargo_id: Option<i64>,
    /// La tarjeta pide el cliente (registrado o nuevo): ese dato nunca pasa por la IA.
    pub pide_cliente: bool,
    /// Lo que la persona escribió en el chat como cliente, para precargar la búsqueda de la tarjeta.
    pub cliente_sugerido: String,
    /// La tarjeta pide precio y stock (libro nuevo).
    pub pide_precio: bool,
    pub portada_url: Option<String>,
}

fn funcion(nombre: &str, descripcion: &str, propiedades: Value, requeridos: &[&str]) -> Value {
    json!({ "type": "function", "function": {
        "name": nombre, "description": descripcion,
        "parameters": { "type": "object", "properties": propiedades, "required": requeridos },
    }})
}

const NOTA: &str = " NO hace el cambio: muestra una tarjeta para que la persona lo confirme.";

/// Las herramientas de propuesta que se ofrecen a quien pregunta.
pub fn herramientas(p: Permisos) -> Vec<Value> {
    let mut v = vec![
        funcion(
            "proponer_encargo",
            &format!("Propone encargar un libro para un cliente. El cliente se elige en la tarjeta (registrado o nuevo), nunca en el chat.{NOTA}"),
            json!({
                "titulo": { "type": "string" }, "autor": { "type": "string" },
                "libro_id": { "type": "integer", "description": "Si el libro ya existe en la tienda" },
                "ref_web": { "type": "string", "description": "Referencia de buscar_en_internet (w1, w2…), si viene de ahí" },
                "cantidad": { "type": "integer" }, "notas": { "type": "string", "description": "Sin datos personales" },
                "cliente_sugerido": { "type": "string", "description": "Solo si la persona escribió el nombre del cliente en el chat" },
            }),
            &["titulo"],
        ),
        funcion(
            "proponer_estado_encargo",
            &format!("Propone mover un encargo activo a «pedido» (ya se pidió al proveedor) o «llego» (llegó a la tienda).{NOTA}"),
            json!({ "encargo_id": { "type": "integer" }, "estado": { "type": "string", "enum": ["pedido", "llego"] } }),
            &["encargo_id", "estado"],
        ),
    ];
    if p.edita_libros {
        v.push(funcion(
            "proponer_stock",
            &format!("Propone sumar o restar ejemplares a un libro (ingreso: llegaron libros; ajuste: conteo, daño…).{NOTA}"),
            json!({
                "libro_id": { "type": "integer" },
                "cantidad": { "type": "integer", "description": "Positiva para sumar, negativa para restar" },
                "motivo": { "type": "string", "enum": ["ingreso", "ajuste"] }, "nota": { "type": "string" },
            }),
            &["libro_id", "cantidad"],
        ));
        let mut props = json!({
            "libro_id": { "type": "integer" },
            "precio_soles": { "type": "number" },
            "categoria": { "type": "string", "description": "Clave o nombre de la categoría" },
            "ubicacion": { "type": "object", "properties": { "estante": { "type": "string" }, "tramo": { "type": "integer" }, "repisa": { "type": "integer" } } },
            "etiquetas": { "type": "array", "items": { "type": "string" } },
            "sinopsis": { "type": "string" },
            "stock_minimo": { "type": "integer" },
        });
        if p.duena {
            props["costo_soles"] = json!({ "type": "number" });
        }
        v.push(funcion("proponer_editar_libro", &format!("Propone cambiar datos de un libro de la tienda.{NOTA}"), props, &["libro_id"]));
        v.push(funcion(
            "proponer_libro_nuevo",
            &format!("Propone agregar un libro nuevo al inventario (por ejemplo, uno recomendado de internet). Precio y stock se confirman en la tarjeta.{NOTA}"),
            json!({
                "titulo": { "type": "string" }, "autor": { "type": "string" }, "editorial": { "type": "string" },
                "anio": { "type": "integer" }, "isbn": { "type": "string" },
                "ref_web": { "type": "string", "description": "Referencia de buscar_en_internet (w1…), para traer la portada" },
                "categoria": { "type": "string" }, "precio_soles": { "type": "number" }, "stock": { "type": "integer" },
            }),
            &["titulo"],
        ));
    }
    v
}

pub fn es_propuesta(nombre: &str) -> bool {
    nombre.starts_with("proponer_")
}

fn txt(a: &Value, k: &str) -> String {
    a[k].as_str().unwrap_or_default().trim().to_string()
}

fn soles_a_cent(a: &Value, k: &str) -> Result<Option<i64>, String> {
    match &a[k] {
        Value::Null => Ok(None),
        v => {
            let n = v.as_f64().or_else(|| v.as_str().and_then(|s| s.replace(',', ".").parse().ok())).ok_or(format!("«{k}» no es un monto válido"))?;
            if !(0.0..=100_000.0).contains(&n) {
                return Err(format!("«{k}» está fuera de rango"));
            }
            Ok(Some((n * 100.0).round() as i64))
        }
    }
}

fn soles(c: i64) -> String {
    format!("S/ {:.2}", c as f64 / 100.0)
}

fn libro(conn: &Connection, a: &Value) -> Result<Libro, String> {
    let id = a["libro_id"].as_i64().ok_or("Falta el id del libro (búscalo primero con buscar_libros)")?;
    libros::obtener(conn, id, true).map_err(|_| format!("No existe un libro con id {id} en la tienda"))
}

/// Clave de una categoría a partir de su clave o su nombre.
fn categoria(conn: &Connection, valor: &str) -> Result<String, String> {
    let cats = libros::categorias(conn).map_err(|e| e.to_string())?;
    let v = crate::busqueda::normalizar(valor);
    cats.iter()
        .find(|c| c.clave == valor || crate::busqueda::normalizar(&c.nombre).trim() == v.trim())
        .map(|c| c.clave.clone())
        .ok_or_else(|| format!("No existe la categoría «{valor}». Hay: {}", cats.iter().map(|c| c.nombre.as_str()).collect::<Vec<_>>().join(", ")))
}

fn nombre_categoria(conn: &Connection, clave: &str) -> String {
    libros::categorias(conn).ok().and_then(|v| v.into_iter().find(|c| c.clave == clave)).map(|c| c.nombre).unwrap_or_else(|| clave.to_string())
}

fn texto_ubicacion(u: &Option<Ubicacion>) -> String {
    u.as_ref().map(|u| format!("estante {} · tramo {} · repisa {}", u.estante, u.tramo, u.repisa)).unwrap_or_else(|| "sin ubicación".into())
}

/// Valida una propuesta y arma su explicación. `web` busca un resultado de internet por su referencia (`w1`…).
pub fn proponer(conn: &Connection, p: Permisos, nombre: &str, a: &Value, web: &dyn Fn(&str) -> Option<ResultadoLinea>) -> Result<Propuesta, String> {
    let base = |accion: Accion, titulo: &str, explicacion: Vec<String>| Propuesta {
        accion,
        titulo: titulo.to_string(),
        explicacion,
        libro_id: None,
        encargo_id: None,
        pide_cliente: false,
        cliente_sugerido: String::new(),
        pide_precio: false,
        portada_url: None,
    };
    let desde_web = |a: &Value| -> Result<Option<ResultadoLinea>, String> {
        match txt(a, "ref_web") {
            r if r.is_empty() => Ok(None),
            r => web(&r).map(Some).ok_or(format!("La referencia «{r}» ya no está disponible: vuelve a buscar en internet")),
        }
    };
    match nombre {
        "proponer_encargo" => {
            let w = desde_web(a)?;
            let cantidad = a["cantidad"].as_i64().unwrap_or(1);
            if !(1..=999).contains(&cantidad) {
                return Err("La cantidad debe estar entre 1 y 999".into());
            }
            let (mut titulo, mut autor) = (txt(a, "titulo"), txt(a, "autor"));
            let mut libro_id = None;
            let mut origen = "no está en la tienda".to_string();
            if a["libro_id"].is_i64() {
                let l = libro(conn, a)?;
                (titulo, autor, libro_id) = (l.titulo.clone(), l.autor.clone(), Some(l.id));
                origen = if l.stock > 0 { format!("está en la tienda, con stock {}", l.stock) } else { "está en la tienda, agotado".into() };
            } else if let Some(w) = &w {
                if titulo.is_empty() {
                    titulo = w.titulo.clone();
                }
                if autor.is_empty() {
                    autor = w.autor.clone();
                }
                origen = "encontrado en internet".into();
            }
            if titulo.is_empty() {
                return Err("Falta el título del libro".into());
            }
            let notas = txt(a, "notas");
            let mut ex = vec![
                format!("Libro: «{titulo}»{} ({origen})", if autor.is_empty() { String::new() } else { format!(" de {autor}") }),
                format!("Cantidad: {cantidad}"),
            ];
            if !notas.is_empty() {
                ex.push(format!("Notas: {notas}"));
            }
            ex.push("Cliente: lo eliges en esta tarjeta (registrado o nuevo)".into());
            let portada_url = w.as_ref().and_then(|w| w.portada_url.clone()).filter(|_| libro_id.is_none());
            let mut pr = base(Accion::Encargo { titulo, autor, libro_id, portada_url: portada_url.clone(), cantidad, notas }, "Crear un encargo", ex);
            pr.libro_id = libro_id;
            pr.pide_cliente = true;
            pr.cliente_sugerido = txt(a, "cliente_sugerido").chars().take(60).collect();
            pr.portada_url = portada_url;
            Ok(pr)
        }
        "proponer_estado_encargo" => {
            let id = a["encargo_id"].as_i64().ok_or("Falta el id del encargo (míralo con encargos_activos)")?;
            let estado = match txt(a, "estado").as_str() {
                "pedido" => EstadoEncargo::Pedido,
                "llego" | "llegó" => EstadoEncargo::Llego,
                otro => return Err(format!("Solo puedo proponer «pedido» o «llego», no «{otro}». Cancelar o entregar se hace en Encargos")),
            };
            let e = encargos::obtener(conn, id).map_err(|_| format!("No existe el encargo {id}"))?;
            if !e.estado.activo() {
                return Err("Ese encargo ya está cerrado".into());
            }
            if e.estado == estado {
                return Err(format!("Ese encargo ya está en «{}»", estado.texto()));
            }
            let nombre_estado = |s: EstadoEncargo| match s {
                EstadoEncargo::Pendiente => "Pendiente",
                EstadoEncargo::Pedido => "Pedido",
                EstadoEncargo::Llego => "Llegó",
                EstadoEncargo::Avisado => "Avisado",
                EstadoEncargo::Entregado => "Entregado",
                EstadoEncargo::Cancelado => "Cancelado",
            };
            let mut pr = base(
                Accion::EstadoEncargo { encargo_id: id, estado },
                "Mover un encargo",
                vec![format!("Encargo: «{}» × {}", e.titulo, e.cantidad), format!("Estado: {} → {}", nombre_estado(e.estado), nombre_estado(estado))],
            );
            pr.encargo_id = Some(id);
            pr.libro_id = e.libro_id;
            Ok(pr)
        }
        "proponer_stock" => {
            if !p.edita_libros {
                return Err("No tienes permiso para cambiar el stock (pídeselo a la Dueña)".into());
            }
            let l = libro(conn, a)?;
            let delta = a["cantidad"].as_i64().ok_or("Falta la cantidad")?;
            if delta == 0 || delta.abs() > 9999 {
                return Err("La cantidad debe ser distinta de 0".into());
            }
            if l.stock + delta < 0 {
                return Err(format!("No se puede: «{}» tiene {} y quedaría en negativo", l.titulo, l.stock));
            }
            let motivo = if txt(a, "motivo") == "ajuste" || delta < 0 { "ajuste" } else { "ingreso" }.to_string();
            let nota = txt(a, "nota");
            let mut ex = vec![
                format!("Libro: «{}»", l.titulo),
                format!("{} {} {}", if delta > 0 { "Sumar" } else { "Restar" }, delta.abs(), if delta.abs() == 1 { "ejemplar" } else { "ejemplares" }),
                format!("Stock: {} → {}", l.stock, l.stock + delta),
                format!("Motivo: {}", if motivo == "ingreso" { "llegaron libros" } else { "ajuste" }),
            ];
            if !nota.is_empty() {
                ex.push(format!("Nota: {nota}"));
            }
            let mut pr = base(Accion::Stock { libro_id: l.id, delta, motivo, nota }, if delta > 0 { "Sumar stock" } else { "Ajustar stock" }, ex);
            pr.libro_id = Some(l.id);
            Ok(pr)
        }
        "proponer_editar_libro" => {
            if !p.edita_libros {
                return Err("No tienes permiso para editar libros (pídeselo a la Dueña)".into());
            }
            let l = libro(conn, a)?;
            let mut c = Cambios::default();
            let mut ex = vec![format!("Libro: «{}»", l.titulo)];
            if let Some(n) = soles_a_cent(a, "precio_soles")?
                && n != l.precio_cent
            {
                ex.push(format!("Precio: {} → {}", soles(l.precio_cent), soles(n)));
                c.precio_cent = Some(n);
            }
            if a.get("costo_soles").is_some_and(|v| !v.is_null()) {
                if !p.duena {
                    return Err("El costo solo lo cambia la Dueña".into());
                }
                if let Some(n) = soles_a_cent(a, "costo_soles")? {
                    ex.push(format!("Costo: {} → {}", soles(l.costo_cent.unwrap_or(0)), soles(n)));
                    c.costo_cent = Some(n);
                }
            }
            let cat = txt(a, "categoria");
            if !cat.is_empty() {
                let k = categoria(conn, &cat)?;
                if k != l.categoria {
                    ex.push(format!("Categoría: {} → {}", nombre_categoria(conn, &l.categoria), nombre_categoria(conn, &k)));
                    c.categoria = Some(k);
                }
            }
            if a["ubicacion"].is_object() {
                let u = &a["ubicacion"];
                let estante = u["estante"].as_str().unwrap_or_default().trim().to_uppercase();
                if estante.is_empty() {
                    return Err("Falta el estante de la ubicación".into());
                }
                let nueva = Some(Ubicacion { estante, tramo: u["tramo"].as_i64().unwrap_or(1).max(1), repisa: u["repisa"].as_i64().unwrap_or(1).max(1) });
                ex.push(format!("Ubicación: {} → {}", texto_ubicacion(&l.ubicacion), texto_ubicacion(&nueva)));
                c.ubicacion = nueva;
            }
            if let Some(et) = a["etiquetas"].as_array() {
                let et: Vec<String> = et.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                ex.push(format!("Etiquetas: {} → {}", if l.etiquetas.is_empty() { "ninguna".into() } else { l.etiquetas.join(", ") }, et.join(", ")));
                c.etiquetas = Some(et);
            }
            let sinopsis = txt(a, "sinopsis");
            if !sinopsis.is_empty() {
                ex.push(format!("Sinopsis nueva: «{}…»", sinopsis.chars().take(80).collect::<String>()));
                c.sinopsis = Some(sinopsis);
            }
            if let Some(m) = a["stock_minimo"].as_i64() {
                if !(0..=999).contains(&m) {
                    return Err("El stock mínimo no es válido".into());
                }
                ex.push(format!("Avisar cuando queden: {} → {}", l.stock_minimo, m));
                c.stock_minimo = Some(m);
            }
            if ex.len() == 1 {
                return Err("No hay ningún cambio que hacer en ese libro".into());
            }
            let mut pr = base(Accion::EditarLibro { libro_id: l.id, cambios: c }, "Editar un libro", ex);
            pr.libro_id = Some(l.id);
            Ok(pr)
        }
        "proponer_libro_nuevo" => {
            if !p.edita_libros {
                return Err("No tienes permiso para agregar libros (pídeselo a la Dueña)".into());
            }
            let w = desde_web(a)?;
            let (mut titulo, mut autor, mut editorial) = (txt(a, "titulo"), txt(a, "autor"), txt(a, "editorial"));
            let mut anio = a["anio"].as_i64();
            let mut isbn_txt = txt(a, "isbn");
            if let Some(w) = &w {
                if titulo.is_empty() {
                    titulo = w.titulo.clone();
                }
                if autor.is_empty() {
                    autor = w.autor.clone();
                }
                if editorial.is_empty() {
                    editorial = w.editorial.clone();
                }
                anio = anio.or(w.anio);
                if isbn_txt.is_empty() {
                    isbn_txt = w.isbn.clone().unwrap_or_default();
                }
            }
            if titulo.is_empty() {
                return Err("Falta el título".into());
            }
            let isbn = if isbn_txt.is_empty() { None } else { Some(isbn::normalizar(&isbn_txt).ok_or(format!("El ISBN «{isbn_txt}» no es válido"))?) };
            if let Some(i) = &isbn
                && let Ok(Some(ya)) = libros::por_codigo(conn, i, false)
            {
                return Err(format!("Ese libro ya está en la tienda (id {}): propón sumar stock en vez de agregarlo", ya.id));
            }
            let cat = txt(a, "categoria");
            let categoria = if cat.is_empty() { "otros".to_string() } else { categoria(conn, &cat)? };
            let precio_cent = soles_a_cent(a, "precio_soles")?;
            let stock = a["stock"].as_i64().unwrap_or(1).clamp(0, 9999);
            let portada_url = w.as_ref().and_then(|w| w.portada_url.clone());
            let ex = vec![
                format!("Libro: «{titulo}»{}", if autor.is_empty() { String::new() } else { format!(" de {autor}") }),
                format!("Categoría: {}", nombre_categoria(conn, &categoria)),
                format!("Precio: {} · Stock inicial: {stock} (puedes corregirlos aquí)", precio_cent.map(soles).unwrap_or_else(|| "por definir".into())),
                if portada_url.is_some() { "Portada: la de internet".into() } else { "Portada: la generada por la app".into() },
            ];
            let mut pr = base(
                Accion::LibroNuevo { titulo, autor, editorial, anio, isbn, categoria, precio_cent, stock, portada_url: portada_url.clone() },
                "Agregar un libro nuevo",
                ex,
            );
            pr.pide_precio = true;
            pr.portada_url = portada_url;
            Ok(pr)
        }
        otro => Err(format!("No existe la propuesta «{otro}»")),
    }
}

/// Lo que se le devuelve a la IA de una propuesta (sin datos de clientes: nunca los tiene).
pub fn para_la_ia(id: &str, p: &Propuesta) -> Value {
    json!({
        "propuesta": id,
        "resumen": format!("{}: {}", p.titulo, p.explicacion.join("; ")),
        "requiere_confirmacion": true,
        "indicacion": format!("Cita [[accion:{id}]] en tu respuesta, explica lo que se hará y di que falta confirmarlo en la tarjeta.{}",
            if p.pide_cliente { " Pide que elija al cliente en la tarjeta (registrado o nuevo); no pidas su teléfono en el chat." } else { "" }),
    })
}

/// Destinos válidos para los enlaces `[[ir:…]]`.
pub fn destino_valido(d: &str) -> bool {
    let num = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit());
    match d.split_once(':') {
        Some(("libro", n)) | Some(("encargo", n)) => num(n),
        Some(("ajustes", s)) => matches!(s, "usuarios" | "categorias" | "asistente"),
        None => matches!(d, "encargos" | "libros" | "reportes" | "ajustes" | "vender" | "clientes"),
        _ => false,
    }
}

/// La entrada completa de un libro con los cambios aplicados (para `libro_guardar`).
pub fn entrada_con_cambios(l: &Libro, c: &Cambios) -> libros::LibroEntrada {
    libros::LibroEntrada {
        id: Some(l.id),
        isbn: l.isbn.clone(),
        titulo: l.titulo.clone(),
        autor: l.autor.clone(),
        editorial: l.editorial.clone(),
        anio: l.anio,
        sinopsis: c.sinopsis.clone().unwrap_or_else(|| l.sinopsis.clone()),
        categoria: c.categoria.clone().unwrap_or_else(|| l.categoria.clone()),
        precio_cent: c.precio_cent.unwrap_or(l.precio_cent),
        costo_cent: c.costo_cent,
        stock: l.stock,
        stock_minimo: Some(c.stock_minimo.unwrap_or(l.stock_minimo)),
        ubicacion: c.ubicacion.clone().or_else(|| l.ubicacion.clone()),
        etiquetas: c.etiquetas.clone().unwrap_or_else(|| l.etiquetas.clone()),
        color_tapa: Some(l.color_tapa.clone()),
        formato: Some(l.formato.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clientes::ClienteEntrada;
    use crate::db::en_memoria;
    use crate::encargos::EncargoEntrada;
    use crate::libros::{LibroEntrada, guardar};
    use crate::usuarios::{Rol, crear as crear_usuaria};

    const DUENA: Permisos = Permisos { duena: true, edita_libros: true };
    const VENDEDOR: Permisos = Permisos { duena: false, edita_libros: false };

    fn mundo() -> (Connection, i64, i64) {
        let mut c = en_memoria();
        let u = crear_usuaria(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        let l = guardar(
            &mut c,
            &LibroEntrada { titulo: "Rayuela".into(), autor: "Julio Cortázar".into(), categoria: "literarias".into(), precio_cent: 5500, costo_cent: Some(3000), stock: 2, ..Default::default() },
            None,
            true,
        )
        .unwrap();
        let e = encargos::crear(
            &mut c,
            &EncargoEntrada {
                cliente: Some(ClienteEntrada { nombre: "Rosa Quispe".into(), telefono: "987654321".into(), ..Default::default() }),
                titulo: "Los ríos profundos".into(),
                ..Default::default()
            },
            &u,
        )
        .unwrap();
        (c, l.id, e.id)
    }

    fn sin_web(_: &str) -> Option<ResultadoLinea> {
        None
    }

    fn huella(c: &Connection) -> String {
        let n: (i64, i64, i64) = c
            .query_row("SELECT (SELECT sum(stock) FROM libros), (SELECT count(*) FROM encargos), (SELECT count(*) FROM libros)", [], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)))
            .unwrap();
        format!("{n:?}")
    }

    #[test]
    fn encargo_de_la_tienda_y_de_internet() {
        let (c, libro, _) = mundo();
        let antes = huella(&c);
        let p = proponer(&c, VENDEDOR, "proponer_encargo", &json!({ "titulo": "x", "libro_id": libro, "cantidad": 2, "cliente_sugerido": "la señora del jueves" }), &sin_web).unwrap();
        assert!(p.pide_cliente && p.cliente_sugerido == "la señora del jueves");
        assert_eq!(p.accion, Accion::Encargo { titulo: "Rayuela".into(), autor: "Julio Cortázar".into(), libro_id: Some(libro), portada_url: None, cantidad: 2, notas: String::new() });
        assert!(p.explicacion[0].contains("«Rayuela» de Julio Cortázar (está en la tienda, con stock 2)"), "{:?}", p.explicacion);
        let web = |r: &str| (r == "w4").then(|| ResultadoLinea { titulo: "Dune".into(), autor: "Frank Herbert".into(), portada_url: Some("https://covers.openlibrary.org/x.jpg".into()), ..Default::default() });
        let p = proponer(&c, VENDEDOR, "proponer_encargo", &json!({ "titulo": "", "ref_web": "w4" }), &web).unwrap();
        assert_eq!(p.portada_url.as_deref(), Some("https://covers.openlibrary.org/x.jpg"));
        assert!(p.explicacion[0].contains("«Dune» de Frank Herbert (encontrado en internet)"));
        assert!(proponer(&c, VENDEDOR, "proponer_encargo", &json!({ "titulo": "a", "ref_web": "w9" }), &web).is_err());
        assert!(proponer(&c, VENDEDOR, "proponer_encargo", &json!({ "titulo": "a", "cantidad": 0 }), &sin_web).is_err());
        assert_eq!(huella(&c), antes, "proponer no cambia nada");
    }

    #[test]
    fn estado_de_encargo() {
        let (c, _, enc) = mundo();
        let p = proponer(&c, VENDEDOR, "proponer_estado_encargo", &json!({ "encargo_id": enc, "estado": "pedido" }), &sin_web).unwrap();
        assert_eq!(p.explicacion[1], "Estado: Pendiente → Pedido");
        assert_eq!(p.encargo_id, Some(enc));
        assert!(proponer(&c, VENDEDOR, "proponer_estado_encargo", &json!({ "encargo_id": enc, "estado": "cancelado" }), &sin_web).unwrap_err().contains("Cancelar"));
        assert!(proponer(&c, VENDEDOR, "proponer_estado_encargo", &json!({ "encargo_id": enc, "estado": "pendiente" }), &sin_web).is_err());
        assert!(proponer(&c, VENDEDOR, "proponer_estado_encargo", &json!({ "encargo_id": 999, "estado": "pedido" }), &sin_web).is_err());
        // la explicación (que también lee la IA) no trae al cliente
        assert!(!format!("{p:?}").contains("Rosa"));
    }

    #[test]
    fn stock_y_permisos() {
        let (c, libro, _) = mundo();
        assert!(proponer(&c, VENDEDOR, "proponer_stock", &json!({ "libro_id": libro, "cantidad": 5 }), &sin_web).unwrap_err().contains("permiso"));
        let p = proponer(&c, DUENA, "proponer_stock", &json!({ "libro_id": libro, "cantidad": 5 }), &sin_web).unwrap();
        assert_eq!(p.explicacion[2], "Stock: 2 → 7");
        assert_eq!(p.accion, Accion::Stock { libro_id: libro, delta: 5, motivo: "ingreso".into(), nota: String::new() });
        assert!(proponer(&c, DUENA, "proponer_stock", &json!({ "libro_id": libro, "cantidad": -3 }), &sin_web).unwrap_err().contains("negativo"));
        let p = proponer(&c, DUENA, "proponer_stock", &json!({ "libro_id": libro, "cantidad": -1, "motivo": "ingreso" }), &sin_web).unwrap();
        assert!(matches!(p.accion, Accion::Stock { ref motivo, .. } if motivo == "ajuste"), "restar siempre es ajuste");
        assert!(proponer(&c, DUENA, "proponer_stock", &json!({ "libro_id": 999, "cantidad": 1 }), &sin_web).is_err());
        // a un vendedor sin permiso ni se le ofrecen
        let n = |p| herramientas(p).iter().map(|h| h["function"]["name"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        assert_eq!(n(VENDEDOR), ["proponer_encargo", "proponer_estado_encargo"]);
        assert!(n(DUENA).contains(&"proponer_libro_nuevo".to_string()));
    }

    #[test]
    fn editar_libro() {
        let (c, libro, _) = mundo();
        let p = proponer(
            &c,
            DUENA,
            "proponer_editar_libro",
            &json!({ "libro_id": libro, "precio_soles": 59.9, "categoria": "Cuentos para niños", "ubicacion": { "estante": "b", "tramo": 2, "repisa": 3 }, "costo_soles": "31,5" }),
            &sin_web,
        )
        .unwrap();
        assert_eq!(p.explicacion[1..], ["Precio: S/ 55.00 → S/ 59.90", "Costo: S/ 30.00 → S/ 31.50", "Categoría: Obras literarias → Cuentos para niños", "Ubicación: sin ubicación → estante B · tramo 2 · repisa 3"]);
        let Accion::EditarLibro { cambios, .. } = &p.accion else { panic!() };
        let l = libros::obtener(&c, libro, true).unwrap();
        let e = entrada_con_cambios(&l, cambios);
        assert_eq!((e.precio_cent, e.categoria.as_str(), e.costo_cent, e.stock), (5990, "ninos", Some(3150), 2));
        let vend_edita = Permisos { duena: false, edita_libros: true };
        assert!(proponer(&c, vend_edita, "proponer_editar_libro", &json!({ "libro_id": libro, "costo_soles": 10 }), &sin_web).unwrap_err().contains("Dueña"));
        assert!(proponer(&c, DUENA, "proponer_editar_libro", &json!({ "libro_id": libro, "precio_soles": 55 }), &sin_web).unwrap_err().contains("ningún cambio"));
        assert!(proponer(&c, DUENA, "proponer_editar_libro", &json!({ "libro_id": libro, "categoria": "Novelas raras" }), &sin_web).unwrap_err().contains("Hay:"));
    }

    #[test]
    fn libro_nuevo() {
        let (c, _, _) = mundo();
        let web = |_: &str| Some(ResultadoLinea { titulo: "Dune".into(), autor: "Frank Herbert".into(), editorial: "Debolsillo".into(), anio: Some(2019), isbn: Some("9788466353779".into()), portada_url: Some("https://covers.openlibrary.org/d.jpg".into()), ..Default::default() });
        let p = proponer(&c, DUENA, "proponer_libro_nuevo", &json!({ "titulo": "", "ref_web": "w1", "categoria": "literarias", "precio_soles": 65 }), &web).unwrap();
        assert!(p.pide_precio);
        let Accion::LibroNuevo { titulo, isbn, precio_cent, stock, portada_url, .. } = &p.accion else { panic!() };
        assert_eq!((titulo.as_str(), isbn.as_deref(), *precio_cent, *stock), ("Dune", Some("9788466353779"), Some(6500), 1));
        assert!(portada_url.is_some());
        // si el ISBN ya está, propone sumar stock
        let isbn_rayuela = json!({ "titulo": "Rayuela", "isbn": "9788437604572" });
        let mut c2 = c;
        let id = libros::obtener(&c2, 1, false).unwrap().id;
        let mut e = entrada_con_cambios(&libros::obtener(&c2, id, true).unwrap(), &Cambios::default());
        e.isbn = Some("9788437604572".into());
        libros::guardar(&mut c2, &e, None, true).unwrap();
        assert!(proponer(&c2, DUENA, "proponer_libro_nuevo", &isbn_rayuela, &sin_web).unwrap_err().contains("ya está en la tienda"));
        assert!(proponer(&c2, VENDEDOR, "proponer_libro_nuevo", &json!({ "titulo": "x" }), &sin_web).is_err());
    }

    #[test]
    fn destinos_de_enlaces() {
        for d in ["libro:12", "encargo:3", "encargos", "ajustes:usuarios", "ajustes:categorias", "reportes"] {
            assert!(destino_valido(d), "{d}");
        }
        for d in ["libro:", "libro:x", "borrar:1", "https://x.com", "ajustes:respaldos", ""] {
            assert!(!destino_valido(d), "{d}");
        }
    }
}
