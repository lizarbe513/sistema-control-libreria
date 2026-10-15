// Portadas, lomos y páginas generadas en canvas para libros sin imagen de portada.
import { cat, type Libro } from './datos';

export const fuentesListas: Promise<unknown> =
  typeof document !== 'undefined'
    ? Promise.all([
        document.fonts.load('800 40px Nunito'),
        document.fonts.load('600 40px Nunito'),
        document.fonts.load('400 40px Nunito'),
        document.fonts.load('700 40px Caveat'),
      ]).catch(() => undefined)
    : Promise.resolve();

// ---------- utilidades de color ----------
const hexARgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbAHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Mezcla un color con blanco (cantidad > 0) o negro (cantidad < 0). */
export function tono(hex: string, cantidad: number) {
  const [r, g, b] = hexARgb(hex);
  const t = cantidad > 0 ? 255 : 0;
  const k = Math.abs(cantidad);
  return rgbAHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}

export const esClaro = (hex: string) => {
  const [r, g, b] = hexARgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
};

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexARgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function aleatorio(semilla: number) {
  let s = semilla * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const res: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    const prueba = actual ? actual + ' ' + palabra : palabra;
    if (ctx.measureText(prueba).width > ancho && actual) {
      res.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) res.push(actual);
  return res;
}

/** Ajusta el tamaño de letra hasta que el texto quepa en `maxLineas`. */
function ajustar(
  ctx: CanvasRenderingContext2D,
  texto: string,
  peso: string,
  tam: number,
  ancho: number,
  maxLineas: number,
  min = 18,
) {
  let t = tam;
  let ls: string[];
  do {
    ctx.font = `${peso} ${t}px Nunito`;
    ls = lineas(ctx, texto, ancho);
    if (ls.length <= maxLineas) break;
    t -= 2;
  } while (t > min);
  return { tam: t, lineas: ls };
}

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

// ---------- decoraciones por categoría ----------
function decorar(ctx: CanvasRenderingContext2D, libro: Libro, W: number, H: number) {
  const patron = cat(libro.categoria).patron;
  const rnd = aleatorio(libro.id);
  const claro = tono(libro.tapa, 0.75);
  ctx.save();
  switch (patron) {
    case 'marco': {
      ctx.strokeStyle = rgba(claro, 0.7);
      ctx.lineWidth = 3;
      ctx.strokeRect(26, 26, W - 52, H - 52);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(38, 38, W - 76, H - 76);
      ctx.fillStyle = rgba(claro, 0.85);
      for (const [x, y] of [[38, 38], [W - 38, 38], [38, H - 38], [W - 38, H - 38]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 10);
        ctx.lineTo(x - 10, y);
        ctx.fill();
      }
      break;
    }
    case 'rayos': {
      ctx.translate(W / 2, H * 0.92);
      for (let i = 0; i < 24; i++) {
        ctx.rotate((Math.PI * 2) / 24);
        ctx.fillStyle = i % 2 ? rgba('#ffffff', 0.1) : rgba('#ffffff', 0.04);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-60, -H * 1.2);
        ctx.lineTo(60, -H * 1.2);
        ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgba('#FFF3C4', 0.9);
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.92, 70, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'confeti': {
      const colores = ['#FFFFFF', '#FCEFC7', '#FBD3DE', '#E9E3FB', '#DDF3E4'];
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = rgba(colores[i % colores.length], 0.55 + rnd() * 0.4);
        const x = rnd() * W;
        const y = rnd() * H;
        const r = 4 + rnd() * 9;
        if (i % 3 === 0) {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const a = (k * Math.PI) / 5 - Math.PI / 2;
            const rr = k % 2 ? r * 0.45 : r * 1.2;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // colinas suaves abajo
      ctx.fillStyle = rgba('#FFFFFF', 0.25);
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.quadraticCurveTo(W * 0.25, H - 150, W * 0.55, H - 70);
      ctx.quadraticCurveTo(W * 0.8, H - 10, W, H - 90);
      ctx.lineTo(W, H);
      ctx.fill();
      break;
    }
    case 'dorado': {
      const oro = '#E8C872';
      ctx.strokeStyle = oro;
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, W - 60, H - 60);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(44, 44, W - 88, H - 88);
      ctx.fillStyle = oro;
      for (const [x, y] of [[44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44]]) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      // pequeño emblema
      ctx.beginPath();
      ctx.arc(W / 2, H - 130, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2, H - 146);
      ctx.lineTo(W / 2, H - 114);
      ctx.moveTo(W / 2 - 12, H - 136);
      ctx.lineTo(W / 2 + 12, H - 136);
      ctx.stroke();
      break;
    }
    case 'cuadricula': {
      ctx.strokeStyle = rgba('#FFFFFF', 0.13);
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#FFFFFF', 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W - 110, H - 140, 60, 0, Math.PI * 2);
      ctx.moveTo(W - 230, H - 60);
      ctx.lineTo(W - 120, H - 230);
      ctx.lineTo(W - 40, H - 60);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'andino': {
      // franjas con zigzag inspiradas en textiles andinos
      const colores = ['#FFF3E0', '#F27A9B', '#F4D03F', '#5DBB8A', '#FFF3E0'];
      const banda = (y0: number) => {
        colores.forEach((c, i) => {
          ctx.fillStyle = rgba(c, 0.9);
          ctx.fillRect(0, y0 + i * 9, W, 5);
        });
        ctx.fillStyle = rgba('#FFF3E0', 0.95);
        for (let x = 0; x < W; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, y0 + 60);
          ctx.lineTo(x + 16, y0 + 46);
          ctx.lineTo(x + 32, y0 + 60);
          ctx.fill();
        }
      };
      banda(H - 120);
      banda(36);
      break;
    }
    case 'ondas': {
      ctx.strokeStyle = rgba('#FFFFFF', 0.18);
      ctx.lineWidth = 2;
      for (let y = 40; y < H; y += 26) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + Math.sin(x / 34 + y) * 6);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

const cachePortadas = new Map<number, HTMLCanvasElement>();

export function portada(libro: Libro): HTMLCanvasElement {
  const enCache = cachePortadas.get(libro.id);
  if (enCache) return enCache;
  const W = 512;
  const H = 768;
  const [c, ctx] = lienzo(W, H);

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, tono(libro.tapa, 0.12));
  g.addColorStop(1, tono(libro.tapa, -0.18));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  decorar(ctx, libro, W, H);

  // etiqueta crema con el título
  const tit = ajustar(ctx, libro.titulo, '800', 58, W - 170, 4, 26);
  const altoTitulo = tit.lineas.length * tit.tam * 1.12;
  const yEt = 150;
  const altoEt = altoTitulo + 80;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFF8EE';
  rectRedondo(ctx, 64, yEt, W - 128, altoEt, 26);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = tono(libro.tapa, -0.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${tit.tam}px Nunito`;
  tit.lineas.forEach((l, i) => ctx.fillText(l, W / 2, yEt + 40 + i * tit.tam * 1.12));
  // corazón pequeño bajo la etiqueta
  ctx.fillStyle = tono(libro.tapa, -0.25);
  ctx.font = '600 22px Nunito';
  ctx.fillText('❦', W / 2, yEt + altoEt - 30);

  // autor
  const claro = esClaro(libro.tapa);
  ctx.fillStyle = claro ? tono(libro.tapa, -0.6) : '#FFFFFF';
  const aut = ajustar(ctx, libro.autor, '600', 30, W - 140, 2, 18);
  ctx.font = `600 ${aut.tam}px Nunito`;
  aut.lineas.forEach((l, i) => ctx.fillText(l, W / 2, yEt + altoEt + 36 + i * aut.tam * 1.2));

  // editorial
  ctx.font = '800 18px Nunito';
  ctx.fillStyle = claro ? rgba('#000000', 0.45) : rgba('#FFFFFF', 0.75);
  ctx.fillText(libro.editorial.toUpperCase(), W / 2, H - 64);

  // sombra de la bisagra junto al lomo
  const bis = ctx.createLinearGradient(0, 0, 34, 0);
  bis.addColorStop(0, 'rgba(0,0,0,0.28)');
  bis.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  bis.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bis;
  ctx.fillRect(0, 0, 34, H);

  cachePortadas.set(libro.id, c);
  return c;
}

export function lomo(libro: Libro): HTMLCanvasElement {
  const W = 128;
  const H = 768;
  const [c, ctx] = lienzo(W, H);
  ctx.fillStyle = tono(libro.tapa, -0.08);
  ctx.fillRect(0, 0, W, H);
  const brillo = ctx.createLinearGradient(0, 0, W, 0);
  brillo.addColorStop(0, 'rgba(0,0,0,0.25)');
  brillo.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  brillo.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = brillo;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFF8EE';
  ctx.fillRect(0, 50, W, 8);
  ctx.fillRect(0, H - 58, W, 8);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = esClaro(libro.tapa) ? tono(libro.tapa, -0.65) : '#FFFFFF';
  let t = 46;
  ctx.font = `800 ${t}px Nunito`;
  while (ctx.measureText(libro.titulo).width > H - 200 && t > 16) {
    t -= 2;
    ctx.font = `800 ${t}px Nunito`;
  }
  ctx.fillText(libro.titulo, 0, -8);
  ctx.font = '600 22px Nunito';
  ctx.globalAlpha = 0.8;
  ctx.fillText(libro.autor, 0, 34);
  ctx.restore();
  return c;
}

export function contratapa(libro: Libro): HTMLCanvasElement {
  const W = 512;
  const H = 768;
  const [c, ctx] = lienzo(W, H);
  ctx.fillStyle = tono(libro.tapa, -0.1);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = esClaro(libro.tapa) ? tono(libro.tapa, -0.6) : 'rgba(255,255,255,0.9)';
  ctx.font = '400 24px Nunito';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lineas(ctx, libro.sinopsis, W - 140).forEach((l, i) => ctx.fillText(l, W / 2, 140 + i * 34));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(W / 2 - 90, H - 170, 180, 90);
  ctx.fillStyle = '#222';
  const rnd = aleatorio(libro.id + 7);
  for (let x = W / 2 - 78; x < W / 2 + 78; x += 3 + Math.floor(rnd() * 3)) ctx.fillRect(x, H - 160, 1 + Math.floor(rnd() * 3), 56);
  return c;
}

export function primeraPagina(libro: Libro): HTMLCanvasElement {
  const W = 512;
  const H = 768;
  const [c, ctx] = lienzo(W, H);
  ctx.fillStyle = '#FFF9F0';
  ctx.fillRect(0, 0, W, H);
  const sombra = ctx.createLinearGradient(0, 0, 60, 0);
  sombra.addColorStop(0, 'rgba(120,90,60,0.22)');
  sombra.addColorStop(1, 'rgba(120,90,60,0)');
  ctx.fillStyle = sombra;
  ctx.fillRect(0, 0, 60, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#3A2E2A';
  const tit = ajustar(ctx, libro.titulo, '800', 40, W - 120, 3, 22);
  ctx.font = `800 ${tit.tam}px Nunito`;
  tit.lineas.forEach((l, i) => ctx.fillText(l, W / 2, 90 + i * tit.tam * 1.15));
  let y = 90 + tit.lineas.length * tit.tam * 1.15 + 24;
  ctx.fillStyle = '#F27A9B';
  ctx.font = '600 26px Nunito';
  ctx.fillText('✿ ── ✿ ── ✿', W / 2, y);
  y += 60;
  ctx.fillStyle = '#4A3F3A';
  ctx.font = '400 25px Nunito';
  for (const l of lineas(ctx, libro.sinopsis, W - 130)) {
    ctx.fillText(l, W / 2, y);
    y += 36;
  }
  ctx.fillStyle = '#8A6F62';
  ctx.font = '700 34px Caveat';
  ctx.fillText('— ' + libro.autor, W / 2, H - 110);
  return c;
}

const cacheMini = new Map<number, string>();
export function miniatura(libro: Libro): string {
  const enCache = cacheMini.get(libro.id);
  if (enCache) return enCache;
  const [c, ctx] = lienzo(192, 288);
  ctx.drawImage(portada(libro), 0, 0, 192, 288);
  const url = c.toDataURL('image/png');
  cacheMini.set(libro.id, url);
  return url;
}

/** Vacía la caché de portadas (por si las fuentes cargaron después de dibujar). */
export function limpiarCache() {
  cachePortadas.clear();
  cacheMini.clear();
}
