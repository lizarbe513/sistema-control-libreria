// Inventario en la interfaz: categorías, conversión de libros a la vista y un contador de cambios
// (las vistas lo observan para volver a pedir datos cuando se guarda un libro).
import { api, type CategoriaApi, type LibroApi } from './api';
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
