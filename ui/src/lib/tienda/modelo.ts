// La tienda como cuadrícula de bloques (estilo Minecraft). Cada celda mide 0,5 m.
// Ejes: x → este, y → arriba, z → sur (la calle está al sur, desde la fila `fachada`).

export type TipoBloque =
  // construcción
  | 'plataforma'
  | 'pared'
  | 'escalera'
  | 'escaleraPared'
  | 'baranda'
  | 'alfombra'
  // muebles para libros
  | 'estanteria'
  | 'caja'
  | 'mesa'
  | 'puerta'
  // atención
  | 'mostrador'
  | 'registradora'
  | 'banquito'
  // decoración
  | 'gatito'
  | 'flores'
  | 'lampara'
  | 'colgante'
  | 'planta'
  | 'globo'
  | 'reloj'
  | 'guirnalda'
  | 'pizarra'
  | 'cuadro'
  | 'letrero';

export interface Bloque {
  x: number;
  y: number;
  z: number;
  tipo: TipoBloque;
  /** 0 mira al sur, 1 al oeste, 2 al norte, 3 al este (cara con libros / subida de la escalera / frente del adorno). */
  rot: number;
  /** Estante al que pertenece (solo bloques que guardan libros). */
  estante?: string;
}

export interface Estante {
  id: string;
  titulo: string; // «Estante A», «Caja 2», «Puerta 1», «Mesa 1»
  tema: string; // qué libros guarda
  color: string; // pastel
  fuerte: string; // tono intenso para resaltar
  /** Cómo se numeran los tramos y las repisas. Por defecto: tramos de izquierda a derecha, repisas desde arriba. */
  orden?: { tramos: 'izq' | 'der'; repisas: 'arriba' | 'abajo' };
  /** Letra visible (A, B…). El `id` no cambia nunca: los libros lo guardan. */
  letra?: string;
  /** Columnas ("x,z") donde empieza un tramo. Sin definir → división por defecto del tipo. */
  inicioTramo?: string[];
  /** Celdas ("x,y,z") con una tabla de repisa encima. Sin definir → división por defecto del tipo. */
  tablas?: string[];
}

export interface Tienda {
  ancho: number;
  fondo: number;
  alto: number;
  fachada: number; // primera fila z que ya es vereda
  bloques: Bloque[];
  estantes: Estante[];
}

/** Dónde está un libro: estante + tramo (de izquierda a derecha) + repisa (desde arriba). */
export interface UbicacionLibro {
  estante: string;
  tramo: number;
  repisa: number;
}

export type Categoria = 'construccion' | 'libros' | 'atencion' | 'decoracion';

export const CATEGORIAS_BLOQUE: { id: Categoria; nombre: string; emoji: string }[] = [
  { id: 'construccion', nombre: 'Construcción', emoji: '🧱' },
  { id: 'libros', nombre: 'Muebles para libros', emoji: '📚' },
  { id: 'atencion', nombre: 'Atención', emoji: '🛎️' },
  { id: 'decoracion', nombre: 'Decoración', emoji: '🌸' },
];

export interface InfoTipo {
  id: TipoBloque;
  nombre: string;
  emoji: string; // respaldo si no hay ícono renderizado
  color: string; // para el plano SVG
  categoria: Categoria;
  guardaLibros: boolean;
  rota: boolean;
  /** 'pared': se pega a la cara apuntada (mira hacia afuera de ella). */
  montaje: 'piso' | 'pared';
  /** No ocupa el piso para caminar (alfombras, cosas colgadas). */
  pisable?: boolean;
  /** Cómo se nombra la ubicación: [tramo, repisa], o un texto si el mueble no se divide. */
  terminos?: [string, string] | string;
  /** División por defecto: bloques por tramo y por repisa (0 = sin dividir). */
  division?: [number, number];
}

const T = (
  id: TipoBloque,
  nombre: string,
  emoji: string,
  color: string,
  categoria: Categoria,
  extra: Partial<InfoTipo> = {},
): InfoTipo => ({ id, nombre, emoji, color, categoria, guardaLibros: false, rota: false, montaje: 'piso', ...extra });

export const CATALOGO: InfoTipo[] = [
  T('plataforma', 'Plataforma', '🟫', '#E2C49B', 'construccion'),
  T('pared', 'Pared / columna', '⬜', '#C9C2CF', 'construccion'),
  T('escalera', 'Escalera de madera', '🪜', '#C99A6B', 'construccion', { rota: true }),
  T('escaleraPared', 'Escalera de pared', '🧱', '#C9C2CF', 'construccion', { rota: true }),
  T('baranda', 'Baranda', '🚧', '#B98A5E', 'construccion', { rota: true }),
  T('alfombra', 'Alfombra', '🟥', '#F4B6C6', 'construccion', { pisable: true }),
  T('estanteria', 'Estantería', '📚', '#D6976A', 'libros', { guardaLibros: true, rota: true, terminos: ['Tramo', 'Repisa'], division: [2, 1] }),
  T('caja', 'Caja de libros', '📦', '#C79A64', 'libros', { guardaLibros: true, terminos: 'Dentro de la caja', division: [0, 0] }),
  T('mesa', 'Mesita', '🪑', '#E8C9A0', 'libros', { guardaLibros: true, terminos: 'Sobre la mesita', division: [0, 0] }),
  T('puerta', 'Puerta con ligas', '🚪', '#EBC963', 'libros', { guardaLibros: true, rota: true, terminos: ['Columna', 'Liga'], division: [1, 1] }),
  T('mostrador', 'Mostrador', '🧾', '#E0607A', 'atencion', { rota: true }),
  T('registradora', 'Caja registradora', '💰', '#9B87E0', 'atencion', { rota: true }),
  T('banquito', 'Banquito', '🪑', '#D6976A', 'atencion'),
  T('gatito', 'Estatua de gatito', '🐱', '#F7F2EE', 'decoracion', { rota: true }),
  T('flores', 'Flores de pared', '💐', '#F27A9B', 'decoracion', { rota: true, montaje: 'pared', pisable: true }),
  T('lampara', 'Lámpara de pie', '🪔', '#FCEFC7', 'decoracion'),
  T('colgante', 'Lámpara colgante', '💡', '#FCEFC7', 'decoracion', { pisable: true }),
  T('planta', 'Planta', '🪴', '#7CC49A', 'decoracion'),
  T('globo', 'Globo terráqueo', '🌍', '#6FA8DC', 'decoracion', { rota: true }),
  T('reloj', 'Reloj de pared', '🕰️', '#FFF4F7', 'decoracion', { rota: true, montaje: 'pared', pisable: true }),
  T('guirnalda', 'Guirnalda de luces', '✨', '#FFE9A8', 'decoracion', { rota: true, montaje: 'pared', pisable: true }),
  T('pizarra', 'Pizarrita «Recomendado»', '🖍️', '#4A5A52', 'decoracion', { rota: true }),
  T('cuadro', 'Cuadro', '🖼️', '#E9E3FB', 'decoracion', { rota: true, montaje: 'pared', pisable: true }),
  T('letrero', 'Letrero SIGLO XXI', '🪧', '#F27A9B', 'decoracion', { rota: true, montaje: 'pared', pisable: true }),
];

export const infoTipo = (t: TipoBloque) => CATALOGO.find((i) => i.id === t) ?? CATALOGO[0];

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

/** Tipo dominante de un estante (el de su primer bloque). */
export function tipoDeEstante(t: Tienda, estanteId: string): TipoBloque | null {
  return t.bloques.find((b) => b.estante === estanteId)?.tipo ?? null;
}

export interface Tramo {
  columnas: Columna[];
  repisas: Bloque[][]; // de arriba hacia abajo; cada repisa abarca uno o más bloques
}

/** Columnas donde empieza cada tramo (explícitas o por defecto según el tipo). */
export function iniciosDeTramo(e: Estante, cols: Columna[], tipo: TipoBloque | null): Set<string> {
  if (e.inicioTramo) return new Set(e.inicioTramo);
  const [cada] = infoTipo(tipo ?? 'estanteria').division ?? [1, 1];
  const s = new Set<string>();
  cols.forEach((c, i) => {
    if (cada > 0 && i % cada === 0) s.add(`${c.x},${c.z}`);
  });
  return s;
}

/** ¿Hay tabla de repisa encima de esta celda? (explícita o por defecto según el tipo). */
export function tablasDe(e: Estante, t: Tienda, tipo: TipoBloque | null): (x: number, y: number, z: number) => boolean {
  if (e.tablas) {
    const s = new Set(e.tablas);
    return (x, y, z) => s.has(`${x},${y},${z}`);
  }
  const [, cada] = infoTipo(tipo ?? 'estanteria').division ?? [1, 1];
  if (cada <= 0) return () => false;
  // por defecto: una tabla cada `cada` bloques, contando desde la base del estante
  const base = Math.min(...t.bloques.filter((b) => b.estante === e.id).map((b) => b.y));
  return (_x, y) => (y - base + 1) % cada === 0;
}

/** Tramos de un estante con sus repisas (compartimentos), de izquierda a derecha y de arriba abajo. */
export function compartimentos(t: Tienda, estanteId: string): Tramo[] {
  const e = t.estantes.find((x) => x.id === estanteId);
  const cols = columnas(t, estanteId);
  if (!e || !cols.length) return [];
  const tipo = tipoDeEstante(t, estanteId);
  const [cadaT] = infoTipo(tipo ?? 'estanteria').division ?? [1, 1];
  // muebles sin división (cajas, mesas): un solo compartimento
  if (cadaT === 0 && !e.inicioTramo) return [{ columnas: cols, repisas: [cols.flatMap((c) => c.bloques)] }];

  const inicios = iniciosDeTramo(e, cols, tipo);
  const hayTabla = tablasDe(e, t, tipo);
  const tramos: Tramo[] = [];
  for (const [i, c] of cols.entries()) {
    if (i === 0 || inicios.has(`${c.x},${c.z}`)) tramos.push({ columnas: [], repisas: [] });
    tramos[tramos.length - 1].columnas.push(c);
  }
  for (const tr of tramos) {
    const ys = [...new Set(tr.columnas.flatMap((c) => c.bloques.map((b) => b.y)))].sort((a, b) => b - a);
    let actual: number[] = [];
    const grupos: number[][] = [];
    ys.forEach((y, i) => {
      const corte = i > 0 && (ys[i - 1] !== y + 1 || tr.columnas.some((c) => hayTabla(c.x, y, c.z)));
      if (corte) {
        grupos.push(actual);
        actual = [];
      }
      actual.push(y);
    });
    if (actual.length) grupos.push(actual);
    tr.repisas = grupos.map((g) => tr.columnas.flatMap((c) => c.bloques.filter((b) => g.includes(b.y))));
    if (e.orden?.repisas === 'abajo') tr.repisas.reverse();
  }
  if (e.orden?.tramos === 'der') tramos.reverse();
  return tramos;
}

export interface UbicacionResuelta extends UbicacionLibro {
  tramos: number;
  repisas: number; // repisas del tramo
  bloques: Bloque[]; // todo el compartimento
  bloque: Bloque; // representativo (abajo y adelante): para el camino y la cámara
  info: Estante;
  tipo: TipoBloque;
}

/** Bloque representativo de un compartimento: el más bajo y centrado. */
function representante(bs: Bloque[]): Bloque {
  const minY = Math.min(...bs.map((b) => b.y));
  const abajo = bs.filter((b) => b.y === minY);
  return abajo[Math.floor((abajo.length - 1) / 2)];
}

export function resolver(t: Tienda, u: UbicacionLibro): UbicacionResuelta | null {
  const info = t.estantes.find((e) => e.id === u.estante);
  if (!info) return null;
  const tramos = compartimentos(t, u.estante);
  const tr = tramos.length === 1 && tramos[0].repisas.length === 1 ? tramos[0] : tramos[u.tramo - 1];
  if (!tr) return null;
  const repisa = tr.repisas.length === 1 ? 1 : u.repisa;
  const bloques = tr.repisas[repisa - 1];
  if (!bloques?.length) return null;
  return { ...u, repisa, tramos: tramos.length, repisas: tr.repisas.length, bloques, bloque: representante(bloques), info, tipo: bloques[0].tipo };
}

/** Ubicación del compartimento que contiene un bloque (para el editor al pasar el mouse). */
export function ubicacionDe(t: Tienda, b: Bloque): UbicacionResuelta | null {
  if (!b.estante) return null;
  const tramos = compartimentos(t, b.estante);
  for (const [ti, tr] of tramos.entries())
    for (const [ri, rep] of tr.repisas.entries())
      if (rep.some((o) => o.x === b.x && o.y === b.y && o.z === b.z)) return resolver(t, { estante: b.estante, tramo: ti + 1, repisa: ri + 1 });
  return null;
}

/** Texto de la ubicación dentro del estante: «Tramo 2 · Repisa 3» o «Dentro de la caja». */
export function textoPosicion(u: UbicacionResuelta) {
  const term = infoTipo(u.tipo).terminos;
  if (typeof term === 'string' || !term) return term ?? '';
  return `${term[0]} ${u.tramo} · ${term[1]} ${u.repisa}`;
}

/** Letra visible de un estante. */
export const letraDe = (e: Estante) => e.letra ?? e.id;

/** Texto corto de ubicación: «A · 3 · 2» o «Caja 2». */
export function textoCorto(u: UbicacionResuelta) {
  if (typeof infoTipo(u.tipo).terminos !== 'object') return u.info.titulo;
  return `${letraDe(u.info)} · ${u.tramo} · ${u.repisa}`;
}

/** Divisiones explícitas de un estante (convierte la división por defecto en listas editables). */
export function materializar(t: Tienda, e: Estante): { inicioTramo: string[]; tablas: string[] } {
  const tipo = tipoDeEstante(t, e.id);
  const inicioTramo = [...iniciosDeTramo(e, columnas(t, e.id), tipo)];
  const hay = tablasDe(e, t, tipo);
  const tablas = t.bloques.filter((b) => b.estante === e.id && hay(b.x, b.y, b.z)).map((b) => clave(b.x, b.y, b.z));
  return { inicioTramo, tablas };
}

/** Camino a pie (celdas x,z) desde la vereda hasta el frente de la columna del bloque. BFS en el piso. */
export function ruta(t: Tienda, destino: Bloque): [number, number][] {
  const ocupado = new Set<string>();
  for (const b of t.bloques) if (b.y === 0 && !infoTipo(b.tipo).pisable) ocupado.add(`${b.x},${b.z}`);
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

  const ALTO = 5; // repisas de los estantes de pared (unos 2,5 m)
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

  // las 4 hojas de puerta, abiertas hacia la vereda, con ligas para libros
  caja(0, 0, 16, 19, 'puerta', 0, 3, 3, 'P1');
  caja(10, 10, 16, 19, 'puerta', 0, 3, 1, 'P2');
  caja(11, 11, 16, 19, 'puerta', 0, 3, 3, 'P3');
  caja(23, 23, 16, 19, 'puerta', 0, 3, 1, 'P4');

  // mesitas con libros apilados frente a los estantes del fondo
  caja(9, 10, 3, 4, 'mesa', 0, 0, 0, 'M1');
  caja(14, 15, 3, 4, 'mesa', 0, 0, 0, 'M2');

  // macetas a la entrada
  poner(6, 0, 16, 'planta');
  poner(17, 0, 16, 'planta');

  // atención y adornos
  poner(2, 1, 10, 'registradora', 0);
  poner(3, 0, 12, 'banquito');
  poner(15, 0, 10, 'gatito', 0);
  poner(1, 0, 9, 'lampara');
  poner(22, 0, 15, 'lampara');
  poner(12, 5, 0, 'letrero', 0);
  poner(6, 5, 0, 'flores', 0);
  poner(17, 5, 0, 'flores', 0);
  poner(20, 5, 0, 'reloj', 0);
  poner(12, 1, 15, 'pizarra', 0);

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
      est('P1', 'Puerta 1', 'Más pedidos', 1),
      est('P2', 'Puerta 2', 'Llamativos', 2),
      est('P3', 'Puerta 3', 'Llamativos', 2),
      est('P4', 'Puerta 4', 'Más pedidos', 1),
      est('M1', 'Mesa 1', 'Novedades', 6),
      est('M2', 'Mesa 2', 'Recomendados', 7),
    ],
  };
}

/** Siguiente id libre para un estante nuevo según el tipo de bloque. */
export function nuevoEstante(t: Tienda, tipo: TipoBloque): Estante {
  const usados = new Set(t.estantes.map((e) => e.id));
  const numerado = (prefijo: string, nombre: string) => {
    for (let n = 1; ; n++) if (!usados.has(`${prefijo}${n}`)) return { id: `${prefijo}${n}`, titulo: `${nombre} ${n}` };
  };
  let r: { id: string; titulo: string };
  if (tipo === 'caja') r = numerado('', 'Caja');
  else if (tipo === 'puerta') r = numerado('P', 'Puerta');
  else if (tipo === 'mesa') r = numerado('M', 'Mesa');
  else r = { id: siguienteLetra(t), titulo: '' };
  if (!r.titulo) r.titulo = `Estante ${r.id}`;
  const [color, fuerte] = PALETA[t.estantes.length % PALETA.length];
  return { ...r, tema: '', color, fuerte };
}

/** Primera letra libre (A, B, … Z, luego AA, AB…). */
export function siguienteLetra(t: Tienda): string {
  const usados = new Set(t.estantes.flatMap((e) => [e.id, letraDe(e)]));
  for (let i = 0; ; i++) {
    const letra = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
    if (!usados.has(letra)) return letra;
  }
}
