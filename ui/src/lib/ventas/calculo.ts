// Cálculo de una venta. Es el espejo exacto de `crates/core/src/ventas.rs` (que recalcula al registrar):
// aquí solo sirve para mostrar los totales mientras se arma la venta y para el modo demostración.
// Todo en céntimos enteros; los descuentos en porcentaje se redondean a favor del cliente.
import type { Descuento, Metodo } from '../api/tipos';

export function montoDescuento(base: number, d?: Descuento | null): number {
  if (!d) return 0;
  return d.tipo === 'pct' ? base - Math.floor((base * (100 - d.valor)) / 100) : Math.min(d.valor, base);
}

export interface LineaEntrada {
  precioCent: number;
  cantidad: number;
  descuento?: Descuento | null;
}

export interface Calculo {
  lineas: { brutoCent: number; descuentoCent: number; totalCent: number }[];
  subtotalCent: number;
  /** Todos los descuentos juntos (libros, tipo de cliente y total). */
  descuentoCent: number;
  /** Total antes del redondeo de efectivo. */
  totalPrevioCent: number;
}

/** Orden: descuento del libro → tipo de cliente → descuento al total. */
export function calcular(lineas: LineaEntrada[], tipoPct: number, total?: Descuento | null): Calculo {
  const res = lineas.map((l) => {
    const bruto = l.precioCent * l.cantidad;
    const trasLibro = bruto - montoDescuento(bruto, l.descuento);
    const trasTipo = Math.floor((trasLibro * (100 - tipoPct)) / 100);
    return { brutoCent: bruto, descuentoCent: bruto - trasTipo, totalCent: trasTipo };
  });
  const subtotal = res.reduce((s, l) => s + l.brutoCent, 0);
  const base = res.reduce((s, l) => s + l.totalCent, 0);
  const previo = base - montoDescuento(base, total);
  return { lineas: res, subtotalCent: subtotal, descuentoCent: subtotal - previo, totalPrevioCent: previo };
}

/**
 * En efectivo no circulan monedas de 1 y 5 céntimos: lo que se paga en efectivo se baja a múltiplo de
 * 10 céntimos, a favor del cliente. Tarjeta, Yape/Plin y transferencia cobran exacto.
 */
export function redondeoEfectivo(totalPrevio: number, pagos: { metodo: Metodo; montoCent: number }[]): number {
  if (!pagos.some((p) => p.metodo === 'efectivo')) return 0;
  const otros = pagos.filter((p) => p.metodo !== 'efectivo').reduce((s, p) => s + p.montoCent, 0);
  const efectivo = totalPrevio - otros;
  return efectivo >= 10 ? efectivo % 10 : 0;
}

/** El efectivo que falta cobrar, ya sin los céntimos sueltos (para precargar el monto del pago). */
export function efectivoSugerido(faltaCent: number): number {
  return faltaCent >= 10 ? faltaCent - (faltaCent % 10) : faltaCent;
}
