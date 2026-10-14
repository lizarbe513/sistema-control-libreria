// Estado reactivo de la tienda con deshacer/rehacer y guardado automático.
// En el prototipo se guarda en localStorage; en la app irá a la base de datos cifrada.

import { guardar, leer } from '../estado.svelte';
import { clave, indice, nuevoEstante, plantillaSigloXXI, type Bloque, type Estante, type Tienda, type TipoBloque } from './modelo';

const VERSION = 1;

/** Medidas en celdas de 0,5 m: interior (ancho × largo), vereda y altura. */
export interface Medidas {
  ancho: number;
  largo: number;
  vereda: number;
  alto: number;
}

export const LIMITES: Record<keyof Medidas, [number, number]> = {
  ancho: [6, 60],
  largo: [6, 60],
  vereda: [1, 16],
  alto: [3, 16],
};

export const medidasDe = (t: Tienda): Medidas => ({ ancho: t.ancho, largo: t.fachada, vereda: t.fondo - t.fachada, alto: t.alto });

/** Lleva un bloque a las nuevas medidas: lo de la vereda acompaña a la fachada. `null` si queda fuera. */
function ajustar(b: Bloque, t: Tienda, m: Medidas): Bloque | null {
  if (b.x >= m.ancho || b.y >= m.alto) return null;
  if (b.z < t.fachada) return b.z < m.largo ? b : null; // interior
  const z = b.z - t.fachada + m.largo; // vereda
  return z < m.largo + m.vereda ? { ...b, z } : null;
}

function cargar(): Tienda {
  const g = leer<{ v: number; t: Tienda } | null>('tienda', null);
  return g && g.v === VERSION && Array.isArray(g.t?.bloques) ? g.t : plantillaSigloXXI();
}

class Almacen {
  datos = $state.raw<Tienda>(cargar());
  puedeDeshacer = $state(false);
  puedeRehacer = $state(false);
  private pasado: Tienda[] = [];
  private futuro: Tienda[] = [];
  private espera = 0;

  private aplicar(nuevo: Tienda) {
    this.pasado.push(this.datos);
    if (this.pasado.length > 100) this.pasado.shift();
    this.futuro = [];
    this.datos = nuevo;
    this.marcar();
  }

  private marcar() {
    this.puedeDeshacer = this.pasado.length > 0;
    this.puedeRehacer = this.futuro.length > 0;
    clearTimeout(this.espera);
    this.espera = window.setTimeout(() => guardar('tienda', { v: VERSION, t: this.datos }), 300);
  }

  dentro(x: number, y: number, z: number) {
    const t = this.datos;
    return x >= 0 && z >= 0 && y >= 0 && x < t.ancho && z < t.fondo && y < t.alto;
  }

  /** Coloca bloques en celdas vacías. Devuelve cuántos se colocaron. */
  colocar(nuevos: Bloque[]) {
    const ocupado = indice(this.datos.bloques);
    const validos: Bloque[] = [];
    for (const b of nuevos) {
      const k = clave(b.x, b.y, b.z);
      if (!this.dentro(b.x, b.y, b.z) || ocupado.has(k)) continue;
      ocupado.set(k, b);
      validos.push(b);
    }
    if (validos.length) this.aplicar({ ...this.datos, bloques: [...this.datos.bloques, ...validos] });
    return validos.length;
  }

  quitar(x: number, y: number, z: number) {
    const resto = this.datos.bloques.filter((b) => b.x !== x || b.y !== y || b.z !== z);
    if (resto.length !== this.datos.bloques.length) this.aplicar({ ...this.datos, bloques: resto });
  }

  /** Quita todos los bloques dentro de la caja [a, b] en un solo paso de deshacer. */
  quitarCaja(a: [number, number, number], b: [number, number, number]) {
    const min = [0, 1, 2].map((i) => Math.min(a[i], b[i]));
    const max = [0, 1, 2].map((i) => Math.max(a[i], b[i]));
    const dentro = (x: Bloque) =>
      x.x >= min[0] && x.x <= max[0] && x.y >= min[1] && x.y <= max[1] && x.z >= min[2] && x.z <= max[2];
    const resto = this.datos.bloques.filter((x) => !dentro(x));
    const n = this.datos.bloques.length - resto.length;
    if (n) this.aplicar({ ...this.datos, bloques: resto });
    return n;
  }

  /** Bloques que quedarían fuera con otras medidas (para avisar antes de aplicar). */
  fueraCon(m: Medidas) {
    return this.datos.bloques.filter((b) => !ajustar(b, this.datos, m)).length;
  }

  /** Cambia las medidas. Lo que está en la vereda se mueve con la fachada; lo que queda fuera se quita. */
  redimensionar(m: Medidas) {
    const bloques = this.datos.bloques.map((b) => ajustar(b, this.datos, m)).filter((b): b is Bloque => !!b);
    this.aplicar({ ...this.datos, ancho: m.ancho, fachada: m.largo, fondo: m.largo + m.vereda, alto: m.alto, bloques });
  }

  /** Gira un bloque existente (escaleras, estanterías…). */
  rotar(x: number, y: number, z: number) {
    const bloques = this.datos.bloques.map((b) => (b.x === x && b.y === y && b.z === z ? { ...b, rot: (b.rot + 1) % 4 } : b));
    this.aplicar({ ...this.datos, bloques });
  }

  crearEstante(tipo: TipoBloque): Estante {
    const e = nuevoEstante(this.datos, tipo);
    this.aplicar({ ...this.datos, estantes: [...this.datos.estantes, e] });
    return e;
  }

  editarEstante(id: string, cambios: Partial<Omit<Estante, 'id'>>) {
    // la edición de texto no llena el historial: reemplaza en el sitio
    this.datos = { ...this.datos, estantes: this.datos.estantes.map((e) => (e.id === id ? { ...e, ...cambios } : e)) };
    this.marcar();
  }

  borrarEstante(id: string) {
    this.aplicar({
      ...this.datos,
      estantes: this.datos.estantes.filter((e) => e.id !== id),
      bloques: this.datos.bloques.filter((b) => b.estante !== id),
    });
  }

  deshacer() {
    const t = this.pasado.pop();
    if (!t) return;
    this.futuro.push(this.datos);
    this.datos = t;
    this.marcar();
  }

  rehacer() {
    const t = this.futuro.pop();
    if (!t) return;
    this.pasado.push(this.datos);
    this.datos = t;
    this.marcar();
  }

  restaurar() {
    this.aplicar(plantillaSigloXXI());
  }
}

export const tienda = new Almacen();
