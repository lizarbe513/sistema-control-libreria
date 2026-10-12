// Búsqueda tolerante a tildes y errores de tipeo.
// En la app real esto lo hace el backend (FTS5 + similitud); aquí es una versión en memoria.
import { CATEGORIAS, type Libro } from './datos';

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ');

const palabras = (s: string) => normalizar(s).split(/\s+/).filter(Boolean);

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

const indice = new Map<number, { titulo: string[]; resto: string[] }>();

export function buscar(libros: Libro[], consulta: string): Libro[] {
  const qs = palabras(consulta);
  if (!qs.length) return [];
  const res: { libro: Libro; p: number }[] = [];
  for (const libro of libros) {
    let idx = indice.get(libro.id);
    if (!idx) {
      idx = {
        titulo: palabras(libro.titulo),
        resto: palabras(`${libro.autor} ${libro.editorial} ${CATEGORIAS[libro.categoria].nombre}`),
      };
      indice.set(libro.id, idx);
    }
    let total = 0;
    let ok = true;
    for (const q of qs) {
      let mejor = 0;
      for (const w of idx.titulo) mejor = Math.max(mejor, puntajePalabra(q, w) * 1.2);
      for (const w of idx.resto) mejor = Math.max(mejor, puntajePalabra(q, w));
      if (mejor === 0) {
        ok = false;
        break;
      }
      total += mejor;
    }
    if (ok) res.push({ libro, p: total + (libro.stock > 0 ? 0.05 : 0) });
  }
  return res.sort((a, b) => b.p - a.p).map((r) => r.libro);
}
