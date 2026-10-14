// Íconos del inventario: cada objeto renderizado en 3D (vista isométrica), así el ícono es lo que se coloca.
import * as THREE from 'three';
import { crearRecursos, familiaDe, type Recursos } from './bloques';
import type { TipoBloque } from './modelo';

const TAM = 112;
const cache = new Map<TipoBloque, string>();

interface Taller {
  renderer: THREE.WebGLRenderer;
  escena: THREE.Scene;
  camara: THREE.OrthographicCamera;
  recursos: Recursos;
}

let taller: Taller | null | false = null;

function abrirTaller(): Taller | null {
  if (taller === false) return null;
  if (taller) return taller;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(TAM, TAM, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const escena = new THREE.Scene();
    escena.add(new THREE.HemisphereLight(0xfff6f8, 0xe9c8b4, 2.2));
    const sol = new THREE.DirectionalLight(0xfff1e0, 1.6);
    sol.position.set(-3, 5, 4);
    escena.add(sol);
    const camara = new THREE.OrthographicCamera(-0.82, 0.82, 0.82, -0.82, 0.1, 20);
    camara.position.set(2.2, 1.8, 3);
    camara.lookAt(0, -0.02, 0);
    taller = { renderer, escena, camara, recursos: crearRecursos() };
    return taller;
  } catch {
    taller = false;
    return null;
  }
}

/** dataURL del ícono de un tipo (o null si no hay WebGL: se usa el emoji). */
export function icono(tipo: TipoBloque): string | null {
  const hecho = cache.get(tipo);
  if (hecho) return hecho;
  const t = abrirTaller();
  if (!t) return null;
  const grupo = new THREE.Group();
  const b = { x: 0, y: 0, z: 0, tipo, rot: 0 };
  const def = t.recursos.defs.get(t.recursos.claveDe(b));
  if (def) grupo.add(new THREE.Mesh(def.geo, def.mat));
  const fam = familiaDe(tipo);
  if (fam) {
    for (const p of ['marcoIzq', 'marcoDer', 'marcoArr', 'marcoAbj'] as const) {
      const pz = t.recursos.piezas.get(`${fam}:${p}`);
      if (pz) grupo.add(new THREE.Mesh(pz.geo, pz.mat));
    }
  }
  // los objetos de pared se ven mejor un poco girados hacia la cámara
  if (tipo === 'flores' || tipo === 'reloj' || tipo === 'cuadro' || tipo === 'letrero' || tipo === 'guirnalda') grupo.position.z = 0.35;
  t.escena.add(grupo);
  t.renderer.render(t.escena, t.camara);
  const url = t.renderer.domElement.toDataURL('image/png');
  t.escena.remove(grupo);
  cache.set(tipo, url);
  return url;
}
