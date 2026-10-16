// Actualizaciones de la app.
// · PC (Windows): al abrirse revisa si hay una versión nueva (firmada con la llave del proyecto) y, con un clic, hace un
//   respaldo, la descarga, la instala y se reinicia.
// · Celular (Android): revisa latest-android.json en la descarga privada de versiones (Cloudflare R2), descarga el APK y abre el
//   instalador de Android (un toque en «Instalar»). También avisa si el PC tiene una versión más nueva que el celular.
// Sin internet no molesta.
import { api } from './api';
import { avisar } from './estado.svelte';

const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const esAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
/** Solo las apps instaladas (PC y celular), no el navegador ni el modo de desarrollo. */
export const hayActualizador = enTauri && !import.meta.env.DEV;
export const esCelular = esAndroid;

const URL_ANDROID = 'https://pub-f41a4d67dc1a41729f716c52c8052735.r2.dev/a80fe818213ab3041cf119499c547661/latest-android.json';

export const actualizacion = $state({
  version: '',
  /** Versión nueva disponible (null si no hay o aún no se revisó). */
  nueva: null as string | null,
  notas: '',
  revisando: false,
  instalando: false,
  /** 0 a 100 mientras descarga (solo PC); null si aún no se sabe el tamaño. */
  progreso: null as number | null,
  /** Resultado de la última revisión manual: 'al-dia' | 'error' | null. */
  ultima: null as 'al-dia' | 'error' | null,
  /** Celular: el PC ya tiene una versión más nueva que esta app. */
  pcMasNuevo: null as string | null,
  /** Celular: falta permitir «instalar apps desconocidas» (Android lo pide una vez). */
  faltaPermiso: false,
});

/** «1.2.10» > «1.2.9». */
export function esMasNueva(a: string, b: string) {
  const n = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

type Update = { version: string; body?: string; downloadAndInstall: (cb: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> };
let pendiente: Update | null = null;
let apk: { url: string; sha256: string } | null = null;

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

async function revisarCelular(manual: boolean) {
  const { invoke } = await import('@tauri-apps/api/core');
  const actual = actualizacion.version || (await versionActual());
  let error = false;
  try {
    const j = await invoke<{ version: string; notes?: string; apk: string; sha256?: string }>('plugin:actualizar|revisar', { url: URL_ANDROID });
    if (j.version && esMasNueva(j.version, actual)) {
      actualizacion.nueva = j.version;
      actualizacion.notas = j.notes ?? '';
      apk = { url: j.apk, sha256: j.sha256 ?? '' };
    } else {
      actualizacion.nueva = null;
    }
  } catch {
    error = true;
  }
  // ¿el PC es más nuevo que este celular?
  try {
    const pc = (await api.versionPc?.()) ?? null;
    actualizacion.pcMasNuevo = pc && esMasNueva(pc, actual) ? pc : null;
  } catch {
    actualizacion.pcMasNuevo = null;
  }
  if (manual) actualizacion.ultima = error ? 'error' : actualizacion.nueva ? null : 'al-dia';
}

/** Revisa si hay una versión nueva. `manual`: el usuario la pidió (muestra el resultado aunque no haya nada). */
export async function revisar(manual = false) {
  if (!hayActualizador || actualizacion.revisando || actualizacion.instalando) return;
  actualizacion.revisando = true;
  actualizacion.ultima = null;
  try {
    if (esAndroid) {
      await revisarCelular(manual);
      return;
    }
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

async function instalarCelular() {
  if (!apk) return;
  const { invoke } = await import('@tauri-apps/api/core');
  actualizacion.instalando = true;
  actualizacion.faltaPermiso = false;
  try {
    await invoke('plugin:actualizar|instalar', { url: apk.url, sha256: apk.sha256 });
    avisar('Toca «Instalar» en la pantalla de Android 📲');
  } catch (e) {
    if (String(e) === 'permiso') {
      actualizacion.faltaPermiso = true;
      avisar('Activa «Permitir de esta fuente» y vuelve a tocar Actualizar');
    } else {
      avisar(`No se pudo actualizar: ${String(e)}`);
    }
  } finally {
    actualizacion.instalando = false;
  }
}

/** PC: respaldo de seguridad, descarga, instalación y reinicio. Celular: descarga el APK y abre el instalador. */
export async function instalar() {
  if (actualizacion.instalando) return;
  if (esAndroid) return instalarCelular();
  if (!pendiente) return;
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
