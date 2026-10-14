// La tienda como cuadrícula de bloques (estilo Minecraft). Cada celda mide 0,5 m.
// Ejes: x → este, y → arriba, z → sur (la calle está al sur, desde la fila `fachada`).

export type TipoBloque = 'plataforma' | 'escalera' | 'estanteria' | 'caja' | 'mostrador' | 'exterior' | 'pared' | 'planta';

export interface Bloque {
  x: number;
  y: number;
  z: number;
  tipo: TipoBloque;
  /** 0 mira al sur, 1 al oeste, 2 al norte, 3 al este (cara con libros / subida de la escalera). */
  rot: number;
  /** Estante al que pertenece (solo bloques que guardan libros). */
  estante?: string;
}

export interface Estante {
  id: string;
  titulo: string; // «Estante A», «Caja 2», «Vereda 1»
  tema: string; // qué libros guarda
  color: string; // pastel
  fuerte: string; // tono intenso para resaltar
}

export interface Tienda {
  ancho: number;
  fondo: number;
  alto: number;
  fachada: number; // primera fila z que ya es vereda
  bloques: Bloque[];
  estantes: Estante[];
}

/** Dónde está un libro: estante + tramo (columna, de izquierda a derecha) + repisa (desde arriba). */
export interface UbicacionLibro {
  estante: string;
  tramo: number;
  repisa: number;
}

export interface InfoTipo {
  id: TipoBloque;
  nombre: string;
  emoji: string;
  color: string; // para el plano y el fantasma
  guardaLibros: boolean;
  rota: boolean;
}

export const TIPOS: InfoTipo[] = [
  { id: 'plataforma', nombre: 'Plataforma', emoji: '🟫', color: '#E2C49B', guardaLibros: false, rota: false },
  { id: 'escalera', nombre: 'Escalera', emoji: '🪜', color: '#C99A6B', guardaLibros: false, rota: true },
  { id: 'estanteria', nombre: 'Estantería', emoji: '📚', color: '#D6976A', guardaLibros: true, rota: true },
  { id: 'caja', nombre: 'Caja de libros', emoji: '📦', color: '#7FA7DD', guardaLibros: true, rota: false },
  { id: 'mostrador', nombre: 'Mostrador', emoji: '🧾', color: '#E0607A', guardaLibros: false, rota: true },
  { id: 'exterior', nombre: 'Repisa exterior', emoji: '🟨', color: '#E3BF4F', guardaLibros: true, rota: true },
  { id: 'pared', nombre: 'Pared / columna', emoji: '⬜', color: '#A7A2AA', guardaLibros: false, rota: false },
  { id: 'planta', nombre: 'Planta', emoji: '🪴', color: '#7CC49A', guardaLibros: false, rota: false },
];

export const infoTipo = (t: TipoBloque) => TIPOS.find((i) => i.id === t)!;

/** Vector (x, z) hacia donde mira cada rotación. */
export const FRENTE: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

/** Paleta pastel para estantes: [color, fuerte]. */
export const PALETA: [string, string][] = [
  ['#E9E3FB', '#9B87E0'],
  ['#FCEFC7', '#E9B949'],
  ['#FBD3DE', '#F27A9B'],
  ['#DDEFFB', '#6FA8DC'],
  ['#DDF3E4', '#5DBB8A'],
  ['#FDE2D0', '#F0A070'],
  ['#F3DDF5', '#C77DD0'],
  ['#E0F4F4', '#4FB3B3'],
];

export const clave = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function indice(bloques: Bloque[]) {
  const m = new Map<string, Bloque>();
  for (const b of bloques) m.set(clave(b.x, b.y, b.z), b);
  return m;
}

export interface Columna {
  x: number;
  z: number;
  bloques: Bloque[]; // de arriba hacia abajo
}

/** Columnas (tramos) de un estante, ordenadas de izquierda a derecha mirándolo de frente. */
export function columnas(t: Tienda, estanteId: string): Columna[] {
  const propios = t.bloques.filter((b) => b.estante === estanteId);
  if (!propios.length) return [];
  // orientación mayoritaria del estante
  const votos = [0, 0, 0, 0];
  for (const b of propios) votos[b.rot]++;
  const rot = votos.indexOf(Math.max(...votos));
  const [fx, fz] = FRENTE[rot];
  const [rx, rz] = [fz, -fx]; // derecha de quien mira el estante
  const porCelda = new Map<string, Columna>();
  for (const b of propios) {
    const k = `${b.x},${b.z}`;
    if (!porCelda.has(k)) porCelda.set(k, { x: b.x, z: b.z, bloques: [] });
    porCelda.get(k)!.bloques.push(b);
  }
  const cols = [...porCelda.values()];
  for (const c of cols) c.bloques.sort((a, b) => b.y - a.y);
  // las columnas de atrás (si el estante tiene fondo doble) se ordenan después de las de adelante
  cols.sort((a, b) => a.x * rx + a.z * rz - (b.x * rx + b.z * rz) || b.x * fx + b.z * fz - (a.x * fx + a.z * fz));
  return cols;
}

export interface UbicacionResuelta extends UbicacionLibro {
  tramos: number;
  repisas: number;
  bloque: Bloque;
  info: Estante;
}

export function resolver(t: Tienda, u: UbicacionLibro): UbicacionResuelta | null {
  const info = t.estantes.find((e) => e.id === u.estante);
  if (!info) return null;
  const cols = columnas(t, u.estante);
  const col = cols[Math.min(u.tramo, cols.length) - 1];
  if (!col) return null;
  const repisa = Math.max(1, Math.min(u.repisa, col.bloques.length));
  if (!col.bloques[repisa - 1]) return null;
  return { ...u, repisa, tramos: cols.length, repisas: col.bloques.length, bloque: col.bloques[repisa - 1], info };
}

/** Ubicación de un bloque concreto (para el editor al pasar el mouse). */
export function ubicacionDe(t: Tienda, b: Bloque): UbicacionResuelta | null {
  if (!b.estante) return null;
  const cols = columnas(t, b.estante);
  const ti = cols.findIndex((c) => c.x === b.x && c.z === b.z);
  if (ti < 0) return null;
  const ri = cols[ti].bloques.findIndex((o) => o.y === b.y);
  if (ri < 0) return null;
  return resolver(t, { estante: b.estante, tramo: ti + 1, repisa: ri + 1 });
}

/** Texto corto de ubicación: «A · 3 · 2» o «Caja 2». */
export function textoCorto(u: UbicacionResuelta) {
  if (u.bloque.tipo === 'caja') return u.info.titulo;
  return `${u.info.id} · ${u.tramo} · ${u.repisa}`;
}

/** Camino a pie (celdas x,z) desde la vereda hasta el frente de la columna del bloque. BFS en el piso. */
export function ruta(t: Tienda, destino: Bloque): [number, number][] {
  const ocupado = new Set<string>();
  for (const b of t.bloques) if (b.y === 0) ocupado.add(`${b.x},${b.z}`);
  const libre = (x: number, z: number) => x >= 0 && z >= 0 && x < t.ancho && z < t.fondo && !ocupado.has(`${x},${z}`);

  // metas: celdas libres junto a la columna, primero la de enfrente
  const [fx, fz] = FRENTE[destino.rot] ?? [0, 1];
  const vecinos: [number, number][] = [
    [destino.x + fx, destino.z + fz],
    [destino.x + 1, destino.z],
    [destino.x - 1, destino.z],
    [destino.x, destino.z + 1],
    [destino.x, destino.z - 1],
  ];
  const metas = vecinos.filter(([x, z]) => libre(x, z));
  if (!metas.length) return [];

  // BFS desde la meta hasta la línea de fachada; así el camino termina pegado al estante.
  // Entre las celdas de fachada igual de cercanas, se prefiere la más central.
  const previo = new Map<string, string | null>();
  const dist = new Map<string, number>();
  const meta = metas[0];
  const k0 = `${meta[0]},${meta[1]}`;
  previo.set(k0, null);
  dist.set(k0, 0);
  const cola: [number, number][] = [meta];
  const entradaX = Math.floor(t.ancho / 2);
  let fin: string | null = null;
  let finDist = Infinity;
  let finCentro = Infinity;
  for (let i = 0; i < cola.length; i++) {
    const [x, z] = cola[i];
    const k = `${x},${z}`;
    const d = dist.get(k)!;
    if (d > finDist) break;
    if (z === t.fachada) {
      const c = Math.abs(x - entradaX);
      if (c < finCentro) {
        fin = k;
        finDist = d;
        finCentro = c;
      }
      continue;
    }
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const nk = `${nx},${nz}`;
      if (!libre(nx, nz) || previo.has(nk)) continue;
      previo.set(nk, k);
      dist.set(nk, d + 1);
      cola.push([nx, nz]);
    }
  }
  if (!fin) return [];
  const camino: [number, number][] = [];
  for (let k: string | null = fin; k; k = previo.get(k) ?? null) {
    const [x, z] = k.split(',').map(Number);
    camino.push([x, z]);
  }
  return camino; // de la vereda al estante
}

// ───────────────────────── Plantilla SIGLO XXI (traducida del croquis) ─────────────────────────

export function plantillaSigloXXI(): Tienda {
  const bloques: Bloque[] = [];
  const poner = (x: number, y: number, z: number, tipo: TipoBloque, rot = 0, estante?: string) =>
    bloques.push({ x, y, z, tipo, rot, ...(estante ? { estante } : {}) });
  const caja = (x0: number, x1: number, z0: number, z1: number, tipo: TipoBloque, y0 = 0, y1 = 0, rot = 0, estante?: string) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) poner(x, y, z, tipo, rot, estante);
  };

  const ALTO = 6; // repisas de los estantes de pared
  // columnas grises en las esquinas del fondo
  caja(0, 1, 0, 0, 'pared', 0, ALTO - 1);
  caja(22, 23, 0, 0, 'pared', 0, ALTO - 1);
  // pared del fondo: estantes A y B mirando al sur
  caja(2, 11, 0, 0, 'estanteria', 0, ALTO - 1, 0, 'A');
  caja(12, 21, 0, 0, 'estanteria', 0, ALTO - 1, 0, 'B');
  // pared izquierda: estante C mirando al este
  caja(0, 0, 1, 8, 'estanteria', 0, ALTO - 1, 3, 'C');
  // pared derecha: estantes D y E mirando al oeste
  caja(23, 23, 1, 7, 'estanteria', 0, ALTO - 1, 1, 'D');
  caja(23, 23, 8, 15, 'estanteria', 0, ALTO - 1, 1, 'E');

  // mostrador (abajo a la izquierda), en L
  caja(0, 5, 10, 10, 'mostrador', 0, 0, 0);
  caja(5, 5, 11, 14, 'mostrador', 0, 0, 3);
  poner(1, 0, 15, 'planta');

  // cajas abiertas con libros
  caja(3, 5, 6, 7, 'caja', 0, 0, 0, '1');
  caja(11, 14, 6, 7, 'caja', 0, 0, 0, '2');
  caja(10, 14, 12, 15, 'caja', 0, 0, 0, '3');

  // escaleras que suben hacia el norte, con su plataforma debajo
  const escalera = (x0: number, x1: number, zAbajo: number, largo: number) => {
    for (let i = 0; i < largo; i++) {
      const z = zAbajo - i;
      for (let x = x0; x <= x1; x++) {
        for (let y = 0; y < i; y++) poner(x, y, z, 'plataforma');
        poner(x, i, z, 'escalera', 0);
      }
    }
  };
  escalera(7, 9, 8, 3);
  escalera(16, 20, 9, 4);
  escalera(7, 9, 15, 4);
  escalera(16, 20, 15, 4);

  // repisas exteriores en la vereda (2 niveles)
  caja(0, 0, 17, 22, 'exterior', 0, 1, 3, 'V1');
  caja(10, 10, 17, 22, 'exterior', 0, 1, 1, 'V2');
  caja(11, 11, 17, 22, 'exterior', 0, 1, 3, 'V3');
  caja(23, 23, 17, 22, 'exterior', 0, 1, 1, 'V4');

  // macetas a la entrada
  poner(6, 0, 16, 'planta');
  poner(17, 0, 16, 'planta');

  const est = (id: string, titulo: string, tema: string, i: number): Estante => ({
    id,
    titulo,
    tema,
    color: PALETA[i % PALETA.length][0],
    fuerte: PALETA[i % PALETA.length][1],
  });

  return {
    ancho: 24,
    fondo: 23,
    alto: 10,
    fachada: 16,
    bloques,
    estantes: [
      est('A', 'Estante A', 'Obras literarias', 0),
      est('B', 'Estante B', 'Autoayuda y negocios', 1),
      est('C', 'Estante C', 'Cuentos para niños', 2),
      est('D', 'Estante D', 'Biblias y diccionarios', 3),
      est('E', 'Estante E', 'Pre-U y universitarios', 4),
      est('1', 'Caja 1', 'Novedades', 6),
      est('2', 'Caja 2', 'Cuentos regionales', 5),
      est('3', 'Caja 3', 'Ofertas', 7),
      est('V1', 'Vereda 1', 'Exhibición exterior', 1),
      est('V2', 'Vereda 2', 'Exhibición exterior', 1),
      est('V3', 'Vereda 3', 'Exhibición exterior', 1),
      est('V4', 'Vereda 4', 'Exhibición exterior', 1),
    ],
  };
}

/** Siguiente id libre para un estante nuevo según el tipo de bloque. */
export function nuevoEstante(t: Tienda, tipo: TipoBloque): Estante {
  const usados = new Set(t.estantes.map((e) => e.id));
  let id = '';
  let titulo = '';
  if (tipo === 'caja') {
    for (let n = 1; ; n++)
      if (!usados.has(String(n))) {
        id = String(n);
        titulo = `Caja ${n}`;
        break;
      }
  } else if (tipo === 'exterior') {
    for (let n = 1; ; n++)
      if (!usados.has(`V${n}`)) {
        id = `V${n}`;
        titulo = `Vereda ${n}`;
        break;
      }
  } else {
    for (let i = 0; ; i++) {
      const letra = i < 26 ? String.fromCharCode(65 + i) : `E${i}`;
      if (!usados.has(letra)) {
        id = letra;
        titulo = `Estante ${letra}`;
        break;
      }
    }
  }
  const [color, fuerte] = PALETA[t.estantes.length % PALETA.length];
  return { id, titulo, tema: '', color, fuerte };
}
