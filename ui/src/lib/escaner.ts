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
