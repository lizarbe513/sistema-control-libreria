import { spritesPetalo } from './sprites';
import { azar, limitar, type Escena, type OpcionesEscena } from './tipos';

interface Petalo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  fase: number; // giro "tipo moneda"
  vfase: number;
  tam: number;
  prof: number; // 0.4 (lejos) … 1 (cerca)
  sprite: number;
  amp: number;
  frec: number;
  fb: number;
  temporal?: boolean;
}

interface Mariposa {
  x: number;
  y: number;
  base: number;
  vx: number;
  vy: number;
  t: number;
  huyendo: boolean;
  ala: string;
  interior: string;
}

interface Anillo {
  x: number;
  y: number;
  t: number;
}

export class EscenaPetalos implements Escena {
  private w: number;
  private h: number;
  private calidad: number;
  private petalos: Petalo[] = [];
  private sprites = spritesPetalo();
  private decorado: HTMLCanvasElement | null = null;
  private anillos: Anillo[] = [];
  private mariposa: Mariposa | null = null;
  private proximaMariposa = 6;

  constructor(o: OpcionesEscena) {
    this.w = o.w;
    this.h = o.h;
    this.calidad = o.calidad;
    this.redimensionar(o.w, o.h);
    for (const p of this.petalos) p.y = azar(-20, this.h);
  }

  private nuevo(p?: Partial<Petalo>): Petalo {
    const prof = azar(0.4, 1);
    return {
      x: azar(-0.3 * this.w, this.w),
      y: azar(-60, -20),
      vx: 20,
      vy: 30,
      rot: azar(0, Math.PI * 2),
      vrot: azar(-1.2, 1.2),
      fase: azar(0, Math.PI * 2),
      vfase: azar(1, 3),
      tam: (12 + prof * 14) * azar(0.85, 1.15),
      prof,
      sprite: Math.floor(Math.random() * this.sprites.length),
      amp: azar(8, 26),
      frec: azar(0.6, 1.6),
      fb: azar(0, 6),
      ...p,
    };
  }

  redimensionar(w: number, h: number) {
    this.w = w;
    this.h = h;
    const objetivo = Math.round(limitar((w * h) / 22000, 25, 80) * this.calidad);
    while (this.petalos.length < objetivo) this.petalos.push(this.nuevo({ y: azar(-20, h) }));
    this.petalos.length = Math.min(this.petalos.length, objetivo + 20);
    this.decorado = this.pintarDecorado(w, h);
  }

  /** Fondo estático: degradado, manchas de luz y ramas de cerezo difuminadas. */
  private pintarDecorado(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#FDF3F6');
    g.addColorStop(1, '#FBE0E8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const mancha = (x: number, y: number, r: number, color: string) => {
      const m = ctx.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, color);
      m.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = m;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    mancha(w * 0.85, h * 0.1, 420, 'rgba(233,227,251,0.7)');
    mancha(w * 0.1, h * 0.95, 380, 'rgba(252,239,199,0.6)');
    mancha(w * 0.5, h * 0.55, 500, 'rgba(255,255,255,0.45)');

    let semilla = 7;
    const rnd = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
    const flor = (x: number, y: number, r: number) => {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(247,161,183,0.55)' : 'rgba(251,207,218,0.6)';
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + rnd();
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(242,178,76,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    };
    const rama = (x: number, y: number, ang: number, largo: number, grosor: number, nivel: number) => {
      const x2 = x + Math.cos(ang) * largo;
      const y2 = y + Math.sin(ang) * largo;
      ctx.strokeStyle = 'rgba(160,100,115,0.28)';
      ctx.lineWidth = grosor;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + x2) / 2 + azarS(12), (y + y2) / 2 + azarS(12), x2, y2);
      ctx.stroke();
      if (nivel <= 0) {
        for (let i = 0; i < 3; i++) flor(x2 + azarS(14), y2 + azarS(14), 7 + rnd() * 6);
        return;
      }
      if (rnd() > 0.4) flor(x2, y2, 6 + rnd() * 5);
      rama(x2, y2, ang - 0.35 - rnd() * 0.4, largo * 0.72, grosor * 0.68, nivel - 1);
      rama(x2, y2, ang + 0.3 + rnd() * 0.4, largo * 0.68, grosor * 0.68, nivel - 1);
    };
    const azarS = (a: number) => (rnd() - 0.5) * 2 * a;
    const escala = Math.min(1, Math.max(w, h) / 1400);
    ctx.save();
    try {
      ctx.filter = 'blur(1.2px)';
    } catch {
      /* sin filtros de canvas */
    }
    rama(-20, h * 0.12, -0.15, 170 * escala, 14 * escala, 4);
    rama(w + 20, h * 0.92, Math.PI + 0.25, 190 * escala, 15 * escala, 4);
    ctx.restore();
    return c;
  }

  puntero(x: number, y: number, vx: number, vy: number) {
    const R = 150;
    const vel = Math.hypot(vx, vy);
    if (vel < 40) return;
    const k = Math.min(vel, 1600) / vel;
    for (const p of this.petalos) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > R) continue;
      const f = (1 - d / R) * 0.035;
      p.vx += vx * k * f;
      p.vy += vy * k * f;
      p.vrot += (Math.random() - 0.5) * f * 20;
    }
  }

  clic(x: number, y: number) {
    // la mariposa se asusta
    const m = this.mariposa;
    if (m && !m.huyendo && Math.hypot(m.x - x, m.y - y) < 60) {
      m.huyendo = true;
      m.vx = 280 * Math.sign(m.x - x || 1);
      m.vy = -240;
    }
    // ráfaga de viento circular
    const R = 280;
    for (const p of this.petalos) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.4);
      const ux = dx / d;
      const uy = dy / d;
      p.vx += ux * 420 * f - uy * 300 * f;
      p.vy += uy * 420 * f + ux * 300 * f;
      p.vrot += azar(-8, 8) * f;
      p.vfase += 6 * f;
    }
    for (let i = 0; i < 6 * this.calidad + 2; i++) {
      const a = azar(0, Math.PI * 2);
      const v = azar(120, 260);
      this.petalos.push(this.nuevo({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, temporal: true, prof: azar(0.7, 1) }));
    }
    this.anillos.push({ x, y, t: 0 });
  }

  cuadro(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    const { w, h } = this;
    if (this.decorado) ctx.drawImage(this.decorado, 0, 0, w, h);

    const vientoX = 22 + 10 * Math.sin(t * 0.13) + 6 * Math.sin(t * 0.37);
    const amort = 1 - Math.exp(-0.9 * dt);

    for (let i = this.petalos.length - 1; i >= 0; i--) {
      const p = this.petalos[i];
      const objX = vientoX * (0.6 + p.prof * 0.8);
      const objY = 22 + p.prof * 30;
      p.vx += (objX - p.vx) * amort;
      p.vy += (objY - p.vy) * amort;
      p.vrot += (Math.sign(p.vrot) * 0.6 - p.vrot) * amort * 0.5;
      p.vfase += (2 - p.vfase) * amort * 0.4;
      p.x += (p.vx + Math.sin(t * p.frec + p.fb) * p.amp) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.fase += p.vfase * dt;

      if (p.x > w + 40 || p.y > h + 40 || p.x < -w * 0.4 - 40 || p.y < -h * 0.6) {
        if (p.temporal) {
          this.petalos.splice(i, 1);
          continue;
        }
        Object.assign(p, this.nuevo(Math.random() < 0.35 ? { x: -30, y: azar(-20, h * 0.6) } : {}));
      }

      const giro = Math.cos(p.fase);
      ctx.save();
      ctx.globalAlpha = 0.45 + p.prof * 0.5;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(Math.abs(giro) < 0.12 ? 0.12 * Math.sign(giro || 1) : giro, 1);
      ctx.drawImage(this.sprites[p.sprite], -p.tam / 2, -p.tam / 2, p.tam, p.tam);
      ctx.restore();
    }

    // anillos de las ráfagas
    for (let i = this.anillos.length - 1; i >= 0; i--) {
      const a = this.anillos[i];
      a.t += dt;
      const k = a.t / 0.9;
      if (k >= 1) {
        this.anillos.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      ctx.strokeStyle = `rgba(242,122,155,${0.35 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 16 + 240 * e, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 10 + 150 * e, e * 4, e * 4 + Math.PI * 1.2);
      ctx.stroke();
    }

    this.actualizarMariposa(ctx, dt);
  }

  private actualizarMariposa(ctx: CanvasRenderingContext2D, dt: number) {
    if (!this.mariposa) {
      this.proximaMariposa -= dt;
      if (this.proximaMariposa <= 0) {
        const colores = [
          ['#C9B6F2', '#F7A1B7'],
          ['#FCE2A6', '#F48FAA'],
          ['#BFE3F5', '#E9E3FB'],
        ][Math.floor(Math.random() * 3)];
        const base = azar(this.h * 0.2, this.h * 0.7);
        this.mariposa = { x: -40, y: base, base, vx: 65, vy: 0, t: 0, huyendo: false, ala: colores[0], interior: colores[1] };
      }
      return;
    }
    const m = this.mariposa;
    m.t += dt;
    if (m.huyendo) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vy += 40 * dt;
    } else {
      m.x += m.vx * dt;
      m.y = m.base + Math.sin(m.t * 1.3) * 40 + Math.sin(m.t * 0.5) * 25;
    }
    if (m.x > this.w + 60 || m.x < -80 || m.y < -80) {
      this.mariposa = null;
      this.proximaMariposa = azar(18, 40);
      return;
    }
    const aleteo = 0.2 + 0.8 * Math.abs(Math.sin(m.t * (m.huyendo ? 26 : 12)));
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.sin(m.t * 2) * 0.15 + (m.huyendo ? -0.5 : 0));
    for (const lado of [-1, 1]) {
      ctx.save();
      ctx.scale(lado * aleteo, 1);
      ctx.fillStyle = m.ala;
      ctx.beginPath();
      ctx.ellipse(8, -7, 11, 8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6, 6, 7, 5.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = m.interior;
      ctx.beginPath();
      ctx.ellipse(9, -7, 5, 3.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#6B4E5E';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
