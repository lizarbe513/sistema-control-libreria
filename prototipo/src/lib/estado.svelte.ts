// Estado global del prototipo (runas de Svelte 5).
import type { Libro } from './datos';

export type Vista = 'inicio' | 'buscar' | 'vender' | 'encargos' | 'reportes' | 'asistente' | 'tienda' | 'ajustes';
export type FondoId = 'petalos' | 'estanque' | 'cielo';
export type AnimLibro = 'aleatoria' | 'caida' | 'estante' | 'pluma' | 'trompo' | 'pop' | 'volteo';
export type FondoOpcion = FondoId | 'hora' | 'quieto';

export const leer = <T>(clave: string, defecto: T): T => {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
};

export const guardar = (clave: string, valor: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: seguimos sin persistir */
  }
};

const reducirMovimiento =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const app = $state({
  usuario: leer('usuario', 'Rosa'),
  vista: 'inicio' as Vista,
  consulta: '',
  seleccionado: null as Libro | null,
  fondo: leer<FondoOpcion>('fondo', reducirMovimiento ? 'quieto' : 'petalos'),
  calma: {
    petalosRadio: !reducirMovimiento,
    rendimiento: false,
    animaciones: !reducirMovimiento,
    animLibro: 'aleatoria' as AnimLibro,
    ...leer<Record<string, unknown>>('calma', {}),
  },
  radio: { sonando: false, pista: 0, volumen: 0.6 },
  libretaAbierta: false,
  fichaMovil: false,
  toast: '' as string,
  hora: new Date().getHours(),
});

/** Fondo que realmente se muestra (resuelve "según la hora"). */
export function fondoEfectivo(): FondoId | 'quieto' {
  if (app.fondo !== 'hora') return app.fondo;
  const h = app.hora;
  if (h >= 6 && h < 17) return 'petalos';
  if (h >= 17 && h < 19) return 'estanque';
  return 'cielo';
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function avisar(texto: string) {
  app.toast = texto;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = ''), 2800);
}

export function saludo(h = app.hora) {
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
