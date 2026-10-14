/** Una escena de fondo animado. Trabaja en píxeles CSS (el motor ya aplica el devicePixelRatio). */
export interface Escena {
  cuadro(ctx: CanvasRenderingContext2D, dt: number, t: number): void;
  redimensionar(w: number, h: number): void;
  /** Movimiento del puntero en cualquier parte de la ventana (vx, vy en px/s). */
  puntero?(x: number, y: number, vx: number, vy: number): void;
  /** Clic (sin arrastre) en una zona vacía. */
  clic?(x: number, y: number): void;
  arrastre?(x: number, y: number): void;
  finArrastre?(): void;
  /** Un pétalo de la radio "aterriza" sobre esta escena. */
  posarPetalo?(x: number, y: number, rot: number, sprite: number): void;
  destruir?(): void;
}

export interface OpcionesEscena {
  w: number;
  h: number;
  /** 1 = calidad normal, 0.5 = modo rendimiento. */
  calidad: number;
}

export const azar = (a: number, b: number) => a + Math.random() * (b - a);
export const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
