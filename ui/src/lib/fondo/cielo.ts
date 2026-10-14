import { spriteBrillo } from './sprites';
import { azar, type Escena, type OpcionesEscena } from './tipos';

interface Estrella {
  x: number;
  y: number;
  r: number;
  base: number;
  amp: number;
  f: number;
  p: number;
  capa: number;
}

interface Fugaz {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  vida: number;
}

interface Constelacion {
  estrellas: Estrella[];
  fin: number | null; // momento en que se soltó el arrastre
}

const PARALAJE = [6, 14, 28];

export class EscenaCielo implements Escena {
  private w: number;
  private h: number;
  private calidad: number;
  private estrellas: Estrella[] = [];
  private fugaces: Fugaz[] = [];
  private constelaciones: Constelacion[] = [];
  private actual: Constelacion | null = null;
  private cursor = { x: 0, y: 0 };
  private mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  private fondo: HTMLCanvasElement | null = null;
  private nebulosa: HTMLCanvasElement | null = null;
  private luna: HTMLCanvasElement | null = null;
  private brillo = spriteBrillo();
  private proximaFugaz = 8;
  private t = 0;

  constructor(o: OpcionesEscena) {
    this.w = o.w;
    this.h = o.h;
    this.calidad = o.calidad;
    this.redimensionar(o.w, o.h);
  }

  redimensionar(w: number, h: number) {
    this.w = w;
    this.h = h;
    const area = w * h;
    this.estrellas = [];
    [area / 5500, area / 12000, area / 32000].forEach((n, capa) => {
      for (let i = 0; i < Math.round(n * this.calidad); i++) {
        this.estrellas.push({
          x: azar(-40, w + 40),
          y: azar(-40, h + 40),
          r: [0.6, 1, 1.6][capa] * azar(0.7, 1.3),
          base: azar(0.35, 0.8),
          amp: azar(0.1, 0.4),
          f: azar(0.5, 2.2),
          p: azar(0, 6),
          capa,
        });
      }
    });
    this.fondo = this.pintarFondo(w, h);
    this.nebulosa = this.pintarNebulosa(w, h);
    this.luna = this.pintarLuna();
  }

  private pintarFondo(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#120E2E');
    g.addColorStop(0.55, '#2A1F55');
    g.addColorStop(1, '#5B3A6E');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return c;
  }

  private pintarNebulosa(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w + 120;
    c.height = h + 120;
    const ctx = c.getContext('2d')!;
    const manchas: [number, number, number, string][] = [
      [0.25, 0.35, 0.45, 'rgba(242,122,155,0.13)'],
      [0.7, 0.55, 0.5, 'rgba(155,135,224,0.16)'],
      [0.45, 0.8, 0.4, 'rgba(255,157,187,0.12)'],
      [0.85, 0.2, 0.3, 'rgba(111,168,220,0.10)'],
    ];
    for (const [fx, fy, fr, color] of manchas) {
      const x = fx * c.width;
      const y = fy * c.height;
      const r = fr * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  private pintarLuna() {
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    const ctx = c.getContext('2d')!;
    const halo = ctx.createRadialGradient(160, 160, 30, 160, 160, 160);
    halo.addColorStop(0, 'rgba(255,236,245,0.35)');
    halo.addColorStop(1, 'rgba(255,236,245,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 320, 320);
    const luna = document.createElement('canvas');
    luna.width = luna.height = 320;
    const l = luna.getContext('2d')!;
    const g = l.createRadialGradient(150, 150, 5, 160, 160, 44);
    g.addColorStop(0, '#FFFBF2');
    g.addColorStop(1, '#FFE9D6');
    l.fillStyle = g;
    l.beginPath();
    l.arc(160, 160, 42, 0, Math.PI * 2);
    l.fill();
    l.globalCompositeOperation = 'destination-out';
    l.beginPath();
    l.arc(180, 146, 38, 0, Math.PI * 2);
    l.fill();
    ctx.drawImage(luna, 0, 0);
    return c;
  }

  private posicion(e: Estrella) {
    const k = PARALAJE[e.capa];
    return { x: e.x - this.mouse.sx * k, y: e.y - this.mouse.sy * k };
  }

  puntero(x: number, y: number) {
    this.mouse.x = (x / this.w - 0.5) * 2;
    this.mouse.y = (y / this.h - 0.5) * 2;
    this.cursor = { x, y };
  }

  clic(x: number, y: number) {
    this.lanzarFugaz(x, y);
  }

  private lanzarFugaz(x: number, y: number) {
    const ang = Math.PI * 0.8 + azar(-0.18, 0.18);
    const v = azar(560, 720);
    this.fugaces.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, t: 0, vida: azar(0.9, 1.3) });
  }

  arrastre(x: number, y: number) {
    this.cursor = { x, y };
    if (!this.actual) {
      this.actual = { estrellas: [], fin: null };
      this.constelaciones.push(this.actual);
      if (this.constelaciones.length > 5) this.constelaciones.shift();
    }
    let mejor: Estrella | null = null;
    let dist = 55;
    for (const e of this.estrellas) {
      if (e.capa === 0) continue;
      const p = this.posicion(e);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dist) {
        dist = d;
        mejor = e;
      }
    }
    const lista = this.actual.estrellas;
    if (mejor && lista[lista.length - 1] !== mejor) lista.push(mejor);
  }

  finArrastre() {
    if (this.actual) {
      this.actual.fin = this.t;
      if (this.actual.estrellas.length < 2) this.constelaciones.pop();
    }
    this.actual = null;
  }

  cuadro(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    this.t = t;
    const { w, h } = this;
    this.mouse.sx += (this.mouse.x - this.mouse.sx) * Math.min(1, dt * 2);
    this.mouse.sy += (this.mouse.y - this.mouse.sy) * Math.min(1, dt * 2);

    if (this.fondo) ctx.drawImage(this.fondo, 0, 0, w, h);
    if (this.nebulosa) {
      ctx.drawImage(this.nebulosa, -60 - this.mouse.sx * 4 + Math.sin(t * 0.03) * 20, -60 - this.mouse.sy * 4);
    }
    if (this.luna) {
      ctx.drawImage(this.luna, w * 0.82 - 160 - this.mouse.sx * 10, h * 0.18 - 160 - this.mouse.sy * 10);
    }

    // estrellas
    for (const e of this.estrellas) {
      const p = this.posicion(e);
      const a = Math.max(0, Math.min(1, e.base + Math.sin(t * e.f + e.p) * e.amp));
      if (e.capa === 2) {
        const s = 10 + e.r * 9 * a;
        ctx.globalAlpha = a;
        ctx.drawImage(this.brillo, p.x - s / 2, p.y - s / 2, s, s);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = e.capa === 0 ? '#D9D2FF' : '#FFF4FA';
        ctx.fillRect(p.x - e.r / 2, p.y - e.r / 2, e.r, e.r);
      }
    }
    ctx.globalAlpha = 1;

    this.dibujarConstelaciones(ctx, t);
    this.actualizarFugaces(ctx, dt);

    this.proximaFugaz -= dt;
    if (this.proximaFugaz <= 0) {
      this.proximaFugaz = azar(10, 22);
      this.lanzarFugaz(azar(w * 0.3, w * 1.05), azar(-20, h * 0.35));
    }
  }

  private dibujarConstelaciones(ctx: CanvasRenderingContext2D, t: number) {
    for (let i = this.constelaciones.length - 1; i >= 0; i--) {
      const c = this.constelaciones[i];
      let alfa = 1;
      if (c.fin !== null) {
        const pasado = t - c.fin;
        if (pasado > 6) {
          this.constelaciones.splice(i, 1);
          continue;
        }
        alfa = pasado < 4 ? 1 : 1 - (pasado - 4) / 2;
      }
      const pts = c.estrellas.map((e) => this.posicion(e));
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(255,214,235,${0.75 * alfa})`;
      ctx.shadowColor = 'rgba(255,157,187,0.9)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // línea tenue hasta el cursor mientras se dibuja
      if (c === this.actual && pts.length) {
        const ult = pts[pts.length - 1];
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255,214,235,0.35)';
        ctx.beginPath();
        ctx.moveTo(ult.x, ult.y);
        ctx.lineTo(this.cursor.x, this.cursor.y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = alfa;
      for (const p of pts) {
        const s = 26 + Math.sin(t * 3 + p.x) * 4;
        ctx.drawImage(this.brillo, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  private actualizarFugaces(ctx: CanvasRenderingContext2D, dt: number) {
    for (let i = this.fugaces.length - 1; i >= 0; i--) {
      const f = this.fugaces[i];
      f.t += dt;
      if (f.t > f.vida) {
        this.fugaces.splice(i, 1);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const k = f.t / f.vida;
      const alfa = k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.6) / 0.4);
      const largo = 0.2;
      const cola = ctx.createLinearGradient(f.x, f.y, f.x - f.vx * largo, f.y - f.vy * largo);
      cola.addColorStop(0, `rgba(255,255,255,${alfa})`);
      cola.addColorStop(1, 'rgba(255,190,220,0)');
      ctx.strokeStyle = cola;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - f.vx * largo, f.y - f.vy * largo);
      ctx.stroke();
      ctx.globalAlpha = alfa;
      ctx.drawImage(this.brillo, f.x - 14, f.y - 14, 28, 28);
      ctx.globalAlpha = 1;
    }
  }
}
