// La conversación con el asistente: solo en memoria (no se guarda en disco) y de la persona que la empezó.
import { tick } from 'svelte';
import { api, type AccionAsistente, type Confirmado, type ResultadoLinea } from './api';
import type { Libro } from './datos';
import { app } from './estado.svelte';
import { encargosUI } from './encargos.svelte';
import { vista } from './inventario.svelte';
import { sesion } from './sesion.svelte';

export interface TarjetaAccion extends AccionAsistente {
  estado: 'pendiente' | 'hecho' | 'descartado';
  resultado?: Confirmado;
}

export interface MensajeAsistente {
  rol: 'usuaria' | 'asistente';
  texto: string;
  libros?: Libro[];
  externos?: { referencia: string; resultado: ResultadoLinea }[];
  acciones?: TarjetaAccion[];
  proveedor?: string;
  error?: boolean;
  /** Nota de la app (p. ej. «Confirmado: …»): se muestra distinta, pero la IA también la lee. */
  nota?: boolean;
}

export const chat = $state({
  /** De quién es esta conversación: si entra otra persona, empieza de cero. */
  de: null as number | null,
  mensajes: [] as MensajeAsistente[],
  pensando: false,
});

export function nuevaConversacion() {
  chat.mensajes = [];
  chat.pensando = false;
  chat.de = sesion.usuaria?.id ?? null;
}

/** Si cambió la persona, la conversación anterior no se muestra. */
export function revisarDueno() {
  if (chat.de !== (sesion.usuaria?.id ?? null)) nuevaConversacion();
}

export async function preguntar(texto: string) {
  const t = texto.trim();
  if (!t || chat.pensando) return;
  revisarDueno();
  chat.mensajes.push({ rol: 'usuaria', texto: t });
  chat.pensando = true;
  try {
    const historial = chat.mensajes.filter((m) => !m.error).map((m) => ({ rol: m.rol, texto: m.texto }));
    const r = await api.asistentePreguntar(historial);
    chat.mensajes.push({
      rol: 'asistente',
      texto: r.texto || (r.acciones.length ? 'Revisa la propuesta y confírmala si está bien:' : 'No tengo una respuesta para eso.'),
      libros: r.libros.map(vista),
      externos: r.externos,
      acciones: r.acciones.map((a) => ({ ...a, estado: 'pendiente' as const })),
      proveedor: r.proveedor,
    });
  } catch (e) {
    chat.mensajes.push({ rol: 'asistente', texto: (e as Error).message, error: true });
  } finally {
    chat.pensando = false;
  }
}

/** Vuelve a intentar la última pregunta (tras un error). */
export function reintentar() {
  const i = chat.mensajes.findLastIndex((m) => m.rol === 'usuaria');
  if (i < 0) return;
  const texto = chat.mensajes[i].texto;
  chat.mensajes.splice(i);
  void preguntar(texto);
}

/** Deja constancia en la conversación de lo que se confirmó (la IA lo sabrá en la próxima pregunta). */
export function anotar(texto: string) {
  chat.mensajes.push({ rol: 'asistente', texto, nota: true });
}

/** Lleva a un destino de la app: `libro:7`, `encargo:12`, `encargos`, `ajustes:usuarios`… */
export async function irA(destino: string) {
  const [k, v] = destino.split(':');
  app.fichaMovil = false;
  if (k === 'libro' && v) {
    app.editar = Number(v); // Libros abre su edición (ahí está también «Dar de baja»)
    app.vista = 'libros';
  } else if (k === 'encargo' && v) {
    encargosUI.resaltar = Number(v);
    encargosUI.pestana = 'tablero';
    app.vista = 'encargos';
  } else if (k === 'clientes') {
    encargosUI.pestana = 'clientes';
    app.vista = 'encargos';
  } else if (k === 'ajustes') {
    app.vista = 'ajustes';
    if (v) {
      await tick();
      setTimeout(() => document.getElementById(`ajustes-${v}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  } else if (['encargos', 'libros', 'reportes', 'vender'].includes(k)) {
    app.vista = k as 'encargos';
  }
}

export const NOMBRE_DESTINO: Record<string, string> = {
  libro: 'Abrir el libro',
  encargo: 'Ver el encargo',
  encargos: 'Ir a Encargos',
  libros: 'Ir a Libros',
  reportes: 'Ir a Reportes',
  vender: 'Ir a Vender',
  clientes: 'Ir a Clientes',
  ajustes: 'Ir a Ajustes',
  'ajustes:usuarios': 'Ajustes → Usuarias',
  'ajustes:categorias': 'Ajustes → Categorías',
  'ajustes:asistente': 'Ajustes → Asistente IA',
};

export const nombreDestino = (d: string) => NOMBRE_DESTINO[d] ?? NOMBRE_DESTINO[d.split(':')[0]] ?? 'Abrir';

// ── texto con un poco de formato: viñetas, **negrita**, fichas [[libro:ID]] / [[web:REF]], tarjetas y enlaces ──
export type Trozo =
  | { tipo: 'texto' | 'negrita'; texto: string }
  | { tipo: 'libro'; id: number }
  | { tipo: 'web' | 'accion' | 'ir'; ref: string };
export interface Bloque {
  vineta: boolean;
  trozos: Trozo[];
}

function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  const re = /\[\[(libro|web|accion|ir):([^\]]+)\]\]|\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (const m of linea.matchAll(re)) {
    if (m.index > ultimo) salida.push({ tipo: 'texto', texto: linea.slice(ultimo, m.index) });
    if (m[1] === 'libro') salida.push({ tipo: 'libro', id: Number(m[2]) });
    else if (m[1]) salida.push({ tipo: m[1] as 'web' | 'accion' | 'ir', ref: m[2].trim() });
    else salida.push({ tipo: 'negrita', texto: m[3] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linea.length) salida.push({ tipo: 'texto', texto: linea.slice(ultimo) });
  return salida;
}

export function bloques(texto: string): Bloque[] {
  return texto
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .map((l) => {
      const v = /^\s*([-*•]|\d+[.)])\s+/.exec(l);
      return { vineta: !!v, trozos: trozos(v ? l.slice(v[0].length) : l.replace(/^#+\s*/, '')) };
    });
}
