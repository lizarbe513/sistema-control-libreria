// El carrito de la venta en curso. Vive en memoria: sobrevive al cambiar de vista y se vacía al cerrar sesión.
import { api, type Cliente, type Descuento, type ItemEntrada, type TipoCliente } from '../api';
import type { Libro } from '../datos';
import { calcular, montoDescuento, type Calculo } from './calculo';

export interface LineaCarrito {
  libro: Libro;
  cantidad: number;
  descuento: Descuento | null;
}

export const carrito = $state({
  lineas: [] as LineaCarrito[],
  tipoId: 0,
  cliente: null as Cliente | null,
  descuento: null as Descuento | null,
  tipos: [] as TipoCliente[],
  /** % máximo de descuento a mano para vendedoras. */
  tope: 10,
});

/** Sube cada vez que se registra una venta (la lista de «Ventas de hoy» y «Inicio» se vuelven a pedir). */
export const ventasCambio = $state({ version: 0, celebracion: 0 });

export async function prepararVentas() {
  const [tipos, tope] = await Promise.all([api.tiposCliente(), api.topeDescuento()]);
  carrito.tipos = tipos;
  carrito.tope = tope;
  if (!tipos.some((t) => t.id === carrito.tipoId)) carrito.tipoId = tipos[0]?.id ?? 0;
}

export const tipoActual = () => carrito.tipos.find((t) => t.id === carrito.tipoId);

/** Suma un ejemplar (sin pasar del stock). Devuelve un aviso si no se pudo. */
export function agregar(libro: Libro): string | null {
  const l = carrito.lineas.find((x) => x.libro.id === libro.id);
  if (l) {
    if (l.cantidad >= libro.stock) return `Solo hay ${libro.stock} de «${libro.titulo}»`;
    l.cantidad++;
    return null;
  }
  if (libro.stock <= 0) return `«${libro.titulo}» está agotado`;
  carrito.lineas.push({ libro, cantidad: 1, descuento: null });
  return null;
}

export function quitar(id: number) {
  carrito.lineas = carrito.lineas.filter((l) => l.libro.id !== id);
}

export function vaciar() {
  carrito.lineas = [];
  carrito.cliente = null;
  carrito.descuento = null;
  const publico = carrito.tipos.find((t) => t.descuentoPct === 0) ?? carrito.tipos[0];
  carrito.tipoId = publico?.id ?? 0;
}

export function calculoActual(): Calculo {
  return calcular(
    carrito.lineas.map((l) => ({ precioCent: l.libro.precio, cantidad: l.cantidad, descuento: l.descuento })),
    tipoActual()?.descuentoPct ?? 0,
    carrito.descuento,
  );
}

/** Un descuento a mano pasa el tope de las vendedoras (la Dueña no tiene tope). */
export function pasaElTope(): boolean {
  const c = calculoActual();
  const base = c.lineas.reduce((s, l) => s + l.totalCent, 0);
  const pasa = (b: number, d: Descuento | null) => montoDescuento(b, d) * 100 > b * carrito.tope;
  return carrito.lineas.some((l) => pasa(l.libro.precio * l.cantidad, l.descuento)) || pasa(base, carrito.descuento);
}

export const itemsDeVenta = (): ItemEntrada[] => carrito.lineas.map((l) => ({ libroId: l.libro.id, cantidad: l.cantidad, descuento: l.descuento }));

/** Instantes UTC (ISO) del día local «aaaa-mm-dd»: [desde, hasta). */
export function rangoDia(dia: string): [string, string] {
  const [y, m, d] = dia.split('-').map(Number);
  return [new Date(y, m - 1, d).toISOString(), new Date(y, m - 1, d + 1).toISOString()];
}

export function hoyLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export const METODOS = {
  efectivo: { nombre: 'Efectivo', emoji: '💵' },
  tarjeta: { nombre: 'Tarjeta', emoji: '💳' },
  yape_plin: { nombre: 'Yape / Plin', emoji: '📱' },
  transferencia: { nombre: 'Transferencia', emoji: '🏦' },
} as const;
