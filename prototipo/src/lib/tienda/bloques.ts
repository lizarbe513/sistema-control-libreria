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

/** Frente de una repisa: marco de madera y libros parados. */
function pintarRepisa(marco: string, semilla: number) {
  const [c, x] = lienzo();
  const r = azarSemilla(semilla * 7919);
  const fondo = tono(marco, -0.35);
  x.fillStyle = marco;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = fondo;
  x.fillRect(8, 6, 112, 108);
  // libros
  let px = 10;
  while (px < 116) {
    if (r() < 0.07) {
      px += 6 + r() * 8; // hueco
      continue;
    }
    const w = 7 + r() * 9;
    if (px + w > 118) break;
    const h = 64 + r() * 40;
    const color = LOMOS[Math.floor(r() * LOMOS.length)];
    const inclinado = r() < 0.08 && px > 20;
    x.save();
    x.translate(px, 114);
    if (inclinado) x.rotate(-0.18);
    x.fillStyle = color;
    x.fillRect(0, -h, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(1, -h, 1.5, h);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(w - 1.5, -h, 1.5, h);
    // franjas del lomo
    x.fillStyle = r() < 0.5 ? 'rgba(255,240,200,0.75)' : 'rgba(255,255,255,0.55)';
    x.fillRect(1.5, -h + 10, w - 3, 2);
    x.fillRect(1.5, -16, w - 3, 2);
    x.restore();
    px += w + 0.8;
  }
  // tabla de la repisa (abajo) y sombra superior
  x.fillStyle = tono(marco, 0.1);
  x.fillRect(0, 114, 128, 14);
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(8, 6, 112, 6);
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

export interface Recursos {
  defs: Map<string, Definicion>;
  claveDe(b: Bloque): string;
  materiales: THREE.Material[];
  liberar(): void;
}

const VARIANTES_REPISA = 4;

export function crearRecursos(): Recursos {
  const defs = new Map<string, Definicion>();
  const materiales: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mat = (opc: THREE.MeshLambertMaterialParameters) => {
    const m = new THREE.MeshLambertMaterial(opc);
    materiales.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G) => (geos.push(g), g);

  const madera = mat({ map: textura(pintarMadera('#D6976A', 3)) });
  const maderaClara = mat({ map: textura(pintarMadera('#E8C9A0', 5, 3)) });
  const maderaAmarilla = mat({ map: textura(pintarMadera('#EBC963', 9)) });
  const cubo = geo(new THREE.BoxGeometry(1, 1, 1));

  // estanterías: el frente (+z) con libros; el resto, madera
  for (let v = 0; v < VARIANTES_REPISA; v++) {
    const frente = mat({ map: textura(pintarRepisa('#C98A5B', v + 1)) });
    defs.set(`estanteria${v}`, { geo: cubo, mat: [madera, madera, madera, madera, frente, madera] });
    const frenteAm = mat({ map: textura(pintarRepisa('#E9C75A', v + 11)) });
    defs.set(`exterior${v}`, { geo: cubo, mat: [maderaAmarilla, maderaAmarilla, maderaAmarilla, maderaAmarilla, frenteAm, maderaAmarilla] });
  }

  defs.set('plataforma', { geo: cubo, mat: maderaClara });
  defs.set('pared', { geo: cubo, mat: mat({ color: '#D9D2DE' }) });

  const escalon1 = new THREE.BoxGeometry(1, 0.5, 0.5).translate(0, -0.25, 0.25);
  const escalon2 = new THREE.BoxGeometry(1, 1, 0.5).translate(0, 0, -0.25);
  defs.set('escalera', { geo: geo(mergeGeometries([escalon1, escalon2])!), mat: maderaClara });
  escalon1.dispose();
  escalon2.dispose();

  const carton = mat({ map: textura(pintarCarton()) });
  for (let v = 0; v < 2; v++) {
    const arriba = mat({ map: textura(pintarCajaArriba(v + 1)) });
    defs.set(`caja${v}`, {
      geo: geo(new THREE.BoxGeometry(0.94, 0.55, 0.94).translate(0, -0.225, 0)),
      mat: [carton, carton, arriba, carton, carton, carton],
    });
  }

  const mostradorLado = mat({ map: textura(pintarMostrador(false)) });
  const mostradorArriba = mat({ map: textura(pintarMostrador(true)) });
  defs.set('mostrador', {
    geo: geo(new THREE.BoxGeometry(1, 0.9, 1).translate(0, -0.05, 0)),
    mat: [mostradorLado, mostradorLado, mostradorArriba, mostradorLado, mostradorLado, mostradorLado],
  });

  // ambas sin índice: mergeGeometries exige que coincidan
  const maceta = new THREE.CylinderGeometry(0.22, 0.17, 0.36, 14).translate(0, -0.32, 0).toNonIndexed();
  const hojas = new THREE.IcosahedronGeometry(0.33, 1).translate(0, 0.08, 0);
  defs.set('planta', {
    geo: geo(mergeGeometries([maceta, hojas], true)!),
    mat: [mat({ color: '#E8A07E' }), mat({ color: '#7CC49A', flatShading: true })],
  });
  maceta.dispose();
  hojas.dispose();

  return {
    defs,
    materiales,
    claveDe(b) {
      const h = ((b.x * 73856093) ^ (b.y * 19349663) ^ (b.z * 83492791)) >>> 0;
      if (b.tipo === 'estanteria' || b.tipo === 'exterior') return `${b.tipo}${h % VARIANTES_REPISA}`;
      if (b.tipo === 'caja') return `caja${h % 2}`;
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

export const TIPOS_CON_TINTE: TipoBloque[] = ['estanteria', 'caja', 'exterior'];
