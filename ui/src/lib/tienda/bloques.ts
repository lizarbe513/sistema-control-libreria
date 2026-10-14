// Geometrías y texturas procedurales de cada tipo de bloque (sin archivos externos).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tono } from '../portada';
import type { Bloque, TipoBloque } from './modelo';

const LOMOS = ['#F27A9B', '#6FA8DC', '#E9B949', '#5DBB8A', '#9B87E0', '#F0A070', '#4A4E69', '#C0392B', '#FBCFDA', '#3E8E7E', '#FFF1D6', '#8E6C8A'];

/** Generador pseudoaleatorio con semilla (las texturas salen iguales en cada carga). */
function azarSemilla(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function lienzo(tam = 128): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  return [c, c.getContext('2d')!];
}

function textura(c: HTMLCanvasElement, repetir = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repetir !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repetir, repetir);
  }
  return t;
}

/** Madera con vetas. */
export function pintarMadera(base: string, semilla = 1, tablas = 4) {
  const [c, x] = lienzo();
  const r = azarSemilla(semilla);
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  const alto = 128 / tablas;
  for (let i = 0; i < tablas; i++) {
    x.fillStyle = tono(base, (r() - 0.5) * 0.12);
    x.fillRect(0, i * alto, 128, alto);
    x.strokeStyle = tono(base, -0.12);
    x.globalAlpha = 0.35;
    for (let v = 0; v < 3; v++) {
      const y = i * alto + r() * alto;
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(40, y + (r() - 0.5) * 6, 90, y + (r() - 0.5) * 6, 128, y);
      x.stroke();
    }
    x.globalAlpha = 1;
    x.fillStyle = tono(base, -0.2);
    x.fillRect(0, i * alto + alto - 1.5, 128, 1.5);
  }
  return c;
}

/** Altura (de 128) de la tabla de madera sobre la que se apoyan los libros, en la cara principal. */
const BASE_REPISA = 20;

/**
 * Frente de un compartimento: el fondo, los libros parados y, abajo, la **tabla de madera** de la repisa
 * (con vetas, un reborde iluminado y una sombra), sin marco (lo ponen las piezas según los vecinos).
 */
function pintarLibros(semilla: number) {
  const [c, x] = lienzo();
  const r = azarSemilla(semilla * 7919);
  const suelo = 128 - BASE_REPISA; // línea donde se apoyan los libros
  const g = x.createLinearGradient(0, 0, 0, suelo);
  g.addColorStop(0, '#5E3F2B');
  g.addColorStop(1, '#7A5238');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  let px = 2;
  while (px < 124) {
    if (r() < 0.06) {
      px += 6 + r() * 8; // hueco
      continue;
    }
    const w = 7 + r() * 9;
    if (px + w > 126) break;
    const h = 60 + r() * 40;
    const color = LOMOS[Math.floor(r() * LOMOS.length)];
    const inclinado = r() < 0.08 && px > 14;
    x.save();
    x.translate(px, suelo);
    if (inclinado) x.rotate(-0.16);
    x.fillStyle = color;
    x.fillRect(0, -h, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(1, -h, 1.5, h);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(w - 1.5, -h, 1.5, h);
    x.fillStyle = r() < 0.5 ? 'rgba(255,240,200,0.75)' : 'rgba(255,255,255,0.55)';
    x.fillRect(1.5, -h + 10, w - 3, 2);
    x.fillRect(1.5, -14, w - 3, 2);
    x.restore();
    px += w + 0.8;
  }
  // sombra que cae de la tabla de arriba, y la que proyectan los libros sobre la tabla de abajo
  x.fillStyle = 'rgba(0,0,0,0.24)';
  x.fillRect(0, 0, 128, 6);
  const sombra = x.createLinearGradient(0, suelo - 6, 0, suelo);
  sombra.addColorStop(0, 'rgba(0,0,0,0)');
  sombra.addColorStop(1, 'rgba(0,0,0,0.16)');
  x.fillStyle = sombra;
  x.fillRect(0, suelo - 6, 128, 6);

  // la tabla: frente de madera clara con vetas
  const m = x.createLinearGradient(0, suelo, 0, 128);
  m.addColorStop(0, '#E7BE92');
  m.addColorStop(0.5, '#D9A878');
  m.addColorStop(1, '#C48F61');
  x.fillStyle = m;
  x.fillRect(0, suelo, 128, BASE_REPISA);
  x.strokeStyle = 'rgba(120,70,35,0.28)';
  x.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = suelo + 4 + r() * (BASE_REPISA - 8);
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(36, y + (r() - 0.5) * 3, 90, y + (r() - 0.5) * 3, 128, y);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,245,225,0.75)'; // reborde iluminado
  x.fillRect(0, suelo, 128, 2);
  x.fillStyle = 'rgba(70,35,15,0.42)'; // arista de abajo
  x.fillRect(0, 126, 128, 2);
  return c;
}

/** Cara de una puerta con ligas transparentes que sujetan libros. */
function pintarLigas(semilla: number) {
  const [c, x] = lienzo();
  const r = azarSemilla(semilla * 3571);
  x.fillStyle = '#F6E3A8';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(180,140,60,0.25)';
  for (let i = 0; i < 128; i += 16) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 128);
    x.stroke();
  }
  // portadas sujetas (vistas de frente)
  let px = 8;
  while (px < 112) {
    const w = 22 + r() * 14;
    if (px + w > 122) break;
    const h = 60 + r() * 30;
    const y = 112 - h;
    x.fillStyle = 'rgba(0,0,0,0.15)';
    x.fillRect(px + 2, y + 3, w, h);
    x.fillStyle = LOMOS[Math.floor(r() * LOMOS.length)];
    x.fillRect(px, y, w, h);
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.fillRect(px + 4, y + 8, w - 8, 6);
    x.fillRect(px + 4, y + 18, w - 14, 3);
    px += w + 5;
  }
  // ligas transparentes
  for (const y of [40, 92]) {
    x.fillStyle = 'rgba(255,255,255,0.45)';
    x.fillRect(0, y, 128, 7);
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillRect(0, y, 128, 1.5);
  }
  return c;
}

function pintarAlfombra() {
  const [c, x] = lienzo();
  x.fillStyle = '#F7C6D4';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#FFF4F7';
  x.lineWidth = 6;
  x.strokeRect(10, 10, 108, 108);
  x.fillStyle = '#F27A9B';
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.arc(64, 64, 10 + i * 12, 0, Math.PI * 2);
    x.globalAlpha = 0.18;
    x.fill();
  }
  x.globalAlpha = 1;
  return c;
}

function pintarReloj() {
  const [c, x] = lienzo();
  x.fillStyle = '#FFF9F2';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#4A4E69';
  x.font = '700 16px Nunito, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    x.fillText(String(h), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
  }
  x.strokeStyle = '#4A4E69';
  x.lineCap = 'round';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(64, 64);
  x.lineTo(64 + 22, 64 - 14);
  x.stroke();
  x.strokeStyle = '#F27A9B';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(64, 64);
  x.lineTo(64 - 6, 64 - 38);
  x.stroke();
  return c;
}

function pintarGlobo() {
  const [c, x] = lienzo();
  x.fillStyle = '#8FC3E8';
  x.fillRect(0, 0, 128, 128);
  const r = azarSemilla(77);
  x.fillStyle = '#9BD9A6';
  for (let i = 0; i < 9; i++) {
    x.beginPath();
    x.ellipse(r() * 128, 20 + r() * 88, 8 + r() * 14, 6 + r() * 12, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function pintarPizarra() {
  const [c, x] = lienzo();
  x.fillStyle = '#3F4F47';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#FFFFFF';
  x.font = '700 15px Caveat, cursive';
  x.textAlign = 'center';
  x.fillText('Recomendado', 64, 30);
  x.fillText('del día', 64, 48);
  x.fillStyle = '#FBCFDA';
  x.font = '700 20px Caveat, cursive';
  x.fillText('♥ ¡Pregúntame! ♥', 64, 82);
  x.strokeStyle = 'rgba(255,255,255,0.5)';
  x.beginPath();
  x.moveTo(24, 98);
  x.quadraticCurveTo(64, 108, 104, 98);
  x.stroke();
  return c;
}

function pintarCuadro() {
  const [c, x] = lienzo();
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#FDE2E8');
  g.addColorStop(1, '#E9E3FB');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#B9E3C6';
  x.beginPath();
  x.ellipse(64, 128, 90, 34, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#8A5E40';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(64, 104);
  x.quadraticCurveTo(60, 70, 72, 50);
  x.stroke();
  x.fillStyle = '#F7A1B7';
  const r = azarSemilla(5);
  for (let i = 0; i < 22; i++) {
    x.beginPath();
    x.arc(48 + r() * 50, 28 + r() * 36, 5 + r() * 6, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function pintarLetrero() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#F27A9B';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#FFF4F7';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 240, 112);
  x.fillStyle = '#FFFFFF';
  x.font = '800 44px Nunito, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('SIGLO XXI', 128, 56);
  x.font = '700 18px Nunito, sans-serif';
  x.fillText('librería', 128, 94);
  return c;
}

/** Plaquita con el nombre del estante (cartel). */
export function pintarCartel(texto: string, fuerte: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 112;
  const x = c.getContext('2d')!;
  x.fillStyle = fuerte;
  x.beginPath();
  x.roundRect(6, 6, 244, 100, 30);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.85)';
  x.lineWidth = 6;
  x.stroke();
  x.fillStyle = '#FFFFFF';
  const t = texto.length > 10 ? texto.slice(0, 10) + '…' : texto;
  x.font = `800 ${t.length <= 2 ? 70 : t.length <= 5 ? 52 : 34}px Nunito, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(t, 128, 60);
  return c;
}

/** Tapa de una caja abierta: libros vistos desde arriba. */
function pintarCajaArriba(semilla: number) {
  const [c, x] = lienzo();
  const r = azarSemilla(semilla * 104729);
  x.fillStyle = '#C79A64';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8A6238';
  x.fillRect(6, 6, 116, 116);
  for (let i = 0; i < 9; i++) {
    const w = 30 + r() * 26;
    const h = 40 + r() * 30;
    const cx = 12 + r() * (104 - w);
    const cy = 12 + r() * (104 - h);
    x.save();
    x.translate(cx + w / 2, cy + h / 2);
    x.rotate((r() - 0.5) * 0.6);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
    x.fillStyle = LOMOS[Math.floor(r() * LOMOS.length)];
    x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = 'rgba(255,255,255,0.6)';
    x.fillRect(-w / 2 + 5, -h / 2 + 6, w - 10, 5);
    x.restore();
  }
  return c;
}

function pintarCarton() {
  const [c, x] = lienzo();
  x.fillStyle = '#D9AE78';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(140,95,50,0.25)';
  for (let i = 4; i < 128; i += 8) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 128);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,240,215,0.65)'; // cinta
  x.fillRect(0, 10, 128, 14);
  x.fillStyle = 'rgba(140,95,50,0.5)';
  x.fillRect(0, 120, 128, 8);
  return c;
}

function pintarMostrador(arriba: boolean) {
  const [c, x] = lienzo();
  if (arriba) {
    x.fillStyle = '#FFF4F7';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#F7C6D4';
    x.lineWidth = 6;
    x.strokeRect(3, 3, 122, 122);
  } else {
    x.fillStyle = '#F2A0B4';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#FBD3DE';
    x.lineWidth = 4;
    x.strokeRect(14, 22, 100, 84);
    x.fillStyle = '#FFF4F7';
    x.fillRect(0, 0, 128, 12);
  }
  return c;
}

export interface Definicion {
  geo: THREE.BufferGeometry;
  mat: THREE.Material | THREE.Material[];
}

/** Muebles que se dibujan en piezas y se conectan con sus vecinos del mismo estante. */
export type Familia = 'estante' | 'puerta';
export type Pieza = 'marcoIzq' | 'marcoDer' | 'marcoArr' | 'marcoAbj' | 'divisor' | 'tabla';
export const PIEZAS: Pieza[] = ['marcoIzq', 'marcoDer', 'marcoArr', 'marcoAbj', 'divisor', 'tabla'];

export const familiaDe = (t: TipoBloque): Familia | null => (t === 'estanteria' ? 'estante' : t === 'puerta' ? 'puerta' : null);

export interface Recursos {
  defs: Map<string, Definicion>;
  /** Piezas de marco: clave `${familia}:${pieza}`. */
  piezas: Map<string, Definicion>;
  claveDe(b: Bloque): string;
  liberar(): void;
}

const VARIANTES_REPISA = 4;
const VARIANTES_PUERTA = 3;

export function crearRecursos(): Recursos {
  const defs = new Map<string, Definicion>();
  const piezas = new Map<string, Definicion>();
  const materiales: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mat = (opc: THREE.MeshLambertMaterialParameters) => {
    const m = new THREE.MeshLambertMaterial(opc);
    materiales.push(m);
    return m;
  };
  const colores = new Map<string, THREE.MeshLambertMaterial>();
  const col = (c: string) => {
    if (!colores.has(c)) colores.set(c, mat({ color: c }));
    return colores.get(c)!;
  };
  const brillo = (c: string) => mat({ color: c, emissive: c, emissiveIntensity: 0.9 });
  const geo = <G extends THREE.BufferGeometry>(g: G) => (geos.push(g), g);

  /** Une primitivas (cada una con su material) en una sola geometría con grupos. */
  type Parte = [THREE.BufferGeometry, THREE.Material];
  const compuesto = (partes: Parte[]): Definicion => {
    const sueltas = partes.map(([g]) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      return n;
    });
    const unida = mergeGeometries(sueltas, true)!;
    for (const g of sueltas) g.dispose();
    return { geo: geo(unida), mat: partes.map(([, m]) => m) };
  };
  const caja = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const cil = (r1: number, r2: number, h: number, x = 0, y = 0, z = 0, seg = 16, abierto = false) =>
    new THREE.CylinderGeometry(r1, r2, h, seg, 1, abierto).translate(x, y, z);
  const esfera = (r: number, x = 0, y = 0, z = 0, seg = 14) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)).translate(x, y, z);
  const plano = (w: number, h: number, x = 0, y = 0, z = 0) => new THREE.PlaneGeometry(w, h).translate(x, y, z);

  const madera = mat({ map: textura(pintarMadera('#D6976A', 3)) });
  const maderaMarco = mat({ map: textura(pintarMadera('#F1DDC7', 8, 2)) });
  const maderaClara = mat({ map: textura(pintarMadera('#E8C9A0', 5, 3)) });
  const maderaPuerta = mat({ map: textura(pintarMadera('#EBC963', 9)) });
  const cubo = geo(new THREE.BoxGeometry(1, 1, 1));

  // ── estanterías y puertas: cuerpo sin marco + piezas ──
  // el cuerpo es completo (sin rendijas entre vecinos); los marcos sobresalen 3 milésimas, así ninguna cara
  // comparte plano con otra (evita el parpadeo / z-fighting)
  const cuerpoEstante = geo(caja(1, 1, 0.9, 0, 0, -0.05));
  for (let v = 0; v < VARIANTES_REPISA; v++) {
    const frente = mat({ map: textura(pintarLibros(v + 1)) });
    defs.set(`estanteria${v}`, { geo: cuerpoEstante, mat: [madera, madera, madera, madera, frente, madera] });
  }
  const cuerpoPuerta = geo(caja(1, 1, 0.08));
  for (let v = 0; v < VARIANTES_PUERTA; v++) {
    const ligas = mat({ map: textura(pintarLigas(v + 1)), transparent: false });
    defs.set(`puerta${v}`, { geo: cuerpoPuerta, mat: [maderaPuerta, maderaPuerta, maderaPuerta, maderaPuerta, ligas, maderaPuerta] });
  }
  const piezasDe = (familia: Familia, fondo: number, grosor: number) => {
    const e = 0.003; // los marcos sobresalen un poco del cuerpo
    const L = 1 + e * 2;
    const F = fondo + e * 2;
    // en las estanterías, la tabla sobresale hacia el frente como un listón de repisa de verdad
    const sale = familia === 'estante' ? 0.07 : 0;
    const gruesoTabla = grosor * (familia === 'estante' ? 1.05 : 0.55);
    const gruesoDivisor = grosor * (familia === 'estante' ? 0.85 : 0.6);
    const fondoInterno = fondo * 0.9 + sale;
    const zInterno = -fondo * 0.05 + 0.01 + sale / 2;
    const p: Record<Pieza, THREE.BufferGeometry> = {
      marcoIzq: caja(grosor + e, L, F, -0.5 + (grosor - e) / 2),
      marcoDer: caja(grosor + e, L, F, 0.5 - (grosor - e) / 2),
      marcoArr: caja(L, grosor + e, F, 0, 0.5 - (grosor - e) / 2),
      marcoAbj: caja(L, grosor * 1.4 + e, F, 0, -0.5 + (grosor * 1.4 - e) / 2),
      divisor: caja(gruesoDivisor, 1, fondoInterno, -0.5, 0, zInterno),
      tabla: caja(1, gruesoTabla, fondoInterno, 0, 0.5, zInterno),
    };
    for (const k of PIEZAS) piezas.set(`${familia}:${k}`, { geo: geo(p[k]), mat: k.startsWith('marco') ? maderaMarco : madera });
  };
  piezasDe('estante', 1, 0.09);
  piezasDe('puerta', 0.14, 0.07);

  // ── construcción ──
  defs.set('plataforma', { geo: cubo, mat: maderaClara });
  defs.set('pared', { geo: cubo, mat: col('#E4DCE6') });
  const escalon1 = caja(1, 0.5, 0.5, 0, -0.25, 0.25);
  const escalon2 = caja(1, 1, 0.5, 0, 0, -0.25);
  defs.set('escalera', { geo: geo(mergeGeometries([escalon1, escalon2])!), mat: maderaClara });
  escalon1.dispose();
  escalon2.dispose();
  // escalera de pared: la misma forma, en el material de la pared / columna
  const peldano1 = caja(1, 0.5, 0.5, 0, -0.25, 0.25);
  const peldano2 = caja(1, 1, 0.5, 0, 0, -0.25);
  defs.set('escaleraPared', { geo: geo(mergeGeometries([peldano1, peldano2])!), mat: col('#E4DCE6') });
  peldano1.dispose();
  peldano2.dispose();
  defs.set(
    'baranda',
    compuesto([
      [caja(1, 0.06, 0.08, 0, 0.45, 0.42), madera],
      [caja(1, 0.05, 0.06, 0, -0.35, 0.42), madera],
      [caja(0.08, 1, 0.08, -0.46, 0, 0.42), madera],
      [caja(0.08, 1, 0.08, 0.46, 0, 0.42), madera],
      ...[-0.25, 0, 0.25].map((x): Parte => [caja(0.04, 0.8, 0.04, x, 0.05, 0.42), maderaClara]),
    ]),
  );
  const alfombra = mat({ map: textura(pintarAlfombra()) });
  defs.set('alfombra', { geo: geo(caja(0.98, 0.03, 0.98, 0, -0.485, 0)), mat: [col('#F7C6D4'), col('#F7C6D4'), alfombra, col('#F7C6D4'), col('#F7C6D4'), col('#F7C6D4')] });

  // ── muebles para libros ──
  const carton = mat({ map: textura(pintarCarton()) });
  for (let v = 0; v < 2; v++) {
    const arriba = mat({ map: textura(pintarCajaArriba(v + 1)) });
    defs.set(`caja${v}`, { geo: geo(caja(0.94, 0.55, 0.94, 0, -0.225, 0)), mat: [carton, carton, arriba, carton, carton, carton] });
  }
  for (let v = 0; v < 2; v++) {
    const r = azarSemilla(v * 31 + 7);
    const partes: Parte[] = [[caja(1, 0.08, 1, 0, -0.1, 0), maderaClara]];
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) partes.push([caja(0.07, 0.36, 0.07, x, -0.32, z), madera]);
    for (const cx of [-0.22, 0.22]) {
      let y = -0.06;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const h = 0.06 + r() * 0.04;
        const libro = caja(0.36 + r() * 0.08, h, 0.5 + r() * 0.12).rotateY((r() - 0.5) * 0.5).translate(cx, y + h / 2, (r() - 0.5) * 0.1);
        partes.push([libro, col(LOMOS[Math.floor(r() * LOMOS.length)])]);
        y += h;
      }
    }
    defs.set(`mesa${v}`, compuesto(partes));
  }

  // ── atención ──
  const mostradorLado = mat({ map: textura(pintarMostrador(false)) });
  const mostradorArriba = mat({ map: textura(pintarMostrador(true)) });
  defs.set('mostrador', {
    geo: geo(caja(1, 0.9, 1, 0, -0.05, 0)),
    mat: [mostradorLado, mostradorLado, mostradorArriba, mostradorLado, mostradorLado, mostradorLado],
  });
  defs.set(
    'registradora',
    compuesto([
      [caja(0.56, 0.22, 0.46, 0, -0.39, 0), col('#B9A8E8')],
      [caja(0.5, 0.06, 0.02, 0, -0.42, 0.235), col('#9B87E0')],
      [caja(0.32, 0.03, 0.2, 0, -0.265, 0.08), col('#FFF4F7')],
      [caja(0.34, 0.2, 0.05).rotateX(-0.3).translate(0, -0.17, -0.12), col('#4A4E69')],
    ]),
  );
  defs.set(
    'banquito',
    compuesto([
      [cil(0.24, 0.24, 0.07, 0, -0.08, 0, 20), madera],
      [cil(0.21, 0.23, 0.05, 0, -0.02, 0, 20), col('#F7B3C5')],
      ...[0, 1, 2].map((i): Parte => {
        const a = (i / 3) * Math.PI * 2;
        return [cil(0.025, 0.025, 0.42, Math.cos(a) * 0.16, -0.32, Math.sin(a) * 0.16, 6), madera];
      }),
    ]),
  );

  // ── decoración ──
  const blanco = col('#FFF8F3');
  defs.set(
    'gatito',
    compuesto([
      [cil(0.3, 0.33, 0.14, 0, -0.43, 0, 24), col('#E9E3FB')],
      [esfera(0.24).scale(1, 1.1, 0.9).translate(0, -0.13, 0), blanco],
      [esfera(0.17, 0, 0.17, 0.04), blanco],
      [new THREE.ConeGeometry(0.065, 0.13, 4).translate(-0.1, 0.32, 0.04), blanco],
      [new THREE.ConeGeometry(0.065, 0.13, 4).translate(0.1, 0.32, 0.04), blanco],
      [esfera(0.026, -0.062, 0.19, 0.19, 8), col('#4A4E69')],
      [esfera(0.026, 0.062, 0.19, 0.19, 8), col('#4A4E69')],
      [esfera(0.022, 0, 0.15, 0.205, 8), col('#F27A9B')],
      [esfera(0.09).scale(1, 0.8, 0.5).translate(-0.1, -0.02, 0.16), col('#F0A070')],
      [new THREE.TorusGeometry(0.15, 0.035, 6, 14, Math.PI).rotateX(Math.PI / 2).translate(0.05, -0.33, -0.12), blanco],
    ]),
  );
  defs.set(
    'flores',
    compuesto([
      [new THREE.TorusGeometry(0.27, 0.05, 8, 28).translate(0, 0.05, -0.44), col('#7CC49A')],
      ...Array.from({ length: 9 }, (_, i): Parte => {
        const a = (i / 9) * Math.PI * 2;
        return [esfera(0.075, Math.cos(a) * 0.27, 0.05 + Math.sin(a) * 0.27, -0.4, 10), col(['#F7A1B7', '#FFF4F7', '#F4D03F'][i % 3])];
      }),
      [new THREE.ConeGeometry(0.06, 0.16, 4).rotateZ(0.5).translate(-0.07, -0.28, -0.42), col('#F27A9B')],
      [new THREE.ConeGeometry(0.06, 0.16, 4).rotateZ(-0.5).translate(0.07, -0.28, -0.42), col('#F27A9B')],
    ]),
  );
  const metal = col('#C9C2CF');
  defs.set(
    'lampara',
    compuesto([
      [cil(0.17, 0.2, 0.05, 0, -0.475, 0, 20), metal],
      [cil(0.022, 0.022, 0.8, 0, -0.05, 0, 8), metal],
      [cil(0.13, 0.22, 0.24, 0, 0.36, 0, 20, true), mat({ color: '#FFF1D6', emissive: '#FFE3A8', emissiveIntensity: 0.55, side: THREE.DoubleSide })],
      [esfera(0.07, 0, 0.3, 0), brillo('#FFE9A8')],
    ]),
  );
  defs.set(
    'colgante',
    compuesto([
      [cil(0.01, 0.01, 0.42, 0, 0.29, 0, 6), col('#4A4E69')],
      [cil(0.05, 0.2, 0.16, 0, 0.04, 0, 20, true), mat({ color: '#F7B3C5', side: THREE.DoubleSide })],
      [esfera(0.06, 0, -0.02, 0), brillo('#FFE9A8')],
    ]),
  );
  const maceta = cil(0.22, 0.17, 0.36, 0, -0.32, 0, 14);
  const hojas = new THREE.IcosahedronGeometry(0.33, 1).translate(0, 0.08, 0);
  defs.set('planta', compuesto([[maceta, col('#E8A07E')], [hojas, mat({ color: '#7CC49A', flatShading: true })]]));
  const dorado = col('#E9B949');
  defs.set(
    'globo',
    compuesto([
      [cil(0.14, 0.17, 0.05, 0, -0.475, 0, 18), madera],
      [cil(0.02, 0.02, 0.25, 0, -0.33, 0, 6), dorado],
      [new THREE.TorusGeometry(0.25, 0.014, 6, 24, Math.PI).rotateZ(-Math.PI / 2 + 0.4), dorado],
      [esfera(0.22, 0, 0, 0, 20).rotateZ(0.4), mat({ map: textura(pintarGlobo()) })],
    ]),
  );
  defs.set(
    'reloj',
    compuesto([
      [cil(0.3, 0.3, 0.06, 0, 0, 0, 32, true).rotateX(Math.PI / 2).translate(0, 0.05, -0.46), col('#F7B3C5')],
      [new THREE.CircleGeometry(0.3, 32).translate(0, 0.05, -0.43), mat({ map: textura(pintarReloj()) })],
    ]),
  );
  const curva = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.5, 0.34, -0.45), new THREE.Vector3(0, 0.14, -0.45), new THREE.Vector3(0.5, 0.34, -0.45));
  defs.set(
    'guirnalda',
    compuesto([
      [new THREE.TubeGeometry(curva, 12, 0.008, 4), col('#7A6A70')],
      ...[0.15, 0.38, 0.62, 0.85].map((f, i): Parte => {
        const p = curva.getPoint(f);
        return [esfera(0.045, p.x, p.y - 0.05, p.z + 0.02, 10), brillo(i % 2 ? '#FFD3E0' : '#FFE9A8')];
      }),
    ]),
  );
  const tablero = (g: THREE.BufferGeometry) => g.rotateX(-0.2).translate(0, 0.08, 0.08);
  defs.set(
    'pizarra',
    compuesto([
      [caja(0.05, 1, 0.05).rotateX(-0.2).translate(-0.27, -0.02, 0.05), madera],
      [caja(0.05, 1, 0.05).rotateX(-0.2).translate(0.27, -0.02, 0.05), madera],
      [caja(0.05, 0.95, 0.05).rotateX(0.35).translate(0, -0.05, -0.17), madera],
      [tablero(caja(0.62, 0.64, 0.04)), madera],
      [tablero(plano(0.55, 0.57, 0, 0, 0.021)), mat({ map: textura(pintarPizarra()) })],
    ]),
  );
  defs.set(
    'cuadro',
    compuesto([
      [caja(0.78, 0.58, 0.05, 0, 0.05, -0.47), col('#C98A5B')],
      [plano(0.68, 0.48, 0, 0.05, -0.444), mat({ map: textura(pintarCuadro()) })],
    ]),
  );
  defs.set(
    'letrero',
    compuesto([
      [caja(0.98, 0.46, 0.06, 0, 0.1, -0.46), col('#E0607A')],
      [plano(0.96, 0.44, 0, 0.1, -0.428), mat({ map: textura(pintarLetrero()) })],
    ]),
  );

  return {
    defs,
    piezas,
    claveDe(b) {
      const h = ((b.x * 73856093) ^ (b.y * 19349663) ^ (b.z * 83492791)) >>> 0;
      if (b.tipo === 'estanteria') return `estanteria${h % VARIANTES_REPISA}`;
      if (b.tipo === 'puerta') return `puerta${h % VARIANTES_PUERTA}`;
      if (b.tipo === 'caja' || b.tipo === 'mesa') return `${b.tipo}${h % 2}`;
      return b.tipo;
    },
    liberar() {
      for (const g of geos) g.dispose();
      for (const m of materiales) {
        (m as THREE.MeshLambertMaterial).map?.dispose();
        m.dispose();
      }
    },
  };
}

/** Tipos cuyo cuerpo se tiñe con el color del estante. */
export const TIPOS_CON_TINTE: TipoBloque[] = ['estanteria', 'caja', 'mesa', 'puerta'];

/** Lámparas y guirnaldas: llevan un halo de luz (sprite) en la escena. Posición local del brillo. */
export const BRILLOS: Partial<Record<TipoBloque, [number, number, number, number][]>> = {
  lampara: [[0, 0.3, 0, 1.1]],
  colgante: [[0, -0.04, 0, 0.9]],
  guirnalda: [
    [-0.3, 0.17, -0.42, 0.35],
    [0.3, 0.17, -0.42, 0.35],
  ],
};
