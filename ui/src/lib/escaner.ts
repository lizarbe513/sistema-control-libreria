// Cámara del celular (solo en la app de Android): lector de códigos de barras y QR del plugin oficial de Tauri.
// Todo se carga a pedido: en el PC y en el navegador estas funciones simplemente dicen que no hay cámara.
const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const esAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const hayCamara = enTauri && esAndroid;

export type Formato = 'qr' | 'ean13';

async function modulo() {
  return import('@tauri-apps/plugin-barcode-scanner');
}

/** Pide el permiso de la cámara si hace falta. */
export async function permisoCamara(): Promise<boolean> {
  if (!hayCamara) return false;
  const m = await modulo();
  let p = await m.checkPermissions();
  if (p !== 'granted') p = await m.requestPermissions();
  return p === 'granted';
}

/**
 * Lee un código con la cámara. Con `ventana` la cámara se ve detrás de la pantalla (que debe ser transparente) y la
 * interfaz sigue visible encima; sin ella se abre la cámara a pantalla completa. Devuelve null si se cancela.
 */
export async function leer(formato: Formato, ventana = false): Promise<string | null> {
  if (!hayCamara) return null;
  const m = await modulo();
  const r = await m.scan({ windowed: ventana, formats: [formato === 'qr' ? m.Format.QRCode : m.Format.EAN13] });
  return r.content ?? null;
}

export async function cancelarLectura() {
  if (!hayCamara) return;
  try {
    await (await modulo()).cancel();
  } catch {
    /* ya estaba cancelada */
  }
}

// ── leer el título de la portada: foto → reconocimiento de texto en el teléfono (ML Kit, OcrPlugin.kt) ──
export interface LineaLeida {
  texto: string;
  /** Altura de las letras en píxeles: las más grandes suelen ser el título. */
  alto: number;
  y: number;
}

/** Abre la cámara, lee el texto de la foto y devuelve sus líneas (null si se canceló la foto). */
export async function leerTexto(): Promise<LineaLeida[] | null> {
  if (!hayCamara) return null;
  const { tomarFoto } = await import('./foto');
  const imagen = await tomarFoto();
  if (!imagen) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  const r = await invoke<{ lineas: LineaLeida[] }>('plugin:ocr|reconocer', { imagen });
  return r.lineas.filter((l) => l.texto.trim().length > 1);
}

/** El título probable: las líneas con letras casi tan grandes como las mayores, en orden de lectura. */
export function adivinarTitulo(lineas: LineaLeida[]): string {
  if (!lineas.length) return '';
  const mayor = Math.max(...lineas.map((l) => l.alto));
  return lineas
    .filter((l) => l.alto >= mayor * 0.75)
    .sort((a, b) => a.y - b.y)
    .map((l) => l.texto.trim())
    .join(' ');
}

// ── aviso al leer un código: vibración corta y un «bip» suave (se puede apagar en Ajustes) ──
const CLAVE_AVISO = 'escaneo-aviso';

export function avisoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_AVISO) !== '0';
  } catch {
    return true;
  }
}

export function fijarAviso(activo: boolean) {
  try {
    localStorage.setItem(CLAVE_AVISO, activo ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
}

let audio: AudioContext | null = null;

export function avisarLectura(bien = true) {
  if (!avisoActivo()) return;
  try {
    navigator.vibrate?.(bien ? 90 : [60, 60, 60]);
  } catch {
    /* sin vibración */
  }
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = bien ? 1320 : 330;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (bien ? 0.12 : 0.25));
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.3);
  } catch {
    /* sin audio */
  }
}
