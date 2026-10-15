//! Herramientas del asistente de IA: lo único que el modelo puede «ver» de la tienda. Cada una lee la base con los
//! permisos de quien pregunta y devuelve un JSON compacto.
//!
//! Reglas que no dependen del modelo:
//! - **Privacidad:** ninguna herramienta devuelve nombres, teléfonos ni notas de clientes.
//! - **Roles:** las de ventas, ganancias y costos solo existen para la Dueña (ni se ofrecen ni se ejecutan para otros).
//! - Los libros se citan como `[[libro:ID]]`; al final se borran los ids que no salieron de una herramienta.

use std::collections::{BTreeMap, HashSet};

use rusqlite::Connection;
use serde_json::{Value, json};

use crate::busqueda::{self, Filtros, Indice};
use crate::error::Result;
use crate::libros::{self, Libro};
use crate::{encargos, reportes, tienda};

/// Con qué se ejecutan las herramientas.
pub struct Contexto<'a> {
    pub conn: &'a Connection,
    pub indice: &'a Indice,
    /// La Dueña: ventas, ganancias, costos.
    pub duena: bool,
    /// Instante actual (UTC, ISO) y zona horaria (Perú: −300), para los reportes.
    pub ahora: String,
    pub tz_min: i64,
}

fn funcion(nombre: &str, descripcion: &str, propiedades: Value, requeridos: &[&str]) -> Value {
    json!({ "type": "function", "function": {
        "name": nombre,
        "description": descripcion,
        "parameters": { "type": "object", "properties": propiedades, "required": requeridos },
    }})
}

const SOLO_DUENA: [&str; 3] = ["reporte_ventas", "mas_vendidos", "libros_sin_movimiento"];

/// Las herramientas que se le ofrecen al modelo (las de dinero, solo a la Dueña).
pub fn herramientas(duena: bool) -> Vec<Value> {
    let periodo = json!({
        "desde": { "type": "string", "description": "Fecha inicial AAAA-MM-DD (incluida)" },
        "hasta": { "type": "string", "description": "Fecha final AAAA-MM-DD (incluida)" },
    });
    let mut v = vec![
        funcion(
            "buscar_libros",
            "Busca libros del inventario por título, autor, editorial, categoría o etiqueta (tolera errores de tipeo). \
             Devuelve id, título, autor, categoría, precio en soles, stock y ubicación en la tienda.",
            json!({
                "consulta": { "type": "string", "description": "Palabras a buscar; vacío para listar" },
                "categoria": { "type": "string", "description": "Clave de categoría (opcional)" },
                "solo_con_stock": { "type": "boolean", "description": "Solo libros disponibles (por defecto true)" },
            }),
            &["consulta"],
        ),
        funcion(
            "catalogo",
            "Hojea el catálogo de una categoría en formato compacto (id | título | autor | etiquetas | stock), de a 150. \
             Úsalo para recomendar por gustos o temas cuando la búsqueda por palabras no basta.",
            json!({
                "categoria": { "type": "string", "description": "Clave de categoría" },
                "pagina": { "type": "integer", "description": "Desde 1" },
                "incluir_agotados": { "type": "boolean" },
            }),
            &["categoria"],
        ),
        funcion(
            "detalle_libro",
            "Ficha completa de un libro: sinopsis, editorial, año, etiquetas, precio, stock y ubicación.",
            json!({ "id": { "type": "integer" } }),
            &["id"],
        ),
        funcion(
            "resumen_inventario",
            "Cuántos títulos y ejemplares hay, cuántos agotados, por agotarse y sin ubicación, y cuántos por categoría.",
            json!({}),
            &[],
        ),
        funcion(
            "agotados_y_por_agotarse",
            "Libros agotados (stock 0) y por agotarse (stock en o bajo su mínimo).",
            json!({ "limite": { "type": "integer", "description": "Máximo por lista (por defecto 40)" } }),
            &[],
        ),
        funcion("categorias", "Las categorías de la tienda (clave y nombre).", json!({}), &[]),
        funcion(
            "encargos_activos",
            "Libros que los clientes encargaron y aún no se entregan: título, autor, cantidad, estado y días de espera. \
             No incluye datos de los clientes.",
            json!({}),
            &[],
        ),
        funcion(
            "sugerir_reposicion",
            "Datos para decidir qué reponer: por agotarse, lo más vendido en los últimos 30 días (unidades) y los títulos \
             encargados por clientes.",
            json!({}),
            &[],
        ),
    ];
    if duena {
        v.push(funcion(
            "reporte_ventas",
            "Ventas de un período: número de ventas, unidades, total, ganancia estimada, descuentos, caja por método de \
             pago, ventas por vendedora y por categoría, y el dinero inmovilizado en libros sin movimiento.",
            periodo.clone(),
            &["desde", "hasta"],
        ));
        v.push(funcion(
            "mas_vendidos",
            "Los libros más vendidos de un período, con unidades, total y ganancia.",
            json!({
                "desde": periodo["desde"], "hasta": periodo["hasta"],
                "limite": { "type": "integer", "description": "Por defecto 10" },
            }),
            &["desde", "hasta"],
        ));
        v.push(funcion(
            "libros_sin_movimiento",
            "Libros con stock que no se venden ni reciben ingresos hace muchos días (candidatos a liquidar), con su costo.",
            json!({ "dias": { "type": "integer", "description": "Por defecto 90" } }),
            &[],
        ));
    }
    v
}

fn soles(cent: i64) -> f64 {
    cent as f64 / 100.0
}

/// «Estante B (Autoayuda) · tramo 2 · repisa 3». Usa los nombres de la tienda guardada si los hay.
fn ubicacion_texto(estantes: &BTreeMap<String, String>, l: &Libro) -> Value {
    match &l.ubicacion {
        None => json!("sin ubicación"),
        Some(u) => {
            let nombre = estantes.get(&u.estante).cloned().unwrap_or_else(|| format!("Estante {}", u.estante));
            json!(format!("{nombre} · tramo {} · repisa {}", u.tramo, u.repisa))
        }
    }
}

fn nombres_estantes(conn: &Connection) -> BTreeMap<String, String> {
    tienda::cargar(conn)
        .ok()
        .flatten()
        .map(|t| {
            t.estantes
                .into_iter()
                .map(|e| {
                    let n = if e.tema.trim().is_empty() { e.titulo.clone() } else { format!("{} ({})", e.titulo, e.tema) };
                    (e.id, n)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn libro_corto(l: &Libro, estantes: &BTreeMap<String, String>, cats: &BTreeMap<String, String>) -> Value {
    json!({
        "id": l.id,
        "titulo": l.titulo,
        "autor": l.autor,
        "categoria": cats.get(&l.categoria).unwrap_or(&l.categoria),
        "precio_soles": soles(l.precio_cent),
        "stock": l.stock,
        "ubicacion": ubicacion_texto(estantes, l),
    })
}

fn texto_arg(a: &Value, k: &str) -> String {
    a[k].as_str().unwrap_or_default().trim().to_string()
}

fn entero_arg(a: &Value, k: &str, defecto: i64, min: i64, max: i64) -> i64 {
    a[k].as_i64().or_else(|| a[k].as_str().and_then(|s| s.parse().ok())).unwrap_or(defecto).clamp(min, max)
}

/// AAAA-MM-DD local → instante UTC (ISO) del comienzo de ese día; `dias_extra` suma días (para «hasta» incluido).
fn inicio_dia(fecha: &str, tz_min: i64, dias_extra: i64) -> Option<String> {
    let f = fecha.trim();
    if f.len() != 10 || !f.chars().enumerate().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() }) {
        return None;
    }
    Connection::open_in_memory()
        .ok()?
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, ?2, ?3)",
            [f.to_string(), format!("{} minutes", -tz_min), format!("{dias_extra} days")],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
}

fn consulta(ctx: &Contexto, a: &Value, dias_sin_mov: i64) -> std::result::Result<reportes::Consulta, String> {
    let desde = inicio_dia(&texto_arg(a, "desde"), ctx.tz_min, 0).ok_or("«desde» debe ser una fecha AAAA-MM-DD")?;
    let hasta = inicio_dia(&texto_arg(a, "hasta"), ctx.tz_min, 1).ok_or("«hasta» debe ser una fecha AAAA-MM-DD")?;
    Ok(reportes::Consulta { desde, hasta, tz_min: ctx.tz_min, agrupar: reportes::Agrupar::Dia, dias_sin_mov, ahora: ctx.ahora.clone() })
}

/// Últimos `dias` días hasta hoy (para la reposición).
fn ultimos_dias(ctx: &Contexto, dias: i64) -> Option<reportes::Consulta> {
    let hoy: String = Connection::open_in_memory()
        .ok()?
        .query_row("SELECT date(?1, ?2)", [ctx.ahora.clone(), format!("{} minutes", ctx.tz_min)], |r| r.get(0))
        .ok()?;
    consulta(ctx, &json!({ "desde": hoy, "hasta": hoy }), 90).ok().map(|mut c| {
        c.desde = inicio_dia(&hoy, ctx.tz_min, -(dias - 1)).unwrap_or(c.desde);
        c
    })
}

/// Ejecuta una herramienta. Devuelve su resultado (o `{"error": …}`) y los ids de libros que aparecieron.
pub fn ejecutar(ctx: &Contexto, nombre: &str, a: &Value) -> (Value, Vec<i64>) {
    match ejecutar_interno(ctx, nombre, a) {
        Ok(v) => {
            let ids = ids_en(&v);
            (v, ids)
        }
        Err(e) => (json!({ "error": e }), Vec::new()),
    }
}

/// Todos los `"id"` de libros en un resultado (las herramientas solo ponen `id` a libros).
fn ids_en(v: &Value) -> Vec<i64> {
    let mut ids = Vec::new();
    fn recorrer(v: &Value, ids: &mut Vec<i64>) {
        match v {
            Value::Object(m) => {
                for (k, x) in m {
                    if (k == "id" || k == "libro_id") && x.is_i64() {
                        ids.push(x.as_i64().unwrap_or_default());
                    } else {
                        recorrer(x, ids);
                    }
                }
            }
            Value::Array(a) => a.iter().for_each(|x| recorrer(x, ids)),
            Value::String(s) => {
                // líneas compactas del catálogo: «12 | título | …»
                for linea in s.lines() {
                    if let Some(n) = linea.split('|').next().and_then(|p| p.trim().parse::<i64>().ok()) {
                        ids.push(n);
                    }
                }
            }
            _ => {}
        }
    }
    recorrer(v, &mut ids);
    ids
}

fn ejecutar_interno(ctx: &Contexto, nombre: &str, a: &Value) -> std::result::Result<Value, String> {
    if SOLO_DUENA.contains(&nombre) && !ctx.duena {
        return Err("Esta información (ventas y dinero) es solo para la Dueña".into());
    }
    let r = |e: crate::Error| e.to_string();
    let cats: BTreeMap<String, String> = libros::categorias(ctx.conn).map_err(r)?.into_iter().map(|c| (c.clave, c.nombre)).collect();
    let estantes = nombres_estantes(ctx.conn);
    let corto = |l: &Libro| libro_corto(l, &estantes, &cats);
    match nombre {
        "buscar_libros" => {
            let f = Filtros {
                categoria: Some(texto_arg(a, "categoria")).filter(|c| !c.is_empty()),
                solo_con_stock: a["solo_con_stock"].as_bool().unwrap_or(true),
                limite: Some(25),
                ..Default::default()
            };
            let v = busqueda::buscar(ctx.conn, ctx.indice, &texto_arg(a, "consulta"), &f, false).map_err(r)?;
            Ok(json!({ "resultados": v.iter().map(corto).collect::<Vec<_>>(), "total": v.len() }))
        }
        "catalogo" => {
            let cat = texto_arg(a, "categoria");
            if !cats.contains_key(&cat) {
                return Err(format!("No existe la categoría «{cat}». Claves válidas: {}", cats.keys().cloned().collect::<Vec<_>>().join(", ")));
            }
            let pagina = entero_arg(a, "pagina", 1, 1, 1000);
            let con_stock = !a["incluir_agotados"].as_bool().unwrap_or(false);
            let mut st = ctx
                .conn
                .prepare(
                    "SELECT l.id, l.titulo, l.autor, l.stock,
                            coalesce((SELECT group_concat(e.nombre, ', ') FROM libro_etiqueta le JOIN etiquetas e ON e.id = le.etiqueta_id
                                       WHERE le.libro_id = l.id), '')
                       FROM libros l JOIN categorias c ON c.id = l.categoria_id
                      WHERE l.activo = 1 AND c.clave = ?1 AND (?2 = 0 OR l.stock > 0)
                      ORDER BY l.titulo LIMIT 151 OFFSET ?3",
                )
                .map_err(|e| e.to_string())?;
            let filas: Vec<String> = st
                .query_map(rusqlite::params![cat, con_stock as i64, (pagina - 1) * 150], |f| {
                    Ok(format!("{} | {} | {} | {} | {}", f.get::<_, i64>(0)?, f.get::<_, String>(1)?, f.get::<_, String>(2)?, f.get::<_, String>(4)?, f.get::<_, i64>(3)?))
                })
                .and_then(|m| m.collect::<rusqlite::Result<Vec<_>>>())
                .map_err(|e| e.to_string())?;
            let hay_mas = filas.len() > 150;
            Ok(json!({ "formato": "id | titulo | autor | etiquetas | stock", "libros": filas.into_iter().take(150).collect::<Vec<_>>().join("\n"), "hay_mas": hay_mas }))
        }
        "detalle_libro" => {
            let id = a["id"].as_i64().ok_or("Falta el id del libro")?;
            let l = libros::obtener(ctx.conn, id, false).map_err(r)?;
            let mut v = corto(&l);
            v["editorial"] = json!(l.editorial);
            v["anio"] = json!(l.anio);
            v["sinopsis"] = json!(l.sinopsis.chars().take(1200).collect::<String>());
            v["etiquetas"] = json!(l.etiquetas);
            v["stock_minimo"] = json!(l.stock_minimo);
            v["isbn"] = json!(l.isbn);
            if ctx.duena {
                let costo: Option<i64> = ctx.conn.query_row("SELECT costo_cent FROM libros WHERE id = ?1", [id], |f| f.get(0)).ok();
                v["costo_soles"] = json!(costo.map(soles));
            }
            Ok(v)
        }
        "resumen_inventario" => {
            let c = libros::contadores(ctx.conn).map_err(r)?;
            let mut st = ctx
                .conn
                .prepare(
                    "SELECT c.nombre, count(l.id), coalesce(sum(l.stock), 0), coalesce(sum(l.stock = 0), 0)
                       FROM categorias c LEFT JOIN libros l ON l.categoria_id = c.id AND l.activo = 1 GROUP BY c.id ORDER BY c.orden",
                )
                .map_err(|e| e.to_string())?;
            let por_cat: Vec<Value> = st
                .query_map([], |f| Ok(json!({ "categoria": f.get::<_, String>(0)?, "titulos": f.get::<_, i64>(1)?, "ejemplares": f.get::<_, i64>(2)?, "agotados": f.get::<_, i64>(3)? })))
                .and_then(|m| m.collect::<rusqlite::Result<Vec<_>>>())
                .map_err(|e| e.to_string())?;
            let mut v = json!({
                "titulos": c.libros, "ejemplares": c.unidades, "agotados": c.sin_stock,
                "por_agotarse_o_agotados": c.stock_bajo, "sin_ubicacion": c.sin_ubicacion, "por_categoria": por_cat,
            });
            if ctx.duena {
                let (costo, venta): (i64, i64) = ctx
                    .conn
                    .query_row("SELECT coalesce(sum(stock * costo_cent), 0), coalesce(sum(stock * precio_cent), 0) FROM libros WHERE activo = 1", [], |f| {
                        Ok((f.get(0)?, f.get(1)?))
                    })
                    .map_err(|e| e.to_string())?;
                v["valor_inventario_costo_soles"] = json!(soles(costo));
                v["valor_inventario_venta_soles"] = json!(soles(venta));
            }
            Ok(v)
        }
        "agotados_y_por_agotarse" => {
            let limite = entero_arg(a, "limite", 40, 1, 200);
            let bajos = libros::stock_bajo(ctx.conn, 2000, false).map_err(r)?;
            let (agotados, por_agotarse): (Vec<&Libro>, Vec<&Libro>) = bajos.iter().partition(|l| l.stock == 0);
            Ok(json!({
                "agotados_total": agotados.len(),
                "agotados": agotados.iter().take(limite as usize).map(|l| corto(l)).collect::<Vec<_>>(),
                "por_agotarse_total": por_agotarse.len(),
                "por_agotarse": por_agotarse.iter().take(limite as usize).map(|l| { let mut v = corto(l); v["stock_minimo"] = json!(l.stock_minimo); v }).collect::<Vec<_>>(),
            }))
        }
        "categorias" => Ok(json!(cats.iter().map(|(k, n)| json!({ "clave": k, "nombre": n })).collect::<Vec<_>>())),
        "encargos_activos" => Ok(json!(encargos_sin_clientes(ctx)?)),
        "sugerir_reposicion" => {
            let bajos: Vec<Value> = libros::stock_bajo(ctx.conn, 60, false).map_err(r)?.iter().map(|l| {
                let mut v = corto(l);
                v["stock_minimo"] = json!(l.stock_minimo);
                v
            }).collect();
            let vendidos: Vec<Value> = match ultimos_dias(ctx, 30) {
                Some(c) => reportes::mas_vendidos(ctx.conn, &c, 20)
                    .map_err(r)?
                    .into_iter()
                    .map(|x| json!({ "libro_id": x.libro_id, "titulo": x.titulo, "unidades_30_dias": x.unidades }))
                    .collect(),
                None => Vec::new(),
            };
            let mut por_titulo: BTreeMap<String, i64> = BTreeMap::new();
            for e in encargos_sin_clientes(ctx)? {
                *por_titulo.entry(e["titulo"].as_str().unwrap_or_default().to_string()).or_default() += e["cantidad"].as_i64().unwrap_or(1);
            }
            Ok(json!({
                "por_agotarse_o_agotados": bajos,
                "mas_vendidos_30_dias": vendidos,
                "encargados_por_clientes": por_titulo.into_iter().map(|(t, n)| json!({ "titulo": t, "ejemplares": n })).collect::<Vec<_>>(),
            }))
        }
        "reporte_ventas" => {
            let c = consulta(ctx, a, 90)?;
            let rep = reportes::reporte(ctx.conn, &c).map_err(r)?;
            let t = &rep.totales;
            Ok(json!({
                "periodo": { "desde": texto_arg(a, "desde"), "hasta": texto_arg(a, "hasta") },
                "ventas": t.ventas, "anuladas": t.anuladas, "unidades": t.unidades,
                "total_soles": soles(t.total_cent), "ganancia_estimada_soles": soles(t.ganancia_cent),
                "descuentos_soles": soles(t.descuentos_cent), "ticket_promedio_soles": soles(t.ticket_promedio_cent),
                "adelantos_de_encargos_soles": soles(t.adelantos_cent),
                "caja_por_metodo": rep.caja.iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect::<Vec<_>>(),
                "por_vendedora": rep.por_vendedora.iter().map(|g| json!({ "nombre": g.nombre, "ventas": g.ventas, "total_soles": soles(g.total_cent) })).collect::<Vec<_>>(),
                "por_categoria": rep.categorias.iter().map(|x| json!({ "categoria": x.nombre, "unidades": x.unidades, "total_soles": soles(x.total_cent) })).collect::<Vec<_>>(),
                "mas_vendidos": rep.mas_vendidos.iter().take(5).map(|x| json!({ "libro_id": x.libro_id, "titulo": x.titulo, "unidades": x.unidades })).collect::<Vec<_>>(),
                "libros_sin_movimiento": rep.sin_movimiento_total,
                "inmovilizado_costo_soles": soles(rep.inmovilizado_cent),
            }))
        }
        "mas_vendidos" => {
            let c = consulta(ctx, a, 90)?;
            let v = reportes::mas_vendidos(ctx.conn, &c, entero_arg(a, "limite", 10, 1, 50)).map_err(r)?;
            Ok(json!(v.iter().map(|x| json!({ "libro_id": x.libro_id, "titulo": x.titulo, "unidades": x.unidades, "total_soles": soles(x.total_cent), "ganancia_soles": soles(x.ganancia_cent) })).collect::<Vec<_>>()))
        }
        "libros_sin_movimiento" => {
            let dias = entero_arg(a, "dias", 90, 1, 3650);
            let c = ultimos_dias(ctx, 30).ok_or("No se pudo calcular la fecha")?;
            let c = reportes::Consulta { dias_sin_mov: dias, ..c };
            let (v, total, inmovilizado) = reportes::sin_movimiento(ctx.conn, &c, 40).map_err(r)?;
            Ok(json!({
                "total": total, "inmovilizado_costo_soles": soles(inmovilizado),
                "libros": v.iter().map(|x| json!({ "libro_id": x.libro_id, "titulo": x.titulo, "autor": x.autor, "stock": x.stock, "dias_sin_movimiento": x.dias, "costo_soles": soles(x.costo_cent), "precio_soles": soles(x.precio_cent) })).collect::<Vec<_>>(),
            }))
        }
        otro => Err(format!("No existe la herramienta «{otro}»")),
    }
}

/// Encargos activos **sin** cliente, teléfono ni notas (las notas pueden traer datos personales).
fn encargos_sin_clientes(ctx: &Contexto) -> std::result::Result<Vec<Value>, String> {
    let v = encargos::listar(ctx.conn, true).map_err(|e| e.to_string())?;
    Ok(v.iter()
        .map(|e| {
            json!({
                "titulo": e.titulo, "autor": e.autor, "cantidad": e.cantidad, "estado": e.estado.texto(),
                "creado": e.creado.get(..10).unwrap_or(&e.creado), "libro_id": e.libro_id,
            })
        })
        .collect())
}

/// Instrucciones para el modelo.
pub fn instrucciones(tienda: &str, quien: &str, duena: bool, hoy: &str, categorias: &[(String, String)]) -> String {
    let cats = categorias.iter().map(|(k, n)| format!("{n} ({k})")).collect::<Vec<_>>().join(", ");
    let rol = if duena {
        "Es la Dueña: puede ver ventas, ganancias, caja y costos."
    } else {
        "Es vendedor/a: NO tiene acceso a ventas, ganancias, costos ni reportes de dinero; si lo pide, dile amablemente que eso lo ve la Dueña."
    };
    format!(
        "Eres la asistente de la Librería {tienda} (Perú). Hablas en español peruano, con calidez y en pocas palabras. \
Hoy es {hoy}. Atiendes a {quien}. {rol}

Reglas:
- Usa SOLO datos que obtengas con las herramientas. Si no hay datos, dilo; nunca inventes libros, precios ni cifras.
- Al recomendar o mencionar un libro de la tienda, cítalo como [[libro:ID]] (el id que dio la herramienta), con su \
precio, si hay stock y dónde está. Solo recomienda libros que estén en el inventario.
- Para gustos o temas («algo de misterio para un chico de 15»), busca por palabras y también hojea el catálogo de las \
categorías que encajen, y usa lo que sabes de esos títulos y autores para elegir.
- Al resumir el estado de la tienda, ventas o reportes, da lo importante primero, con cifras en soles (S/), y en \
viñetas cortas.
- Para redactar mensajes a clientes, usa {{cliente}} en lugar del nombre. No pidas ni repitas datos personales.
- Los períodos van en fechas AAAA-MM-DD; «este mes» va del día 1 hasta hoy.
Categorías: {cats}."
    )
}

/// Quita los `[[libro:ID]]` cuyo id no salió de una herramienta (el modelo no puede inventar libros).
pub fn depurar_citas(texto: &str, vistos: &HashSet<i64>) -> (String, Vec<i64>) {
    let mut salida = String::with_capacity(texto.len());
    let mut citados = Vec::new();
    let mut resto = texto;
    while let Some(i) = resto.find("[[libro:") {
        salida.push_str(&resto[..i]);
        let tras = &resto[i + 8..];
        match tras.find("]]") {
            Some(j) if tras[..j].trim().parse::<i64>().is_ok() => {
                let id: i64 = tras[..j].trim().parse().unwrap_or_default();
                if vistos.contains(&id) {
                    salida.push_str(&format!("[[libro:{id}]]"));
                    if !citados.contains(&id) {
                        citados.push(id);
                    }
                }
                resto = &tras[j + 2..];
            }
            _ => {
                salida.push_str("[[libro:");
                resto = tras;
            }
        }
    }
    salida.push_str(resto);
    (salida, citados)
}

// ── configuración: claves y modelos (en la tabla `config`, dentro de la base cifrada) ──

/// Los dos proveedores, en orden de preferencia: Gemini primero y Groq de respaldo.
pub const PROVEEDORES: [(&str, &str, &str, &str); 2] =
    [("gemini", "Gemini", crate::ia::URL_GEMINI, crate::ia::MODELO_GEMINI), ("groq", "Groq", crate::ia::URL_GROQ, crate::ia::MODELO_GROQ)];

fn leer_config(conn: &Connection, clave: &str) -> Option<String> {
    conn.query_row("SELECT valor FROM config WHERE clave = ?1", [clave], |f| f.get::<_, String>(0)).ok().filter(|v| !v.trim().is_empty())
}

fn escribir_config(conn: &Connection, clave: &str, valor: Option<&str>) -> Result<()> {
    match valor.map(str::trim).filter(|v| !v.is_empty()) {
        Some(v) => conn.execute("INSERT INTO config (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = ?2", [clave, v])?,
        None => conn.execute("DELETE FROM config WHERE clave = ?1", [clave])?,
    };
    Ok(())
}

/// Lo que ve Ajustes de cada proveedor: nunca la clave entera.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstadoProveedor {
    pub id: String,
    pub nombre: String,
    pub configurada: bool,
    /// Las últimas 4 letras de la clave, para reconocerla.
    pub final_clave: String,
    pub modelo: String,
}

pub fn estado_config(conn: &Connection) -> Vec<EstadoProveedor> {
    PROVEEDORES
        .iter()
        .map(|(id, nombre, _, modelo)| {
            let clave = leer_config(conn, &format!("ia_{id}_clave"));
            EstadoProveedor {
                id: id.to_string(),
                nombre: nombre.to_string(),
                configurada: clave.is_some(),
                final_clave: clave.map(|c| c.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect()).unwrap_or_default(),
                modelo: leer_config(conn, &format!("ia_{id}_modelo")).unwrap_or_else(|| modelo.to_string()),
            }
        })
        .collect()
}

/// Guarda la clave (`Some("")` la borra, `None` la deja como está) y el modelo de un proveedor.
pub fn guardar_config(conn: &Connection, id: &str, clave: Option<&str>, modelo: Option<&str>) -> Result<()> {
    if !PROVEEDORES.iter().any(|p| p.0 == id) {
        return crate::error::invalido("Proveedor desconocido");
    }
    if let Some(c) = clave {
        if c.trim().chars().any(char::is_whitespace) {
            return crate::error::invalido("La clave no debe tener espacios");
        }
        escribir_config(conn, &format!("ia_{id}_clave"), Some(c))?;
    }
    if let Some(m) = modelo {
        escribir_config(conn, &format!("ia_{id}_modelo"), Some(m))?;
    }
    Ok(())
}

/// Un proveedor listo para usar (con su clave guardada, o con `clave` si se está probando una nueva).
pub fn proveedor(conn: &Connection, id: &str, clave: Option<&str>) -> Option<crate::ia::OpenAiCompat> {
    let (id, nombre, url, modelo) = PROVEEDORES.iter().find(|p| p.0 == id)?;
    let clave = clave.map(str::trim).filter(|c| !c.is_empty()).map(String::from).or_else(|| leer_config(conn, &format!("ia_{id}_clave")))?;
    Some(crate::ia::OpenAiCompat {
        nombre: nombre.to_string(),
        url_base: url.to_string(),
        clave,
        modelo: leer_config(conn, &format!("ia_{id}_modelo")).unwrap_or_else(|| modelo.to_string()),
    })
}

/// Los proveedores con clave, en orden de preferencia.
pub fn proveedores(conn: &Connection) -> Vec<crate::ia::OpenAiCompat> {
    PROVEEDORES.iter().filter_map(|p| proveedor(conn, p.0, None)).collect()
}

/// Para las pruebas de privacidad: el texto de todos los resultados de todas las herramientas.
pub fn todo_lo_visible(ctx: &Contexto) -> Result<String> {
    let mut s = String::new();
    let cats = libros::categorias(ctx.conn)?;
    let hoy = &ctx.ahora[..10];
    for h in herramientas(ctx.duena) {
        let n = h["function"]["name"].as_str().unwrap_or_default().to_string();
        let args = json!({ "consulta": "", "categoria": cats[0].clave, "id": 1, "desde": "2000-01-01", "hasta": hoy });
        s.push_str(&ejecutar(ctx, &n, &args).0.to_string());
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clientes::ClienteEntrada;
    use crate::db::en_memoria;
    use crate::encargos::EncargoEntrada;
    use crate::libros::{LibroEntrada, Ubicacion, guardar};
    use crate::usuarios::{Rol, crear as crear_usuaria};

    fn mundo() -> Connection {
        let mut c = en_memoria();
        let vend = crear_usuaria(&c, "Luis", Rol::Vendedor, "1357").unwrap();
        for (t, a, stock, cat) in [
            ("El misterio de la cripta embrujada", "Eduardo Mendoza", 2, "literarias"),
            ("Harry Potter y la piedra filosofal", "J. K. Rowling", 0, "literarias"),
            ("Diccionario escolar", "Larousse", 5, "diccionarios"),
        ] {
            guardar(
                &mut c,
                &LibroEntrada {
                    titulo: t.into(),
                    autor: a.into(),
                    categoria: cat.into(),
                    precio_cent: 4590,
                    costo_cent: Some(2000),
                    stock,
                    sinopsis: "Una historia".into(),
                    ubicacion: Some(Ubicacion { estante: "B".into(), tramo: 2, repisa: 3 }),
                    ..Default::default()
                },
                None,
                true,
            )
            .unwrap();
        }
        encargos::crear(
            &mut c,
            &EncargoEntrada {
                cliente: Some(ClienteEntrada { nombre: "Rosa Quispe Mamani".into(), telefono: "987654321".into(), ..Default::default() }),
                titulo: "Los ríos profundos".into(),
                notas: "Llamar a Rosa al trabajo".into(),
                ..Default::default()
            },
            &vend,
        )
        .unwrap();
        c
    }

    fn ctx<'a>(c: &'a Connection, i: &'a Indice, duena: bool) -> Contexto<'a> {
        Contexto { conn: c, indice: i, duena, ahora: "2026-10-15T15:00:00.000Z".into(), tz_min: -300 }
    }

    #[test]
    fn buscar_detalle_y_catalogo() {
        let c = mundo();
        let i = Indice::construir(&c).unwrap();
        let x = ctx(&c, &i, false);
        let (v, ids) = ejecutar(&x, "buscar_libros", &json!({ "consulta": "misterio" }));
        assert_eq!(v["resultados"][0]["titulo"], "El misterio de la cripta embrujada");
        assert_eq!(v["resultados"][0]["precio_soles"], 45.9);
        assert_eq!(v["resultados"][0]["ubicacion"], "Estante B · tramo 2 · repisa 3");
        assert_eq!(ids.len(), 1);
        // por defecto solo con stock; el agotado aparece si se pide
        assert_eq!(ejecutar(&x, "buscar_libros", &json!({ "consulta": "harry" })).0["total"], 0);
        assert_eq!(ejecutar(&x, "buscar_libros", &json!({ "consulta": "harry", "solo_con_stock": false })).0["total"], 1);
        let (cat, ids) = ejecutar(&x, "catalogo", &json!({ "categoria": "literarias", "incluir_agotados": true }));
        assert_eq!(cat["libros"].as_str().unwrap().lines().count(), 2);
        assert_eq!(ids.len(), 2, "los ids salen de las líneas compactas");
        assert!(ejecutar(&x, "catalogo", &json!({ "categoria": "nada" })).0["error"].as_str().unwrap().contains("literarias"));
        let (d, _) = ejecutar(&x, "detalle_libro", &json!({ "id": ids[0] }));
        assert_eq!(d["sinopsis"], "Una historia");
        assert!(d.get("costo_soles").is_none(), "el vendedor no ve costos");
    }

    #[test]
    fn inventario_agotados_y_reposicion() {
        let c = mundo();
        let i = Indice::construir(&c).unwrap();
        let x = ctx(&c, &i, false);
        let r = ejecutar(&x, "resumen_inventario", &json!({})).0;
        assert_eq!((r["titulos"].as_i64(), r["ejemplares"].as_i64(), r["agotados"].as_i64()), (Some(3), Some(7), Some(1)));
        assert!(r.get("valor_inventario_costo_soles").is_none());
        let a = ejecutar(&x, "agotados_y_por_agotarse", &json!({})).0;
        assert_eq!(a["agotados"][0]["titulo"], "Harry Potter y la piedra filosofal");
        let rep = ejecutar(&x, "sugerir_reposicion", &json!({})).0;
        assert_eq!(rep["encargados_por_clientes"][0], json!({ "titulo": "Los ríos profundos", "ejemplares": 1 }));
        // la Dueña ve el valor del inventario
        let d = ejecutar(&ctx(&c, &i, true), "resumen_inventario", &json!({})).0;
        assert_eq!(d["valor_inventario_costo_soles"], 140.0);
    }

    #[test]
    fn roles_las_de_dinero_solo_para_la_duena() {
        let c = mundo();
        let i = Indice::construir(&c).unwrap();
        let nombres = |d: bool| herramientas(d).iter().map(|h| h["function"]["name"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        for n in SOLO_DUENA {
            assert!(!nombres(false).contains(&n.to_string()), "{n} no se ofrece al vendedor");
            assert!(nombres(true).contains(&n.to_string()));
            // aunque el modelo la pida igual, no se ejecuta
            let (v, _) = ejecutar(&ctx(&c, &i, false), n, &json!({ "desde": "2026-10-01", "hasta": "2026-10-15" }));
            assert!(v["error"].as_str().unwrap().contains("solo para la Dueña"));
        }
        let (v, _) = ejecutar(&ctx(&c, &i, true), "reporte_ventas", &json!({ "desde": "2026-10-01", "hasta": "2026-10-15" }));
        assert_eq!(v["ventas"], 0, "{v}");
        assert!(ejecutar(&ctx(&c, &i, true), "reporte_ventas", &json!({ "desde": "ayer", "hasta": "hoy" })).0["error"].is_string());
    }

    #[test]
    fn privacidad_nada_de_clientes() {
        let c = mundo();
        let i = Indice::construir(&c).unwrap();
        for duena in [false, true] {
            let todo = todo_lo_visible(&ctx(&c, &i, duena)).unwrap();
            assert!(todo.contains("Los ríos profundos"), "el encargo sí aparece (sin su cliente)");
            for dato in ["Rosa", "Quispe", "987654321", "Llamar"] {
                assert!(!todo.contains(dato), "«{dato}» no debe llegar a la IA: {todo}");
            }
        }
    }

    #[test]
    fn fechas_del_periodo_en_hora_peruana() {
        assert_eq!(inicio_dia("2026-10-01", -300, 0).unwrap(), "2026-10-01T05:00:00.000Z");
        assert_eq!(inicio_dia("2026-10-15", -300, 1).unwrap(), "2026-10-16T05:00:00.000Z");
        assert!(inicio_dia("15/10/2026", -300, 0).is_none());
    }

    #[test]
    fn citas_inventadas_se_borran() {
        let vistos: HashSet<i64> = [3, 7].into();
        let (t, c) = depurar_citas("Mira [[libro:7]] y [[libro:99]], o [[libro: 3]]. [[libro:x]]", &vistos);
        assert_eq!(t, "Mira [[libro:7]] y , o [[libro:3]]. [[libro:x]]");
        assert_eq!(c, vec![7, 3]);
    }

    #[test]
    fn configuracion_de_claves() {
        let c = en_memoria();
        assert!(proveedores(&c).is_empty());
        assert!(estado_config(&c).iter().all(|p| !p.configurada));
        guardar_config(&c, "groq", Some(" gsk_abcdef1234 "), None).unwrap();
        guardar_config(&c, "gemini", Some("AIzaXYZ9876"), Some("gemini-otro")).unwrap();
        let e = estado_config(&c);
        assert_eq!((e[0].id.as_str(), e[0].final_clave.as_str(), e[0].modelo.as_str()), ("gemini", "9876", "gemini-otro"));
        assert_eq!((e[1].final_clave.as_str(), e[1].modelo.as_str()), ("1234", crate::ia::MODELO_GROQ));
        let p = proveedores(&c);
        assert_eq!(p.iter().map(|x| x.nombre.as_str()).collect::<Vec<_>>(), ["Gemini", "Groq"], "Gemini primero");
        assert_eq!(p[1].clave, "gsk_abcdef1234");
        // None conserva, "" borra
        guardar_config(&c, "gemini", None, Some("gemini-x")).unwrap();
        assert!(estado_config(&c)[0].configurada);
        guardar_config(&c, "gemini", Some(""), None).unwrap();
        assert_eq!(proveedores(&c).len(), 1);
        assert!(guardar_config(&c, "otro", Some("x"), None).is_err());
        assert!(guardar_config(&c, "groq", Some("con espacio"), None).is_err());
        // la clave está en la base (cifrada en la app real), nunca en el JSON de estado
        assert!(!serde_json::to_string(&estado_config(&c)).unwrap().contains("gsk_abcdef"));
    }

    #[test]
    fn instrucciones_segun_rol() {
        let cats = vec![("literarias".to_string(), "Obras literarias".to_string())];
        let d = instrucciones("SIGLO XXI", "Marisol", true, "2026-10-15", &cats);
        let v = instrucciones("SIGLO XXI", "Luis", false, "2026-10-15", &cats);
        assert!(d.contains("Dueña: puede ver ventas") && v.contains("NO tiene acceso"));
        assert!(d.contains("[[libro:ID]]") && d.contains("{cliente}") && d.contains("Obras literarias (literarias)"));
    }
}
