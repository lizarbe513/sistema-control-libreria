// La bibliotecaria: figura procedural de 3 bloques de alto (≈ 1,5 m), con paso, respiración y salto.
import * as THREE from 'three';
import { pintarCartel } from './bloques';

export interface Avatar {
  grupo: THREE.Group;
  /** Cuerpo sin el cartel del nombre (se oculta en primera persona). */
  cuerpo: THREE.Group;
  animar(dt: number, rapidez: number, enAire: boolean): void;
  liberar(): void;
}

export function crearAvatar(nombre: string): Avatar {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group();
  grupo.add(cuerpo);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.push(m);
    return m;
  };
  const malla = <G extends THREE.BufferGeometry>(g: G, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geos.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  };

  const piel = mat('#F6D5C0');
  const vestido = mat('#F27A9B');
  const blusa = mat('#FFF4F7');
  const pelo = mat('#5A3A3A');
  const zapato = mat('#8A4B5E');
  const oscuro = mat('#3D2A33');

  // piernas (pivote en la cadera)
  const pierna = (lado: number) => {
    const p = new THREE.Group();
    p.position.set(lado * 0.13, 0.85, 0);
    p.add(malla(new THREE.CylinderGeometry(0.085, 0.075, 0.7, 10), piel, 0, -0.35, 0));
    p.add(malla(new THREE.BoxGeometry(0.2, 0.13, 0.32), zapato, 0, -0.76, 0.05));
    cuerpo.add(p);
    return p;
  };
  const piernaIzq = pierna(-1);
  const piernaDer = pierna(1);

  // vestido, torso y cuello
  cuerpo.add(malla(new THREE.CylinderGeometry(0.2, 0.4, 0.7, 20), vestido, 0, 1.15, 0));
  cuerpo.add(malla(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 16), blusa, 0, 1.75, 0));
  cuerpo.add(malla(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 16), vestido, 0, 1.52, 0)); // cinturón
  cuerpo.add(malla(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), piel, 0, 2.05, 0));
  // mandil
  cuerpo.add(malla(new THREE.BoxGeometry(0.28, 0.5, 0.02), blusa, 0, 1.25, 0.37));

  // brazos (pivote en el hombro)
  const brazo = (lado: number) => {
    const b = new THREE.Group();
    b.position.set(lado * 0.3, 1.95, 0);
    b.add(malla(new THREE.CylinderGeometry(0.06, 0.055, 0.62, 8), blusa, 0, -0.3, 0));
    b.add(malla(new THREE.SphereGeometry(0.07, 10, 8), piel, 0, -0.66, 0));
    cuerpo.add(b);
    return b;
  };
  const brazoIzq = brazo(-1);
  const brazoDer = brazo(1);

  // cabeza
  const cabeza = new THREE.Group();
  cabeza.position.set(0, 2.45, 0);
  cuerpo.add(cabeza);
  cabeza.add(malla(new THREE.SphereGeometry(0.38, 20, 16), piel));
  cabeza.add(malla(new THREE.SphereGeometry(0.4, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), pelo, 0, 0.03, -0.04)); // pelo
  cabeza.add(malla(new THREE.SphereGeometry(0.15, 12, 10), pelo, 0, 0.42, -0.12)); // moño
  cabeza.add(malla(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), pelo, 0, 0.05, 0.02).translateY(0.02));
  const ojos: THREE.Mesh[] = [];
  for (const lado of [-1, 1]) {
    const ojo = malla(new THREE.SphereGeometry(0.035, 8, 6), oscuro, lado * 0.13, 0.0, 0.35);
    ojos.push(ojo);
    cabeza.add(ojo);
    cabeza.add(malla(new THREE.TorusGeometry(0.095, 0.012, 6, 18), mat('#E9B949'), lado * 0.13, 0.0, 0.365)); // lentes
    cabeza.add(malla(new THREE.SphereGeometry(0.05, 8, 6), mat('#F7A1B7'), lado * 0.21, -0.1, 0.3).translateZ(0.02)); // mejillas
  }
  cabeza.add(malla(new THREE.BoxGeometry(0.06, 0.012, 0.012), mat('#E9B949'), 0, 0.0, 0.375));
  const sonrisa = malla(new THREE.TorusGeometry(0.06, 0.011, 6, 12, Math.PI), mat('#C0392B'), 0, -0.12, 0.355);
  sonrisa.rotation.z = Math.PI;
  cabeza.add(sonrisa);

  // cartel con el nombre
  const tx = new THREE.CanvasTexture(pintarCartel(nombre || 'Rosa', '#F27A9B'));
  tx.colorSpace = THREE.SRGBColorSpace;
  const cartel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
  cartel.renderOrder = 13;
  cartel.scale.set(0.95, 0.42, 1);
  cartel.position.y = 3.3;
  grupo.add(cartel);

  let t = 0;
  let parpadeo = 3;
  return {
    grupo,
    cuerpo,
    animar(dt, rapidez, enAire) {
      t += dt * (4 + rapidez * 2.2);
      const k = Math.min(1, rapidez / 4.4);
      const balanceo = Math.sin(t) * 0.75 * k;
      piernaIzq.rotation.x = enAire ? -0.5 : balanceo;
      piernaDer.rotation.x = enAire ? 0.4 : -balanceo;
      brazoIzq.rotation.x = enAire ? -2.4 : -balanceo * 0.9;
      brazoDer.rotation.x = enAire ? -2.4 : balanceo * 0.9;
      brazoIzq.rotation.z = enAire ? 0.5 : 0.06;
      brazoDer.rotation.z = enAire ? -0.5 : -0.06;
      // respira en reposo y rebota un poco al caminar
      const rebote = Math.abs(Math.sin(t)) * 0.06 * k;
      cuerpo.position.y = rebote;
      cuerpo.scale.y = 1 + Math.sin(performance.now() / 600) * 0.008 * (1 - k);
      cabeza.rotation.z = Math.sin(t * 0.5) * 0.04 * k;
      // parpadeo
      parpadeo -= dt;
      const cerrado = parpadeo < 0.12 && parpadeo > 0;
      for (const o of ojos) o.scale.y = cerrado ? 0.1 : 1;
      if (parpadeo <= 0) parpadeo = 2 + Math.random() * 3;
    },
    liberar() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      tx.dispose();
      (cartel.material as THREE.Material).dispose();
    },
  };
}
