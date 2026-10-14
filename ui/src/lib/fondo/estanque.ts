import { spritesPetalo } from './sprites';
import { azar, limitar, type Escena, type OpcionesEscena } from './tipos';

interface Nenufar {
  x: number;
  y: number;
  r: number;
  rot: number;
  vrot: number;
  vx: number;
  vy: number;
  meceo: number; // intensidad del balanceo tras una onda
  fase: number;
  tono: number;
  flor: { abierta: number; objetivo: number; color: string } | null;
}

interface Onda {
  x: number;
  y: number;
  t: number;
  fuerza: number;
  tocados: Set<Nenufar>;
}

interface Koi {
  x: number;
  y: number;
  ang: number;
  vel: number;
  t: number;
  susto: number;
  largo: number;
  semilla: number;
  manchas: { x: number; y: number; r: number }[];
}

interface PetaloFlotante {
  x: number;
  y: number;
  rot: number;
  sprite: number;
  t: number;
}

const VIDA_ONDA = 3;
const REF = 64; // radio de referencia de los sprites

export class EscenaEstanque implements Escena {
  private w: number;
  private h: number;
  private calidad: number;
  private nenufares: Nenufar[] = [];
  private ondas: Onda[] = [];
  private kois: Koi[] = [];
  private flotantes: PetaloFlotante[] = [];
  private proximoKoi = 3;
  private agua: HTMLCanvasElement | null = null;
  private luces: { x: number; y: number; r: number; f: number; p: number }[] = [];
  private sprites = spritesPetalo();
  // sprites prerenderizados: evitan crear degradados en cada cuadro
  private hojas: HTMLCanvasElement[] = [];
  private flores = new Map<string, HTMLCanvasElement>();
  private luz: HTMLCanvasElement | null = null;

  constructor(o: OpcionesEscena) {
    this.w = o.w;
    this.h = o.h;
    this.calidad = o.calidad;
    this.hojas = [this.pintarHoja(['#A9DDB4', '#5DB28A']), this.pintarHoja(['#9BD9B0', '#6DBF8F'])];
    this.luz = this.pintarLuz();
    this.redimensionar(o.w, o.h);
  }

  redimensionar(w: number, h: number) {
    const anteriorW = this.w || w;
    const anteriorH = this.h || h;
    this.w = w;
    this.h = h;
    for (const n of this.nenufares) {
      n.x *= w / anteriorW;
      n.y *= h / anteriorH;
    }
    const objetivo = Math.round(limitar((w * h) / 70000, 7, 16));
    let intentos = 0;
    while (this.nenufares.length < objetivo && intentos++ < 400) {
      const r = azar(32, 62);
      const x = azar(r, w - r);
      const y = azar(r, h - r);
      if (this.nenufares.some((n) => Math.hypot(n.x - x, n.y - y) < n.r + r + 30)) continue;
      this.nenufares.push({
        x,
        y,
        r,
        rot: azar(0, Math.PI * 2),
        vrot: azar(-0.03, 0.03),
        vx: azar(-3, 3),
        vy: azar(-2, 2),
        meceo: 0,
        fase: 0,
        tono: azar(0, 1),
        flor: Math.random() < 0.45 ? { abierta: 1, objetivo: 1, color: Math.random() < 0.5 ? '#F7A1B7' : '#FBCFDA' } : null,
      });
    }
    this.luces = Array.from({ length: Math.round(9 * this.calidad) + 3 }, () => ({
      x: azar(0, w),
      y: azar(0, h),
      r: azar(120, 260),
      f: azar(0.05, 0.15),
      p: azar(0, 6),
    }));
    this.agua = this.pintarAgua(w, h);
  }

  private pintarAgua(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, '#CDEFE4');
    g.addColorStop(0.5, '#A9DFD0');
    g.addColorStop(1, '#8CCFBF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // reflejo rosado del cielo
    const r = ctx.createRadialGradient(w * 0.75, h * 0.15, 0, w * 0.75, h * 0.15, w * 0.5);
    r.addColorStop(0, 'rgba(251,211,222,0.45)');
    r.addColorStop(1, 'rgba(251,211,222,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
    return c;
  }

  private lienzo(tam: number) {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    return c;
  }

  private pintarLuz() {
    const c = this.lienzo(128);
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return c;
  }

  /** Nenúfar de radio REF dentro de un lienzo con margen de 4px. */
  private pintarHoja(verde: [string, string]) {
    const c = this.lienzo(REF * 2 + 8);
    const x = c.getContext('2d')!;
    x.translate(REF + 4, REF + 4);
    const g = x.createRadialGradient(-REF * 0.3, -REF * 0.3, 0, 0, 0, REF);
    g.addColorStop(0, verde[0]);
    g.addColorStop(1, verde[1]);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.arc(0, 0, REF, 0.22, Math.PI * 2 - 0.22);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(60,140,100,0.5)';
    x.lineWidth = 1.5;
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.22)';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 1; i < 9; i++) {
      const a = 0.22 + (i * (Math.PI * 2 - 0.44)) / 9;
      x.moveTo(0, 0);
      x.lineTo(Math.cos(a) * REF * 0.85, Math.sin(a) * REF * 0.85);
    }
    x.stroke();
    return c;
  }

  /** Flor con apertura `a` (cuantizada a 12 pasos) y radio REF. */
  private spriteFlor(color: string, paso: number) {
    const clave = `${color}${paso}`;
    let c = this.flores.get(clave);
    if (c) return c;
    const a = paso / 12;
    const r = REF;
    c = this.lienzo(REF * 2 + 8);
    const x = c.getContext('2d')!;
    x.translate(REF + 4, REF + 4);
    const capas: [number, number, number][] = [
      [8, 1, 0],
      [8, 0.75, Math.PI / 8],
      [5, 0.5, 0.2],
    ];
    capas.forEach(([cantidad, tam, giro], ci) => {
      for (let i = 0; i < cantidad; i++) {
        const ang = (i * Math.PI * 2) / cantidad + giro;
        const largo = r * tam * (0.3 + 0.7 * a) * 0.9;
        const dist = largo * (0.25 + 0.35 * a);
        x.save();
        x.rotate(ang);
        const g = x.createLinearGradient(0, 0, dist + largo * 0.6, 0);
        g.addColorStop(0, '#FFF6F8');
        g.addColorStop(1, ci === 2 ? '#FBCFDA' : color);
        x.fillStyle = g;
        x.strokeStyle = 'rgba(214,96,130,0.25)';
        x.lineWidth = 1;
        x.beginPath();
        x.ellipse(dist, 0, largo * 0.55, largo * (0.22 + 0.08 * (1 - a)), 0, 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.restore();
      }
    });
    x.fillStyle = '#F4D03F';
    x.beginPath();
    x.arc(0, 0, r * 0.12 * (0.4 + a * 0.6), 0, Math.PI * 2);
    x.fill();
    this.flores.set(clave, c);
    return c;
  }

  clic(x: number, y: number) {
    for (const n of this.nenufares) {
      if (n.flor && Math.hypot(n.x - x, n.y - y) < n.r * 0.55) {
        n.flor.objetivo = n.flor.objetivo > 0.5 ? 0 : 1;
        n.meceo = Math.min(1.4, n.meceo + 0.5);
        this.onda(x, y, 0.5);
        return;
      }
    }
    for (const k of this.kois) {
      if (Math.hypot(k.x - x, k.y - y) < 150) {
        k.susto = 1;
        k.ang = Math.atan2(k.y - y, k.x - x) + azar(-0.3, 0.3);
      }
    }
    this.onda(x, y, 1);
  }

  private onda(x: number, y: number, fuerza: number) {
    this.ondas.push({ x, y, t: 0, fuerza, tocados: new Set() });
  }

  posarPetalo(x: number, y: number, rot: number, sprite: number) {
    this.flotantes.push({ x, y, rot, sprite, t: 0 });
    if (this.flotantes.length > 25) this.flotantes.shift();
    this.onda(x, y, 0.3);
  }

  cuadro(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    const { w, h } = this;
    if (this.agua) ctx.drawImage(this.agua, 0, 0, w, h);

    // luces cáusticas (sprite escalado, sin degradados por cuadro)
    if (this.luz) {
      for (const l of this.luces) {
        const x = l.x + Math.sin(t * l.f + l.p) * 60;
        const y = l.y + Math.cos(t * l.f * 0.8 + l.p) * 40;
        ctx.drawImage(this.luz, x - l.r, y - l.r, l.r * 2, l.r * 2);
      }
    }

    // reflejos ondulantes
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const y0 = ((i + 0.5) / 7) * h + Math.sin(t * 0.3 + i) * 10;
      const x0 = ((i * 0.37) % 1) * w;
      for (let x = x0 - 120; x < x0 + 120; x += 12) {
        const py = y0 + Math.sin(x / 30 + t * 1.2 + i) * 2.5;
        if (x === x0 - 120) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
    }
    ctx.stroke();

    this.actualizarKois(ctx, dt, t);
    this.actualizarOndas(ctx, dt);

    // pétalos flotando
    for (let i = this.flotantes.length - 1; i >= 0; i--) {
      const p = this.flotantes[i];
      p.t += dt;
      if (p.t > 9) {
        this.flotantes.splice(i, 1);
        continue;
      }
      p.x += 4 * dt;
      p.rot += 0.1 * dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (9 - p.t) / 2) * 0.9;
      ctx.translate(p.x, p.y + Math.sin(p.t * 2) * 1.5);
      ctx.rotate(p.rot);
      ctx.drawImage(this.sprites[p.sprite], -9, -9, 18, 18);
      ctx.restore();
    }

    for (const n of this.nenufares) this.dibujarNenufar(ctx, n, dt, t);
  }

  private actualizarOndas(ctx: CanvasRenderingContext2D, dt: number) {
    for (let i = this.ondas.length - 1; i >= 0; i--) {
      const o = this.ondas[i];
      o.t += dt;
      if (o.t > VIDA_ONDA) {
        this.ondas.splice(i, 1);
        continue;
      }
      const radio = o.t * 130;
      const vida = 1 - o.t / VIDA_ONDA;
      for (const [k, a] of [[1, 0.55], [0.72, 0.35], [0.48, 0.2]] as const) {
        ctx.strokeStyle = `rgba(255,255,255,${a * vida * o.fuerza})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, radio * k, radio * k * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const n of this.nenufares) {
        if (o.tocados.has(n)) continue;
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        if (Math.abs(d - radio) < n.r * 0.6) {
          o.tocados.add(n);
          const f = o.fuerza * vida;
          n.meceo = Math.min(1.5, n.meceo + f);
          n.vx += ((n.x - o.x) / (d || 1)) * 14 * f;
          n.vy += ((n.y - o.y) / (d || 1)) * 14 * f;
          n.vrot += azar(-0.25, 0.25) * f;
        }
      }
    }
  }

  private dibujarNenufar(ctx: CanvasRenderingContext2D, n: Nenufar, dt: number, t: number) {
    // deriva suave, rebote contra los bordes
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.vx += (Math.sin(t * 0.1 + n.tono * 9) * 3 - n.vx) * dt * 0.3;
    n.vy += (Math.cos(t * 0.08 + n.tono * 7) * 2 - n.vy) * dt * 0.3;
    if (n.x < -n.r * 0.5 || n.x > this.w + n.r * 0.5) n.vx = -n.vx;
    if (n.y < -n.r * 0.5 || n.y > this.h + n.r * 0.5) n.vy = -n.vy;
    n.x = limitar(n.x, -n.r, this.w + n.r);
    n.y = limitar(n.y, -n.r, this.h + n.r);
    n.vrot += (0 - n.vrot) * dt * 0.5;
    n.rot += (n.vrot + 0.01) * dt;
    n.meceo *= Math.exp(-1.2 * dt);
    n.fase += dt * 5;
    const escala = 1 + Math.sin(n.fase) * 0.06 * n.meceo;
    const inclinacion = Math.sin(n.fase * 0.7) * 0.12 * n.meceo;

    ctx.save();
    ctx.translate(n.x, n.y);
    // sombra
    ctx.fillStyle = 'rgba(40,110,95,0.16)';
    ctx.beginPath();
    ctx.ellipse(5, 7, n.r * escala, n.r * 0.95 * escala, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(n.rot + inclinacion);
    ctx.scale(escala, escala * 0.96);
    const k = (n.r / REF) * ((REF + 4) / REF);
    const tam = REF * 2 * k + 8 * k;
    ctx.drawImage(this.hojas[n.tono > 0.5 ? 1 : 0], -tam / 2, -tam / 2, tam, tam);
    ctx.restore();

    if (n.flor) this.dibujarFlor(ctx, n, dt, t);
  }

  private dibujarFlor(ctx: CanvasRenderingContext2D, n: Nenufar, dt: number, t: number) {
    const f = n.flor!;
    f.abierta += (f.objetivo - f.abierta) * Math.min(1, dt * 1.4);
    const a = f.abierta;
    const r = n.r * 0.62;
    const paso = Math.round(a * 12);
    const tam = ((REF * 2 + 8) * r) / REF;
    ctx.save();
    ctx.translate(n.x + Math.cos(n.rot + 2) * n.r * 0.15, n.y + Math.sin(n.rot + 2) * n.r * 0.15);
    ctx.rotate(t * 0.05 + n.tono * 6);
    ctx.drawImage(this.spriteFlor(f.color, paso), -tam / 2, -tam / 2, tam, tam);
    ctx.restore();
  }

  private actualizarKois(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    this.proximoKoi -= dt;
    if (this.proximoKoi <= 0 && this.kois.length < 2) {
      this.proximoKoi = azar(14, 28);
      const izquierda = Math.random() < 0.5;
      const semilla = Math.random() * 100;
      this.kois.push({
        x: izquierda ? -80 : this.w + 80,
        y: azar(this.h * 0.2, this.h * 0.8),
        ang: izquierda ? azar(-0.3, 0.3) : Math.PI + azar(-0.3, 0.3),
        vel: 48,
        t: 0,
        susto: 0,
        largo: azar(70, 95),
        semilla,
        manchas: Array.from({ length: 3 }, () => ({ x: azar(-0.35, 0.3), y: azar(-0.12, 0.12), r: azar(0.1, 0.2) })),
      });
    }
    for (let i = this.kois.length - 1; i >= 0; i--) {
      const k = this.kois[i];
      k.t += dt;
      k.susto *= Math.exp(-0.7 * dt);
      k.ang += Math.sin(k.t * 0.6 + k.semilla) * 0.35 * dt;
      const v = k.vel * (1 + k.susto * 3);
      k.x += Math.cos(k.ang) * v * dt;
      k.y += Math.sin(k.ang) * v * dt;
      if (k.t > 4 && (k.x < -160 || k.x > this.w + 160 || k.y < -160 || k.y > this.h + 160)) {
        this.kois.splice(i, 1);
        continue;
      }
      this.dibujarKoi(ctx, k, t);
    }
  }

  private dibujarKoi(ctx: CanvasRenderingContext2D, k: Koi, t: number) {
    const L = k.largo;
    const coleteo = Math.sin(t * (5 + k.susto * 12) + k.semilla) * (0.35 + k.susto * 0.3);
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.ang);
    ctx.globalAlpha = 0.82;
    // sombra
    ctx.fillStyle = 'rgba(30,90,80,0.18)';
    ctx.beginPath();
    ctx.ellipse(-L * 0.1 + 6, 8, L * 0.5, L * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // cola
    ctx.save();
    ctx.translate(-L * 0.52, 0);
    ctx.rotate(coleteo);
    ctx.fillStyle = 'rgba(255,170,120,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.2, -L * 0.2, -L * 0.3, -L * 0.14);
    ctx.quadraticCurveTo(-L * 0.18, 0, -L * 0.3, L * 0.14);
    ctx.quadraticCurveTo(-L * 0.2, L * 0.2, 0, 0);
    ctx.fill();
    ctx.restore();
    // aletas
    ctx.fillStyle = 'rgba(255,240,230,0.85)';
    for (const lado of [-1, 1]) {
      ctx.save();
      ctx.translate(L * 0.1, lado * L * 0.12);
      ctx.rotate(lado * (0.7 + Math.sin(t * 4 + k.semilla) * 0.2));
      ctx.beginPath();
      ctx.ellipse(-L * 0.05, lado * L * 0.05, L * 0.1, L * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // cuerpo
    ctx.beginPath();
    ctx.ellipse(-L * 0.05, 0, L * 0.5, L * 0.16, coleteo * -0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF5EE';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#F4844C';
    for (const m of k.manchas) {
      ctx.beginPath();
      ctx.ellipse(m.x * L, m.y * L, m.r * L, m.r * L * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }
}
