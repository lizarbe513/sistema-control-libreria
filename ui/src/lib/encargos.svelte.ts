// Encargos en la interfaz: el formulario precargado, la carta de «¡llegó!» y un contador de cambios.
import { api, type Encargo, type EstadoEncargo } from './api';
import { app } from './estado.svelte';

export interface Precarga {
  titulo?: string;
  autor?: string;
  libroId?: number | null;
}

export interface Carta {
  libro: { id: number; titulo: string };
  /** «llego»: encargos que esperaban este libro. «coincidencia»: encargos sin libro con un título parecido. */
  tipo: 'llego' | 'coincidencia';
  encargos: Encargo[];
}

export const encargosUI = $state({ version: 0, nuevo: null as Precarga | null, carta: null as Carta | null });

export function encargosCambio() {
  encargosUI.version++;
}

/** «¿Lo encargamos?»: abre el formulario en la vista Encargos, con lo que ya se sabe. */
export function abrirNuevoEncargo(p: Precarga = {}) {
  encargosUI.nuevo = p;
  app.fichaMovil = false;
  app.vista = 'encargos';
}

/** Tras un ingreso de stock (o el alta de un libro): ¿algún cliente lo esperaba? Muestra la carta. */
export async function revisarLlegada(libro: { id: number; titulo: string; stock: number }, esNuevo: boolean) {
  try {
    if (esNuevo) {
      const parecidos = await api.encargosCoincidencias(libro.titulo);
      if (parecidos.length) {
        encargosUI.carta = { libro, tipo: 'coincidencia', encargos: parecidos };
        return;
      }
    }
    if (libro.stock <= 0) return;
    const esperan = await api.encargosEsperando(libro.id);
    if (esperan.length) encargosUI.carta = { libro, tipo: 'llego', encargos: esperan };
  } catch {
    /* el aviso es una ayuda: si falla, no interrumpe el guardado */
  }
}

export const ESTADOS: Record<EstadoEncargo, { nombre: string; emoji: string; color: string }> = {
  pendiente: { nombre: 'Pendiente', emoji: '🕒', color: '#FCEFC7' },
  pedido: { nombre: 'Pedido al proveedor', emoji: '📮', color: '#DDEFFB' },
  llego: { nombre: 'Llegó', emoji: '📬', color: '#DDF3E4' },
  avisado: { nombre: 'Avisado', emoji: '💬', color: '#E9E3FB' },
  entregado: { nombre: 'Entregado', emoji: '🎁', color: '#F1ECEE' },
  cancelado: { nombre: 'Cancelado', emoji: '✖️', color: '#F1ECEE' },
};

export const ACTIVOS: EstadoEncargo[] = ['pendiente', 'pedido', 'llego', 'avisado'];

export const SIGUIENTE: Partial<Record<EstadoEncargo, EstadoEncargo>> = { pendiente: 'pedido', pedido: 'llego', llego: 'avisado' };

/** «hace 3 días», «hoy»… */
export function hace(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}
