// Física para caminar sobre la maqueta (estilo Minecraft). Unidad: 1 bloque = 0,5 m.
// La bibliotecaria mide 3 bloques (≈ 1,5 m), salta algo más de 1 bloque y sube sola los escalones de ≤ ½ bloque.
import { clave, indice, infoTipo, type Bloque, type Tienda, type TipoBloque } from './modelo';

export const ALTO_AVATAR = 3;
export const RADIO_AVATAR = 0.3;
export const OJOS = 2.6; // altura de los ojos (primera persona)
const GRAVEDAD = 26;
const SALTO = Math.sqrt(2 * GRAVEDAD * 1.25); // 1,25 bloques: sube a una plataforma de 1
const PASO = 0.52; // escalón que sube sola
const ROTACION_Y = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/** Altura sólida y radio (de la huella central) de los objetos que no llenan la celda. */
const PERFIL: Partial<Record<TipoBloque, { alto: number; radio: number }>> = {
  mostrador: { alto: 0.9, radio: 0.5 },
  caja: { alto: 0.6, radio: 0.47 },
  mesa: { alto: 0.6, radio: 0.5 },
  banquito: { alto: 0.5, radio: 0.25 },
  registradora: { alto: 0.3, radio: 0.3 },
  planta: { alto: 0.9, radio: 0.3 },
  lampara: { alto: 1, radio: 0.15 },
  gatito: { alto: 0.8, radio: 0.3 },
  globo: { alto: 0.6, radio: 0.22 },
  pizarra: { alto: 1, radio: 0.34 },
};
/** Los que no se pisan ni estorban (alfombras, adornos colgados). */
const NO_SOLIDO = new Set<TipoBloque>(['alfombra', 'flores', 'reloj', 'guirnalda', 'cuadro', 'letrero', 'colgante']);

/** Altura de la superficie sólida del bloque en un punto (coordenadas locales, +z = frente). 0 = vacío. */
function alturaLocal(b: Bloque, lx: number, lz: number): number {
  if (NO_SOLIDO.has(b.tipo)) return 0;
  if (b.tipo === 'escalera' || b.tipo === 'escaleraPared') return lz > 0 ? 0.5 : 1; // peldaño bajo al frente
  if (b.tipo === 'baranda') return lz > 0.3 ? 1 : 0;
  const p = PERFIL[b.tipo];
  if (p) return Math.abs(lx) <= p.radio && Math.abs(lz) <= p.radio ? p.alto : 0;
  return 1;
}

export interface Entrada {
  /** Dirección deseada en el mundo (x, z), ya relativa a la cámara; (0, 0) = quieta. */
  dir: [number, number];
  lento: boolean;
  salto: boolean;
}

export class Caminante {
  x: number;
  y = 0;
  z: number;
  vy = 0;
  suelo = true;
  /** Velocidad horizontal actual (bloques/s), para animar el paso. */
  rapidez = 0;
  /** Hacia dónde mira el cuerpo (radianes, 0 = +z). */
  giro = Math.PI;

  private idx = new Map<string, Bloque>();
  private ancho = 0;
  private fondo = 0;

  constructor(
    t: Tienda,
    x: number,
    z: number,
  ) {
    this.x = x;
    this.z = z;
    this.actualizar(t);
  }

  /** Reconstruye el mapa de colisión (si la tienda cambió). */
  actualizar(t: Tienda) {
    this.idx = indice(t.bloques);
    this.ancho = t.ancho;
    this.fondo = t.fondo;
  }

  private altura(b: Bloque, wx: number, wz: number) {
    const dx = wx - (b.x + 0.5);
    const dz = wz - (b.z + 0.5);
    const th = ROTACION_Y[b.rot] ?? 0;
    // mundo → local (giro inverso)
    const lx = dx * Math.cos(th) - dz * Math.sin(th);
    const lz = dx * Math.sin(th) + dz * Math.cos(th);
    return alturaLocal(b, lx, lz);
  }

  /** ¿Choca la caja del avatar, con los pies en (x, y, z)? */
  choca(x: number, y: number, z: number): boolean {
    const r = RADIO_AVATAR;
    if (x < r || z < r || x > this.ancho - r || z > this.fondo - r || y < -0.001) return true;
    const cy0 = Math.floor(y + 1e-6);
    const cy1 = Math.floor(y + ALTO_AVATAR - 1e-6);
    for (const sx of [x - r, x, x + r])
      for (const sz of [z - r, z, z + r]) {
        const cx = Math.floor(sx);
        const cz = Math.floor(sz);
        for (let cy = cy0; cy <= cy1; cy++) {
          const b = this.idx.get(clave(cx, cy, cz));
          if (!b) continue;
          const h = this.altura(b, sx, sz);
          if (h > 0 && y < cy + h - 1e-4 && y + ALTO_AVATAR > cy + 1e-4) return true;
        }
      }
    return false;
  }

  /** Al subir un escalón: la altura más baja (≥ y) donde cabe, buscando hacia abajo desde y + PASO. */
  private elevar(x: number, y: number, z: number): number | null {
    const tope = y + PASO;
    if (this.choca(x, tope, z)) return null;
    let yy = tope;
    while (yy > y + 1e-6 && !this.choca(x, yy - 0.04, z)) yy -= 0.04;
    return Math.max(y, yy);
  }

  /** Aterriza: la altura de la superficie más alta bajo los pies entre y_nuevo y y_viejo. */
  private aterrizar(x: number, yNuevo: number, yViejo: number, z: number): number {
    let yy = yViejo;
    while (yy > yNuevo && !this.choca(x, yy - 0.02, z)) yy -= 0.02;
    return Math.max(yNuevo, yy);
  }

  paso(dt: number, e: Entrada) {
    dt = Math.min(dt, 0.05); // el llamador ya la divide en subpasos
    const vel = e.lento ? 1.9 : 4.4;
    const [dx, dz] = e.dir;
    const mag = Math.hypot(dx, dz);
    const aire = this.suelo ? 1 : 0.7; // menos control en el aire
    let vx = 0;
    let vz = 0;
    if (mag > 0.01) {
      vx = (dx / mag) * vel * aire;
      vz = (dz / mag) * vel * aire;
      // el cuerpo gira suave hacia donde camina
      const meta = Math.atan2(vx, vz);
      let d = meta - this.giro;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.giro += d * Math.min(1, dt * 14);
    }
    this.rapidez += ((mag > 0.01 ? vel : 0) - this.rapidez) * Math.min(1, dt * 12);

    // horizontal, por ejes separados (se desliza por las paredes)
    for (const eje of ['x', 'z'] as const) {
      const nx = eje === 'x' ? this.x + vx * dt : this.x;
      const nz = eje === 'z' ? this.z + vz * dt : this.z;
      if (!this.choca(nx, this.y, nz)) {
        this.x = nx;
        this.z = nz;
      } else if (this.suelo) {
        const ny = this.elevar(nx, this.y, nz);
        if (ny !== null) {
          this.x = nx;
          this.z = nz;
          this.y = ny;
        }
      }
    }

    // vertical
    if (this.suelo && e.salto) {
      this.vy = SALTO;
      this.suelo = false;
    }
    this.vy -= GRAVEDAD * dt;
    const ny = this.y + this.vy * dt;
    if (!this.choca(this.x, ny, this.z)) {
      this.y = ny;
      this.suelo = false;
    } else if (this.vy < 0) {
      this.y = this.aterrizar(this.x, ny, this.y, this.z);
      this.vy = 0;
    } else {
      this.vy = 0; // se golpea la cabeza
    }
    this.suelo = this.vy <= 0 && this.choca(this.x, this.y - 0.03, this.z);
    if (this.suelo) this.vy = 0;
  }
}

/** Texto de lo que hay cerca (para el aviso «Estante A · …»): el bloque con estante más próximo. */
export function estanteCercano(t: Tienda, c: Caminante, alcance = 1.9): string | null {
  let mejor: string | null = null;
  let dmin = alcance;
  for (const b of t.bloques) {
    if (!b.estante || b.y > c.y + ALTO_AVATAR || b.y + 1 < c.y) continue;
    const d = Math.hypot(b.x + 0.5 - c.x, b.z + 0.5 - c.z);
    if (d < dmin) {
      dmin = d;
      mejor = b.estante;
    }
  }
  return mejor;
}

export const colisionable = (t: TipoBloque) => !NO_SOLIDO.has(t) && !!infoTipo(t);
