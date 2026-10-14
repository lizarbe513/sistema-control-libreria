// Motor de fondos: un solo bucle de animación para la escena de fondo y los pétalos de la radio.
import { app, fondoEfectivo, type FondoId } from '../estado.svelte';
import { musica } from '../musica';
import { EscenaCielo } from './cielo';
import { EscenaEstanque } from './estanque';
import { EscenaPetalos } from './petalos';
import { spriteChispa, spritesPetalo } from './sprites';
import { azar, type Escena, type OpcionesEscena } from './tipos';

/** El componente de la radio registra aquí su elemento, para que los pétalos salgan de él. */
export const anclaRadio: { el: HTMLElement | null } = { el: null };

const ESCENAS: Record<FondoId, new (o: OpcionesEscena) => Escena> = {
  petalos: EscenaPetalos,
  estanque: EscenaEstanque,
  cielo: EscenaCielo,
};

interface ParticulaRadio {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  fase: number;
  tam: number;
  sprite: number;
  t: number;
  vida: number;
  posar: number; // momento en que cae al agua (estanque)
}

const MAX_PARTICULAS = 30;

export class Motor {
  private cf: CanvasRenderingContext2D;
  private cc: CanvasRenderingContext2D;
  private escena: Escena | null = null;
  private escenaId: FondoId | 'quieto' | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 0;
  private ultimo = 0;
  private acumulado = 0;
  private raf = 0;
  private corriendo = false;
  private particulas: ParticulaRadio[] = [];
  private pendientes = 0;
  private overlaySucio = false;
  private presion: { x: number; y: number; movido: boolean } | null = null;
  private previo = { x: 0, y: 0, t: 0 };
  private rendimiento = false;

  constructor(
    private fondo: HTMLCanvasElement,
    private capa: HTMLCanvasElement,
  ) {
    this.cf = fondo.getContext('2d')!;
    this.cc = capa.getContext('2d')!;
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  /** Ajusta tamaño, calidad y escena según el estado global. */
  sincronizar() {
    const rendimiento = app.calma.rendimiento;
    const cambioCalidad = rendimiento !== this.rendimiento;
    this.rendimiento = rendimiento;
    this.redimensionar(cambioCalidad);
    const id = app.enfoque ? 'quieto' : fondoEfectivo(); // en modo enfoque, todo el rendimiento al 3D
    if (id !== this.escenaId || cambioCalidad) {
      this.escena?.destruir?.();
      this.escenaId = id;
      this.escena = id === 'quieto' ? null : new ESCENAS[id]({ w: this.w, h: this.h, calidad: rendimiento ? 0.5 : 1 });
      this.fondo.style.opacity = id === 'quieto' ? '0' : '1';
      if (id === 'quieto') this.cf.clearRect(0, 0, this.w, this.h);
    }
    this.iniciar();
  }

  redimensionar(forzar = false) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.rendimiento ? 1 : 1.5);
    if (!forzar && w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    for (const [c, ctx] of [
      [this.fondo, this.cf],
      [this.capa, this.cc],
    ] as const) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.escena?.redimensionar(w, h);
  }

  private iniciar() {
    if (this.corriendo || document.hidden) return;
    this.corriendo = true;
    this.ultimo = performance.now();
    this.raf = requestAnimationFrame(this.bucle);
  }

  private detener() {
    this.corriendo = false;
    cancelAnimationFrame(this.raf);
  }

  private alCambiarVisibilidad = () => {
    if (document.hidden) this.detener();
    else this.iniciar();
  };

  private bucle = (ahora: number) => {
    if (!this.corriendo) return;
    this.raf = requestAnimationFrame(this.bucle);
    let dt = (ahora - this.ultimo) / 1000;
    if (this.rendimiento) {
      this.acumulado += dt;
      this.ultimo = ahora;
      if (this.acumulado < 1 / 30) return;
      dt = this.acumulado;
      this.acumulado = 0;
    } else this.ultimo = ahora;
    dt = Math.min(dt, 0.05);
    this.t += dt;

    if (this.escena) this.escena.cuadro(this.cf, dt, this.t);
    this.actualizarRadio(dt);

    // en "fondo quieto" sin música no hay nada que animar: el bucle duerme
    if (!this.escena && !this.particulas.length && !this.emitiendo()) {
      this.detener();
    }
  };

  private emitiendo() {
    return app.radio.sonando && app.calma.petalosRadio && !!anclaRadio.el;
  }

  /** Llamar cuando la radio empiece a sonar (despierta el bucle si dormía). */
  despertar() {
    this.iniciar();
  }

  private actualizarRadio(dt: number) {
    const ctx = this.cc;
    if (this.emitiendo()) {
      const nivel = musica.nivel();
      this.pendientes += (0.9 + nivel * 7) * dt;
      while (this.pendientes >= 1) {
        this.pendientes -= 1;
        if (this.particulas.length < MAX_PARTICULAS) this.emitir();
      }
    }
    if (!this.particulas.length) {
      if (this.overlaySucio) {
        ctx.clearRect(0, 0, this.w, this.h);
        this.overlaySucio = false;
      }
      return;
    }
    ctx.clearRect(0, 0, this.w, this.h);
    this.overlaySucio = true;
    const modo = this.escenaId === 'cielo' ? 'chispa' : 'petalo';
    const sprites = spritesPetalo();
    const chispa = spriteChispa();
    for (let i = this.particulas.length - 1; i >= 0; i--) {
      const p = this.particulas[i];
      p.t += dt;
      p.vx += (55 - p.vx) * dt * 0.6;
      p.vy += (modo === 'chispa' ? 6 : 26) * dt;
      p.x += (p.vx + Math.sin(p.t * 2 + p.fase) * 18) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const fuera = p.x > this.w + 30 || p.y > this.h + 30;
      if (this.escenaId === 'estanque' && p.t >= p.posar) {
        this.escena?.posarPetalo?.(p.x, p.y, p.rot, p.sprite);
        this.particulas.splice(i, 1);
        continue;
      }
      if (fuera || p.t > p.vida) {
        this.particulas.splice(i, 1);
        continue;
      }
      const desvanecer = Math.min(1, (p.vida - p.t) / 1.2, p.t / 0.3);
      ctx.save();
      ctx.globalAlpha = 0.85 * desvanecer;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (modo === 'chispa') {
        const s = p.tam * (0.8 + Math.sin(p.t * 8 + p.fase) * 0.25);
        ctx.drawImage(chispa, -s / 2, -s / 2, s, s);
      } else {
        ctx.scale(Math.cos(p.t * 2.4 + p.fase), 1);
        ctx.drawImage(sprites[p.sprite], -p.tam / 2, -p.tam / 2, p.tam, p.tam);
      }
      ctx.restore();
    }
  }

  private emitir() {
    const r = anclaRadio.el!.getBoundingClientRect();
    if (!r.width) return;
    this.particulas.push({
      x: r.right - azar(10, 30),
      y: r.top + r.height * azar(0.25, 0.7),
      vx: azar(50, 95),
      vy: azar(-25, 10),
      rot: azar(0, 6),
      vrot: azar(-2, 2),
      fase: azar(0, 6),
      tam: azar(13, 20),
      sprite: Math.floor(Math.random() * 5),
      t: 0,
      vida: azar(7, 12),
      posar: azar(2.5, 6),
    });
  }

  // ---------- interacción (la App decide qué eventos llegan aquí) ----------
  punteroMovido(x: number, y: number) {
    const ahora = performance.now();
    const dt = Math.max(1, ahora - this.previo.t) / 1000;
    const vx = (x - this.previo.x) / dt;
    const vy = (y - this.previo.y) / dt;
    this.previo = { x, y, t: ahora };
    if (dt < 0.2) this.escena?.puntero?.(x, y, vx, vy);
    if (this.presion) {
      if (!this.presion.movido && Math.hypot(x - this.presion.x, y - this.presion.y) > 6) {
        this.presion.movido = true;
        this.escena?.arrastre?.(this.presion.x, this.presion.y);
      }
      if (this.presion.movido) this.escena?.arrastre?.(x, y);
    }
  }

  punteroPresionado(x: number, y: number) {
    this.presion = { x, y, movido: false };
  }

  punteroSoltado(x: number, y: number) {
    if (!this.presion) return;
    if (this.presion.movido) this.escena?.finArrastre?.();
    else this.escena?.clic?.(x, y);
    this.presion = null;
  }

  destruir() {
    this.detener();
    this.escena?.destruir?.();
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
  }
}

let motorActivo: Motor | null = null;
export const registrarMotor = (m: Motor | null) => (motorActivo = m);
export const motor = () => motorActivo;
