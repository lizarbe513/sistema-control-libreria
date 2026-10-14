// Estado reactivo de la tienda con deshacer/rehacer y guardado automático.
// En el prototipo se guarda en localStorage; en la app irá a la base de datos cifrada.

import { guardar, leer } from '../estado.svelte';
import {
  clave,
  columnas,
  indice,
  letraDe,
  materializar,
  nuevoEstante,
  plantillaSigloXXI,
  siguienteLetra,
  type Bloque,
  type Estante,
  type Tienda,
  type TipoBloque,
} from './modelo';

export interface Plantilla {
  id: string;
  nombre: string;
  tienda: Tienda | null; // null = la incluida (SIGLO XXI), se genera al cargarla
}

const INCLUIDA: Plantilla = { id: 'siglo-xxi', nombre: 'SIGLO XXI (croquis)', tienda: null };

const VERSION = 2;

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

/**
 * Normaliza la tienda: un estante sin bloques desaparece del todo (lista, cartel y color),
 * y sus divisiones solo conservan las celdas que todavía existen.
 */
function limpiar(t: Tienda): Tienda {
  const columnasDe = new Map<string, Set<string>>();
  const celdasDe = new Map<string, Set<string>>();
  for (const b of t.bloques) {
    if (!b.estante) continue;
    if (!columnasDe.has(b.estante)) columnasDe.set(b.estante, new Set());
    if (!celdasDe.has(b.estante)) celdasDe.set(b.estante, new Set());
    columnasDe.get(b.estante)!.add(`${b.x},${b.z}`);
    celdasDe.get(b.estante)!.add(clave(b.x, b.y, b.z));
  }
  const estantes = t.estantes
    .filter((e) => columnasDe.has(e.id))
    .map((e) => {
      const cols = columnasDe.get(e.id)!;
      const celdas = celdasDe.get(e.id)!;
      const inicioTramo = e.inicioTramo?.filter((k) => cols.has(k));
      const tablas = e.tablas?.filter((k) => celdas.has(k));
      const igual = (a?: string[], b?: string[]) => a?.length === b?.length;
      return igual(inicioTramo, e.inicioTramo) && igual(tablas, e.tablas) ? e : { ...e, inicioTramo, tablas };
    });
  return estantes.length === t.estantes.length && estantes.every((e, i) => e === t.estantes[i]) ? t : { ...t, estantes };
}

function leerPlantillas(): Plantilla[] {
  const g = leer<{ v: number; lista: Plantilla[] } | null>('plantillas', null);
  return [INCLUIDA, ...(g && g.v === VERSION ? g.lista.filter((p) => p.id !== INCLUIDA.id) : [])];
}

const copia = (t: Tienda): Tienda => JSON.parse(JSON.stringify(t));

function tiendaDePlantilla(p: Plantilla | undefined): Tienda {
  return p?.tienda ? copia(p.tienda) : plantillaSigloXXI();
}

function cargar(): Tienda {
  const g = leer<{ v: number; t: Tienda } | null>('tienda', null);
  if (g && g.v === VERSION && Array.isArray(g.t?.bloques)) return g.t;
  const defecto = leer<string>('plantillaDefecto', INCLUIDA.id);
  return tiendaDePlantilla(leerPlantillas().find((p) => p.id === defecto));
}

class Almacen {
  datos = $state.raw<Tienda>(cargar());
  puedeDeshacer = $state(false);
  puedeRehacer = $state(false);
  plantillas = $state.raw<Plantilla[]>(leerPlantillas());
  plantillaDefecto = $state(leer<string>('plantillaDefecto', INCLUIDA.id));
  private pasado: Tienda[] = [];
  private futuro: Tienda[] = [];
  private espera = 0;

  private aplicar(nuevo: Tienda) {
    this.pasado.push(this.datos);
    if (this.pasado.length > 100) this.pasado.shift();
    this.futuro = [];
    this.datos = limpiar(nuevo);
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

  /** Coloca un relleno de muebles para libros como un estante nuevo, conectado (un solo paso de deshacer). */
  colocarComoEstante(nuevos: Bloque[], tipo: TipoBloque): Estante | null {
    const e = nuevoEstante(this.datos, tipo);
    const ocupado = indice(this.datos.bloques);
    const validos = nuevos
      .filter((b) => this.dentro(b.x, b.y, b.z) && !ocupado.has(clave(b.x, b.y, b.z)))
      .map((b) => ({ ...b, estante: e.id }));
    if (!validos.length) return null;
    this.aplicar({ ...this.datos, estantes: [...this.datos.estantes, e], bloques: [...this.datos.bloques, ...validos] });
    return e;
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

  /** Asigna una letra; si ya la usa otro estante, se intercambian. */
  asignarLetra(id: string, letra: string) {
    const nueva = letra.trim().toUpperCase().slice(0, 3);
    if (!nueva) return;
    const actual = this.datos.estantes.find((e) => e.id === id);
    if (!actual) return;
    const vieja = letraDe(actual);
    const titulo = (e: Estante, l: string) => (e.titulo === `Estante ${letraDe(e)}` ? `Estante ${l}` : e.titulo);
    const estantes = this.datos.estantes.map((e) => {
      if (e.id === id) return { ...e, letra: nueva, titulo: titulo(e, nueva) };
      if (letraDe(e) === nueva) return { ...e, letra: vieja, titulo: titulo(e, vieja) };
      return e;
    });
    this.aplicar({ ...this.datos, estantes });
  }

  /** Une el estante `b` dentro de `a` (sus bloques y divisiones pasan a `a`). */
  unir(a: string, b: string) {
    if (a === b) return;
    const ea = this.datos.estantes.find((e) => e.id === a);
    const eb = this.datos.estantes.find((e) => e.id === b);
    if (!ea || !eb) return;
    const da = materializar(this.datos, ea);
    const db = materializar(this.datos, eb);
    const bloques = this.datos.bloques.map((x) => (x.estante === b ? { ...x, estante: a } : x));
    const estantes = this.datos.estantes
      .filter((e) => e.id !== b)
      .map((e) => (e.id === a ? { ...e, inicioTramo: [...da.inicioTramo, ...db.inicioTramo], tablas: [...da.tablas, ...db.tablas] } : e));
    this.aplicar({ ...this.datos, bloques, estantes });
  }

  /** Parte un estante: desde la columna (x, z) hacia la derecha pasa a un estante nuevo. */
  separar(id: string, x: number, z: number): Estante | null {
    const e = this.datos.estantes.find((s) => s.id === id);
    if (!e) return null;
    const cols = columnas(this.datos, id);
    const i = cols.findIndex((c) => c.x === x && c.z === z);
    if (i <= 0) return null;
    const pasan = new Set(cols.slice(i).map((c) => `${c.x},${c.z}`));
    const tipo = cols[0].bloques[0].tipo;
    const nuevo = nuevoEstante(this.datos, tipo);
    if (!nuevo.letra && tipo === 'estanteria') {
      nuevo.letra = siguienteLetra(this.datos);
      nuevo.titulo = `Estante ${nuevo.letra}`;
    }
    const d = materializar(this.datos, e);
    const deNuevo = (k: string) => pasan.has(k.split(',').length === 3 ? `${k.split(',')[0]},${k.split(',')[2]}` : k);
    const bloques = this.datos.bloques.map((b) => (b.estante === id && pasan.has(`${b.x},${b.z}`) ? { ...b, estante: nuevo.id } : b));
    nuevo.inicioTramo = d.inicioTramo.filter(deNuevo);
    nuevo.tablas = d.tablas.filter(deNuevo);
    const estantes = [
      ...this.datos.estantes.map((s) =>
        s.id === id ? { ...s, inicioTramo: d.inicioTramo.filter((k) => !deNuevo(k)), tablas: d.tablas.filter((k) => !deNuevo(k)) } : s,
      ),
      nuevo,
    ];
    this.aplicar({ ...this.datos, bloques, estantes });
    return nuevo;
  }

  /** Agrega o quita el inicio de un tramo en la columna (x, z). */
  alternarTramo(id: string, x: number, z: number) {
    const e = this.datos.estantes.find((s) => s.id === id);
    if (!e) return;
    const d = materializar(this.datos, e);
    const k = `${x},${z}`;
    const inicioTramo = d.inicioTramo.includes(k) ? d.inicioTramo.filter((o) => o !== k) : [...d.inicioTramo, k];
    this.aplicar({ ...this.datos, estantes: this.datos.estantes.map((s) => (s.id === id ? { ...s, ...d, inicioTramo } : s)) });
  }

  /** Agrega o quita una tabla de repisa encima de la fila `y` en las columnas dadas (todo el tramo). */
  alternarTabla(id: string, y: number, cols: { x: number; z: number }[]) {
    const e = this.datos.estantes.find((s) => s.id === id);
    if (!e || !cols.length) return;
    const d = materializar(this.datos, e);
    const claves = cols.map((c) => clave(c.x, y, c.z));
    const habia = claves.some((k) => d.tablas.includes(k));
    const tablas = habia ? d.tablas.filter((k) => !claves.includes(k)) : [...d.tablas, ...claves];
    this.aplicar({ ...this.datos, estantes: this.datos.estantes.map((s) => (s.id === id ? { ...s, ...d, tablas } : s)) });
    return !habia;
  }

  /** Un tramo cada `n` columnas (las tablas de repisa no cambian). */
  tramosCada(id: string, n: number) {
    const e = this.datos.estantes.find((s) => s.id === id);
    if (!e) return;
    const d = materializar(this.datos, e);
    const inicioTramo = columnas(this.datos, id)
      .filter((_, i) => i % Math.max(1, n) === 0)
      .map((c) => `${c.x},${c.z}`);
    this.aplicar({ ...this.datos, estantes: this.datos.estantes.map((s) => (s.id === id ? { ...s, ...d, inicioTramo } : s)) });
  }

  /** Una repisa cada `n` filas, contando desde la base (los tramos no cambian). */
  repisasCada(id: string, n: number) {
    const e = this.datos.estantes.find((s) => s.id === id);
    if (!e) return;
    const d = materializar(this.datos, e);
    const propios = this.datos.bloques.filter((b) => b.estante === id);
    const base = Math.min(...propios.map((b) => b.y));
    const tablas = propios.filter((b) => (b.y - base + 1) % Math.max(1, n) === 0).map((b) => clave(b.x, b.y, b.z));
    this.aplicar({ ...this.datos, estantes: this.datos.estantes.map((s) => (s.id === id ? { ...s, ...d, tablas } : s)) });
  }

  /** Todo el estante en un solo compartimento. */
  unCompartimento(id: string) {
    this.aplicar({ ...this.datos, estantes: this.datos.estantes.map((s) => (s.id === id ? { ...s, inicioTramo: [], tablas: [] } : s)) });
  }

  /** Dirección de la numeración de tramos y repisas. */
  fijarOrden(id: string, orden: Partial<NonNullable<Estante['orden']>>) {
    this.aplicar({
      ...this.datos,
      estantes: this.datos.estantes.map((s) =>
        s.id === id ? { ...s, orden: { tramos: 'izq', repisas: 'arriba', ...s.orden, ...orden } } : s,
      ),
    });
  }

  /** Borra todo el maquetado y deja una base vacía con las medidas dadas. */
  vaciar(m: Medidas) {
    this.aplicar({ ancho: m.ancho, fachada: m.largo, fondo: m.largo + m.vereda, alto: m.alto, bloques: [], estantes: [] });
  }

  // ───── plantillas con nombre ─────

  private guardarPlantillas() {
    guardar('plantillas', { v: VERSION, lista: this.plantillas.filter((p) => p.id !== INCLUIDA.id) });
    guardar('plantillaDefecto', this.plantillaDefecto);
  }

  guardarPlantilla(nombre: string) {
    const p: Plantilla = { id: `p${Date.now().toString(36)}`, nombre: nombre.trim() || 'Mi plantilla', tienda: copia(this.datos) };
    this.plantillas = [...this.plantillas, p];
    this.guardarPlantillas();
    return p;
  }

  cargarPlantilla(id: string) {
    const p = this.plantillas.find((x) => x.id === id);
    if (p) this.aplicar(tiendaDePlantilla(p));
  }

  marcarDefecto(id: string) {
    this.plantillaDefecto = id;
    this.guardarPlantillas();
  }

  borrarPlantilla(id: string) {
    if (id === INCLUIDA.id) return;
    this.plantillas = this.plantillas.filter((p) => p.id !== id);
    if (this.plantillaDefecto === id) this.plantillaDefecto = INCLUIDA.id;
    this.guardarPlantillas();
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

  /** Vuelve a la plantilla por defecto. */
  restaurar() {
    this.aplicar(tiendaDePlantilla(this.plantillas.find((p) => p.id === this.plantillaDefecto)));
  }
}

export const tienda = new Almacen();
