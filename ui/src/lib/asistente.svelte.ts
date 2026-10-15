// La conversación con el asistente: solo en memoria (no se guarda en disco) y de la persona que la empezó.
import { api } from './api';
import type { Libro } from './datos';
import { vista } from './inventario.svelte';
import { sesion } from './sesion.svelte';

export interface MensajeAsistente {
  rol: 'usuaria' | 'asistente';
  texto: string;
  libros?: Libro[];
  proveedor?: string;
  error?: boolean;
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
    chat.mensajes.push({ rol: 'asistente', texto: r.texto || 'No tengo una respuesta para eso.', libros: r.libros.map(vista), proveedor: r.proveedor });
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

// ── texto con un poco de formato: viñetas, **negrita** y fichas [[libro:ID]] ──
export type Trozo = { tipo: 'texto' | 'negrita'; texto: string } | { tipo: 'libro'; id: number };
export interface Bloque {
  vineta: boolean;
  trozos: Trozo[];
}

function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  const re = /\[\[libro:(\d+)\]\]|\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (const m of linea.matchAll(re)) {
    if (m.index > ultimo) salida.push({ tipo: 'texto', texto: linea.slice(ultimo, m.index) });
    if (m[1]) salida.push({ tipo: 'libro', id: Number(m[1]) });
    else salida.push({ tipo: 'negrita', texto: m[2] });
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
