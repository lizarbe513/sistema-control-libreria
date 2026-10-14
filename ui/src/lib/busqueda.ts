// Búsqueda tolerante a tildes y errores de tipeo, en el navegador.
// La app real busca en Rust (crates/core/src/busqueda.rs) con el mismo algoritmo; esta versión la usa
// el backend de demostración.

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ');

export const palabras = (s: string) => normalizar(s).split(/\s+/).filter(Boolean);

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return fila[b.length];
}

function puntajePalabra(q: string, w: string): number {
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.9;
  if (q.length >= 3 && w.includes(q)) return 0.7;
  if (q.length >= 4) {
    const d = distancia(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))));
    if (d <= 1) return 0.6;
    if (d <= 2 && q.length >= 7) return 0.4;
  }
  return 0;
}

export interface CamposBusqueda {
  titulo: string;
  resto: string;
  stock: number;
}

/** Los elementos que coinciden con la consulta, del más parecido al menos. */
export function buscarEn<T>(items: T[], consulta: string, campos: (t: T) => CamposBusqueda): T[] {
  const qs = palabras(consulta);
  if (!qs.length) return [];
  const res: { item: T; p: number }[] = [];
  for (const item of items) {
    const c = campos(item);
    const titulo = palabras(c.titulo);
    const resto = palabras(c.resto);
    let total = 0;
    let ok = true;
    for (const q of qs) {
      let mejor = 0;
      for (const w of titulo) mejor = Math.max(mejor, puntajePalabra(q, w) * 1.2);
      for (const w of resto) mejor = Math.max(mejor, puntajePalabra(q, w));
      if (mejor === 0) {
        ok = false;
        break;
      }
      total += mejor;
    }
    if (ok) res.push({ item, p: total + (c.stock > 0 ? 0.05 : 0) });
  }
  return res.sort((a, b) => b.p - a.p).map((r) => r.item);
}
