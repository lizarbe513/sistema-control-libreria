// Sprites prerenderizados: dibujarlos una vez y copiarlos es mucho más barato que trazarlos en cada cuadro.

const COLORES_PETALO = ['#F9B8C9', '#F7A1B7', '#FBCFDA', '#F48FAA', '#FDDDE5'];
const TAM = 48;

let petalos: HTMLCanvasElement[] | null = null;

export function spritesPetalo(): HTMLCanvasElement[] {
  if (petalos) return petalos;
  petalos = COLORES_PETALO.map((color) => {
    const c = document.createElement('canvas');
    c.width = c.height = TAM;
    const ctx = c.getContext('2d')!;
    ctx.translate(TAM / 2, TAM / 2);
    // pétalo de cerezo: gota con muesca en la punta
    ctx.beginPath();
    ctx.moveTo(0, 19);
    ctx.bezierCurveTo(15, 10, 17, -10, 6, -19);
    ctx.lineTo(0, -12);
    ctx.lineTo(-6, -19);
    ctx.bezierCurveTo(-17, -10, -15, 10, 0, 19);
    const g = ctx.createRadialGradient(0, 14, 2, 0, 0, 24);
    g.addColorStop(0, '#FFF4F7');
    g.addColorStop(0.55, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,96,130,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.quadraticCurveTo(2, 0, 0, -11);
    ctx.stroke();
    return c;
  });
  return petalos;
}

let brillo: HTMLCanvasElement | null = null;

/** Estrella con halo (para el cielo y las estrellas fugaces). */
export function spriteBrillo(): HTMLCanvasElement {
  if (brillo) return brillo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,240,250,0.9)');
  g.addColorStop(0.35, 'rgba(255,190,220,0.25)');
  g.addColorStop(1, 'rgba(255,190,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(32, 58);
  ctx.moveTo(6, 32);
  ctx.lineTo(58, 32);
  ctx.stroke();
  brillo = c;
  return c;
}

let chispa: HTMLCanvasElement | null = null;

/** Chispita de 4 puntas (los "pétalos" de la radio en el cielo nocturno). */
export function spriteChispa(): HTMLCanvasElement {
  if (chispa) return chispa;
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const ctx = c.getContext('2d')!;
  ctx.translate(20, 20);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
  g.addColorStop(0, 'rgba(255,236,170,0.9)');
  g.addColorStop(1, 'rgba(255,170,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF6D8';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const r = i % 2 ? 2.6 : 11;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  chispa = c;
  return c;
}
