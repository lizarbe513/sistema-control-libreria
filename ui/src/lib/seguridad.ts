// Fuerza aproximada de una contraseña (0–5): largo, mayúsculas y minúsculas, números y símbolos o espacios.
export const NIVELES_FUERZA = ['Muy débil', 'Débil', 'Regular', 'Buena', 'Muy buena', 'Excelente'];

export function fuerzaContrasena(c: string): number {
  let p = 0;
  if ([...c].length >= 8) p++;
  if ([...c].length >= 12) p++;
  if (/[a-zñáéíóú]/.test(c) && /[A-ZÑÁÉÍÓÚ]/.test(c)) p++;
  if (/\d/.test(c)) p++;
  if (/[^\p{L}\d]/u.test(c)) p++;
  return p;
}

/** «hoy 15:02», «ayer 09:10» o «12 oct 2026, 15:02», en hora local. */
export function fechaAmable(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  if (dif === 0) return `hoy ${hora}`;
  if (dif === 1) return `ayer ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}, ${hora}`;
}

export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
