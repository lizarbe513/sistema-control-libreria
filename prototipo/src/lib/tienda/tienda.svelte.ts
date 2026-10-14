// Estado reactivo de la tienda con deshacer/rehacer y guardado automático.
// En el prototipo se guarda en localStorage; en la app irá a la base de datos cifrada.

import { guardar, leer } from '../estado.svelte';
import { clave, indice, nuevoEstante, plantillaSigloXXI, type Bloque, type Estante, type Tienda, type TipoBloque } from './modelo';

const VERSION = 1;

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
