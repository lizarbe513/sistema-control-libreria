// Inventario en la interfaz: categorías, conversión de libros a la vista y un contador de cambios
// (las vistas lo observan para volver a pedir datos cuando se guarda un libro).
import { api, type CategoriaApi, type LibroApi, type ResultadoLinea, type UbicacionApi } from './api';
import { aVista, type Libro } from './datos';

export const inventario = $state({
  version: 0,
  categorias: [] as CategoriaApi[],
  /** La Dueña permite que los vendedores agreguen y editen libros. */
  vendedoresEditan: false,
});

/** Avisa a las vistas que el inventario cambió. */
export function inventarioCambio() {
  inventario.version++;
}

export const vista = (l: LibroApi): Libro => aVista(l, (archivo) => api.urlPortada(archivo));

/** Al entrar: portadas y categorías. */
export async function prepararInventario() {
  await api.prepararPortadas();
  [inventario.categorias, inventario.vendedoresEditan] = await Promise.all([api.categorias(), api.permisoVendedoresEditan()]);
}

/** Precio escrito por la usuaria («35», «35.50», «35,5») → céntimos. null si no es un número válido. */
export function aCentimos(texto: string): number | null {
  const t = texto.trim().replace(/^S\/\s*/i, '').replace(',', '.');
  if (!t) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Céntimos → texto para un campo de precio («35.50»). */
export const aSoles = (cent: number) => (cent / 100).toFixed(2);

/** Lo que estaba escribiendo la usuaria en el formulario de «Nuevo libro» (para no perderlo al salir). */
export interface BorradorLibro {
  modo: 'linea' | 'isbn' | 'manual';
  elegido: ResultadoLinea | null;
  isbn: string;
  titulo: string;
  autor: string;
  editorial: string;
  anio: string;
  sinopsis: string;
  categoria: string;
  formato: 'normal' | 'grueso' | 'infantil' | 'delgado';
  precio: string;
  costo: string;
  stock: string;
  stockMinimo: string;
  etiquetas: string;
  ubicacion: UbicacionApi | null;
  portadaPendiente: { tipo: 'url' | 'archivo'; valor: string } | null;
  quitarPortada: boolean;
}

/** Vive solo en memoria: se pierde al cerrar la app o la sesión (no se escribe a disco). */
export const borrador = $state<{ datos: BorradorLibro | null }>({ datos: null });

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** ¿Este libro (de la búsqueda en internet o escrito) ya está en el inventario? Primero por ISBN, luego por título y autor. */
export async function buscarExistente(r: { isbn?: string | null; titulo: string; autor?: string }): Promise<Libro | null> {
  if (r.isbn) {
    const l = (await api.buscarLibros(r.isbn, { limite: 5 })).find((x) => x.isbn === r.isbn);
    if (l) return vista(l);
  }
  const t = norm(r.titulo);
  if (t.length < 3) return null;
  const apellido = (a: string) => norm(a).split(' ').filter(Boolean).pop() ?? '';
  const l = (await api.buscarLibros(r.titulo, { limite: 10 })).find((x) => {
    if (norm(x.titulo) !== t) return false;
    const a = apellido(r.autor ?? '');
    const b = apellido(x.autor);
    return !a || !b || a === b || norm(x.autor).includes(a) || norm(r.autor ?? '').includes(b);
  });
  return l ? vista(l) : null;
}
