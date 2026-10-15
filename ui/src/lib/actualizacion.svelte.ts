// Actualizaciones de la app del PC: al abrirse revisa si hay una versión nueva (firmada con la llave del proyecto) y,
// con un clic, hace un respaldo, la descarga, la instala y se reinicia. Sin internet no molesta.
import { api } from './api';
import { avisar } from './estado.svelte';

const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const esCelular = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
/** Solo la app instalada en el PC (no el navegador, no el celular, no el modo de desarrollo). */
export const hayActualizador = enTauri && !esCelular && !import.meta.env.DEV;

export const actualizacion = $state({
  version: '',
  /** Versión nueva disponible (null si no hay o aún no se revisó). */
  nueva: null as string | null,
  notas: '',
  revisando: false,
  instalando: false,
  /** 0 a 100 mientras descarga; null si aún no se sabe el tamaño. */
  progreso: null as number | null,
  /** Resultado de la última revisión manual: 'al-dia' | 'error' | null. */
  ultima: null as 'al-dia' | 'error' | null,
});

type Update = { version: string; body?: string; downloadAndInstall: (cb: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> };
let pendiente: Update | null = null;

export async function versionActual() {
  if (!enTauri) return '';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    actualizacion.version = await getVersion();
  } catch {
    /* sin versión */
  }
  return actualizacion.version;
}

/** Revisa si hay una versión nueva. `manual`: el usuario la pidió (muestra el resultado aunque no haya nada). */
export async function revisar(manual = false) {
  if (!hayActualizador || actualizacion.revisando || actualizacion.instalando) return;
  actualizacion.revisando = true;
  actualizacion.ultima = null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = (await check()) as Update | null;
    pendiente = u;
    actualizacion.nueva = u?.version ?? null;
    actualizacion.notas = u?.body ?? '';
    if (manual) actualizacion.ultima = u ? null : 'al-dia';
  } catch {
    if (manual) actualizacion.ultima = 'error';
  } finally {
    actualizacion.revisando = false;
  }
}

/** Respaldo de seguridad, descarga, instalación y reinicio. */
export async function instalar() {
  if (!pendiente || actualizacion.instalando) return;
  actualizacion.instalando = true;
  actualizacion.progreso = null;
  try {
    // por si algo sale mal: antes de cambiar la app se guarda un respaldo de los datos
    await api.crearRespaldo().catch(() => undefined);
    let total = 0;
    let bajado = 0;
    await pendiente.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data?.contentLength ?? 0;
      if (e.event === 'Progress') {
        bajado += e.data?.chunkLength ?? 0;
        actualizacion.progreso = total ? Math.min(100, Math.round((bajado / total) * 100)) : null;
      }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    actualizacion.instalando = false;
    avisar(`No se pudo actualizar: ${(e as Error).message ?? e}`);
  }
}
