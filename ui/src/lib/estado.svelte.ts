// Estado global de la interfaz (runas de Svelte 5).
import type { Libro } from './datos';

export type Vista = 'inicio' | 'buscar' | 'libros' | 'vender' | 'encargos' | 'reportes' | 'asistente' | 'tienda' | 'ajustes' | 'escanear' | 'mas' | 'nuevo';
export type FondoId = 'petalos' | 'estanque' | 'cielo';
export type AnimLibro = 'aleatoria' | 'caida' | 'estante' | 'pluma' | 'trompo' | 'pop' | 'volteo';
export type FondoOpcion = FondoId | 'hora' | 'quieto' | 'quietonoche';

/**
 * Preferencias de cada usuaria: se guardan en la base cifrada (no en el navegador, que queda en disco sin
 * cifrar). Fondo y calma además se copian al equipo, para que la pantalla de entrada tenga el mismo aspecto.
 */
const SINCRONIZADAS = new Set(['fondo', 'calma', 'hotbar', 'libreta', 'animLibro']);
const TAMBIEN_EN_EQUIPO = new Set(['fondo', 'calma']);
let preferencias: Record<string, unknown> = {};
let alGuardarPreferencia: ((clave: string, valor: unknown) => void) | null = null;

/** Lo registra la sesión: envía al backend cada preferencia que cambia. */
export function registrarGuardadoPreferencias(f: typeof alGuardarPreferencia) {
  alGuardarPreferencia = f;
}

const leerEquipo = <T>(clave: string, defecto: T): T => {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
};

const guardarEquipo = (clave: string, valor: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: seguimos sin persistir */
  }
};

export const leer = <T>(clave: string, defecto: T): T => {
  if (SINCRONIZADAS.has(clave)) {
    if (clave in preferencias) return structuredClone(preferencias[clave]) as T;
    return TAMBIEN_EN_EQUIPO.has(clave) ? leerEquipo(clave, defecto) : defecto;
  }
  return leerEquipo(clave, defecto);
};

export const guardar = (clave: string, valor: unknown) => {
  if (!SINCRONIZADAS.has(clave)) return guardarEquipo(clave, valor);
  preferencias[clave] = structuredClone($state.snapshot(valor)); // snapshot: structuredClone no admite el proxy de $state
  if (TAMBIEN_EN_EQUIPO.has(clave)) guardarEquipo(clave, valor);
  alGuardarPreferencia?.(clave, preferencias[clave]);
};

const reducirMovimiento =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const app = $state({
  usuario: '',
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
  /** Modo enfoque del editor de la tienda: solo la bibliotecaria y su biblioteca. */
  enfoque: false,
  fichaMovil: false,
  /** Libro abierto en el formulario de «Libros»: un id, «nuevo», o ninguno. */
  editar: null as number | 'nuevo' | null,
  toast: '' as string,
  hora: new Date().getHours(),
});

const CALMA_INICIAL = { ...app.calma };

/** Al entrar: aplica las preferencias guardadas de la usuaria. */
export function aplicarPreferencias(p: Record<string, unknown>) {
  preferencias = structuredClone(p ?? {});
  if (typeof p.fondo === 'string') app.fondo = p.fondo as FondoOpcion;
  if (p.calma && typeof p.calma === 'object') app.calma = { ...CALMA_INICIAL, ...(p.calma as object) };
}

/** Al salir: se olvidan las preferencias (y las notas de la libreta) de quien estaba. */
export function olvidarPreferencias() {
  preferencias = {};
}

/** Fondo que realmente se muestra (resuelve "según la hora"). */
export function fondoEfectivo(): FondoId | 'quieto' | 'quietonoche' {
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
