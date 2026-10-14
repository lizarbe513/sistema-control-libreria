// Escena 3D de la tienda, compartida por el editor y el visor de ubicación.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TIPOS_CON_TINTE, crearRecursos, pintarMadera, type Recursos } from './bloques';
import { FRENTE, type Bloque, type Tienda } from './modelo';

export type ModoEscena = 'editor' | 'visor';

export interface Apuntado {
  bloque: Bloque | null; // bloque bajo el cursor (para quitar / rotar / info)
  celda: [number, number, number] | null; // celda vacía donde caería un bloque nuevo
}

const ROTACION_Y = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const BLANCO = new THREE.Color('#ffffff');
const APAGADO = new THREE.Color('#F6E9EE');

export class EscenaTienda {
  readonly camara: THREE.PerspectiveCamera;
  readonly controles: OrbitControls;
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private recursos: Recursos;
  private grupo = new THREE.Group();
  private mallas: THREE.InstancedMesh[] = [];
  private pisos: THREE.Mesh[] = [];
  private fijos = new THREE.Group(); // piso, paredes, cuadrícula
  private texturasFijas: THREE.Texture[] = [];
  private raycaster = new THREE.Raycaster();
  private tienda: Tienda | null = null;
  private nivel = Infinity;

  private fantasma: THREE.Mesh;
  private resalte: THREE.Group;
  private pin: THREE.Group;
  private objetivo: { malla: THREE.InstancedMesh; idx: number; base: THREE.Matrix4 } | null = null;
  private resaltado: { bloque: Bloque; estante?: string } | null = null;
  private huellas: THREE.InstancedMesh | null = null;
  private puntosRuta: THREE.Vector3[] = [];
  private vuelo: { pos: THREE.Vector3; mira: THREE.Vector3 } | null = null;

  private raf = 0;
  /** Se dibuja solo cuando algo cambia; las animaciones (resalte, ruta, vuelo) piden cuadros continuos. */
  private sucio = true;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private reloj = 0;
  private aux = new THREE.Matrix4();
  private auxQ = new THREE.Quaternion();
  private auxV = new THREE.Vector3();
  private auxE = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    private contenedor: HTMLElement,
    private modo: ModoEscena,
    rendimiento = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !rendimiento });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendimiento ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.recursos = crearRecursos();

    this.camara = new THREE.PerspectiveCamera(modo === 'editor' ? 45 : 40, 1, 0.1, 400);
    this.controles = new OrbitControls(this.camara, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.12;
    this.controles.maxPolarAngle = Math.PI * 0.47;
    this.controles.minDistance = 4;
    this.controles.maxDistance = 90;
    if (modo === 'editor') {
      this.controles.mouseButtons = {
        LEFT: null as unknown as THREE.MOUSE, // el clic izquierdo coloca bloques
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    } else {
      this.controles.enablePan = false;
      this.controles.maxDistance = 60;
    }
    this.controles.addEventListener('start', () => (this.vuelo = null));
    this.controles.addEventListener('change', () => (this.sucio = true));

    this.escena.add(new THREE.HemisphereLight(0xfff6f8, 0xe9c8b4, 2.1));
    const sol = new THREE.DirectionalLight(0xfff1e0, 1.5);
    sol.position.set(-12, 30, 22);
    this.escena.add(sol);
    const relleno = new THREE.DirectionalLight(0xffd3e0, 0.5);
    relleno.position.set(20, 8, -10);
    this.escena.add(relleno);
    this.escena.add(this.fijos, this.grupo);

    // fantasma del editor
    this.fantasma = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: '#F27A9B', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.fantasma.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(this.fantasma.geometry), new THREE.LineBasicMaterial({ color: '#ffffff' })),
    );
    this.fantasma.visible = false;
    this.escena.add(this.fantasma);

    // resalte del bloque buscado: caja brillante + bordes
    this.resalte = new THREE.Group();
    const geoR = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    this.resalte.add(new THREE.Mesh(geoR, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false })));
    this.resalte.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoR), new THREE.LineBasicMaterial({ color: '#ffffff' })));
    this.resalte.visible = false;
    this.escena.add(this.resalte);

    // pin flotante sobre el bloque buscado
    this.pin = new THREE.Group();
    const matPin = new THREE.MeshLambertMaterial({ color: '#F27A9B', emissive: '#F27A9B', emissiveIntensity: 0.35 });
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), matPin);
    cabeza.position.y = 0.55;
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), matPin);
    punta.rotation.x = Math.PI;
    punta.position.y = 0.2;
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    ojo.position.set(0, 0.55, 0.22);
    this.pin.add(cabeza, punta, ojo);
    this.pin.visible = false;
    this.escena.add(this.pin);

    this.ro = new ResizeObserver(() => this.ajustar());
    this.ro.observe(contenedor);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(contenedor);
    this.ajustar();

    let ultimo = performance.now();
    const bucle = (ahora: number) => {
      this.raf = requestAnimationFrame(bucle);
      const dt = Math.min(0.05, (ahora - ultimo) / 1000);
      ultimo = ahora;
      if (!this.visible || document.hidden) return;
      this.paso(dt);
      if (!this.sucio && !this.animando()) return;
      this.sucio = false;
      this.renderer.render(this.escena, this.camara);
    };
    this.raf = requestAnimationFrame(bucle);
  }

  private animando() {
    return !!this.vuelo || this.resalte.visible || !!this.huellas;
  }

  private ajustar() {
    this.sucio = true;
    const w = this.contenedor.clientWidth;
    const h = this.contenedor.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  // ───────────── construcción ─────────────

  /** Reconstruye la escena con los bloques (y opcionalmente oculta los que están sobre `nivel`). */
  cargar(t: Tienda, nivel = Infinity) {
    this.sucio = true;
    const cambiaTamano = !this.tienda || this.tienda.ancho !== t.ancho || this.tienda.fondo !== t.fondo || this.tienda.fachada !== t.fachada;
    this.tienda = t;
    this.nivel = nivel;
    if (cambiaTamano) {
      this.construirFijos(t);
      this.vistaGeneral(true);
    }

    for (const m of this.mallas) {
      this.grupo.remove(m);
      m.dispose();
    }
    this.mallas = [];
    this.objetivo = null;

    const grupos = new Map<string, Bloque[]>();
    for (const b of t.bloques) {
      if (b.y > nivel) continue;
      const k = this.recursos.claveDe(b);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(b);
    }
    for (const [k, lista] of grupos) {
      const def = this.recursos.defs.get(k);
      if (!def) continue;
      const malla = new THREE.InstancedMesh(def.geo, def.mat, lista.length);
      malla.userData.bloques = lista;
      lista.forEach((b, i) => {
        this.matrizDe(b, 1, this.aux);
        malla.setMatrixAt(i, this.aux);
      });
      malla.setColorAt(0, BLANCO); // crea instanceColor
      this.mallas.push(malla);
      this.grupo.add(malla);
    }
    this.colorear();
    if (this.resaltado) this.resaltar(this.resaltado.bloque, this.resaltado.estante, false);
  }

  private matrizDe(b: Bloque, escala: number, m: THREE.Matrix4) {
    this.auxQ.setFromAxisAngle(this.auxE.set(0, 1, 0), ROTACION_Y[b.rot] ?? 0);
    return m.compose(this.auxV.set(b.x + 0.5, b.y + 0.5, b.z + 0.5), this.auxQ, new THREE.Vector3(escala, escala, escala));
  }

  private colorear() {
    const t = this.tienda;
    if (!t) return;
    const colores = new Map(t.estantes.map((e) => [e.id, new THREE.Color(e.color)]));
    const foco = this.resaltado?.estante;
    const c = new THREE.Color();
    for (const malla of this.mallas) {
      const lista: Bloque[] = malla.userData.bloques;
      lista.forEach((b, i) => {
        c.copy(BLANCO);
        if (b.estante && TIPOS_CON_TINTE.includes(b.tipo)) {
          const tinte = colores.get(b.estante);
          if (tinte) c.lerp(tinte, b.tipo === 'estanteria' ? 0.75 : 0.45);
        }
        if (foco && b.estante !== foco) c.multiplyScalar(0.8).lerp(APAGADO, 0.5);
        malla.setColorAt(i, c);
      });
      if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    }
  }

  private construirFijos(t: Tienda) {
    for (const o of [...this.fijos.children]) {
      this.fijos.remove(o);
      o.traverse((h) => {
        if (h instanceof THREE.Mesh || h instanceof THREE.LineSegments) {
          h.geometry.dispose();
          (h.material as THREE.Material).dispose();
        }
      });
    }
    for (const tx of this.texturasFijas) tx.dispose();
    this.texturasFijas = [];
    this.pisos = [];

    // piso de madera (interior)
    const txPiso = new THREE.CanvasTexture(pintarMadera('#F3DCC6', 21, 4));
    txPiso.colorSpace = THREE.SRGBColorSpace;
    txPiso.wrapS = txPiso.wrapT = THREE.RepeatWrapping;
    txPiso.repeat.set(t.ancho / 2, t.fachada / 2);
    this.texturasFijas.push(txPiso);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(t.ancho, t.fachada), new THREE.MeshLambertMaterial({ map: txPiso }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(t.ancho / 2, 0, t.fachada / 2);
    // vereda
    const fondoVereda = t.fondo - t.fachada;
    const txVereda = this.texturaVereda();
    txVereda.repeat.set(t.ancho / 2, fondoVereda / 2);
    this.texturasFijas.push(txVereda);
    const vereda = new THREE.Mesh(new THREE.PlaneGeometry(t.ancho + 4, fondoVereda), new THREE.MeshLambertMaterial({ map: txVereda }));
    vereda.rotation.x = -Math.PI / 2;
    vereda.position.set(t.ancho / 2, -0.04, t.fachada + fondoVereda / 2);
    this.pisos.push(piso, vereda);
    this.fijos.add(piso, vereda);

    // paredes (solo se ven desde adentro, así no tapan la vista)
    const matPared = new THREE.MeshLambertMaterial({ color: '#FBE6EC' });
    const alto = Math.min(t.alto, 8);
    const pared = (w: number, x: number, z: number, rotY: number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, alto), matPared.clone());
      p.position.set(x, alto / 2, z);
      p.rotation.y = rotY;
      this.fijos.add(p);
    };
    pared(t.ancho, t.ancho / 2, 0, 0);
    pared(t.fachada, 0, t.fachada / 2, Math.PI / 2);
    pared(t.fachada, t.ancho, t.fachada / 2, -Math.PI / 2);
    matPared.dispose();
    // zócalo de la fachada (línea de la entrada)
    const linea = new THREE.Mesh(
      new THREE.BoxGeometry(t.ancho, 0.06, 0.12),
      new THREE.MeshLambertMaterial({ color: '#F7B3C5' }),
    );
    linea.position.set(t.ancho / 2, 0.03, t.fachada);
    this.fijos.add(linea);

    if (this.modo === 'editor') {
      const pts: number[] = [];
      for (let x = 0; x <= t.ancho; x++) pts.push(x, 0.01, 0, x, 0.01, t.fondo);
      for (let z = 0; z <= t.fondo; z++) pts.push(0, 0.01, z, t.ancho, 0.01, z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.fijos.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#E7A9BB', transparent: true, opacity: 0.35 })));
    }
  }

  private texturaVereda() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#E6E0E6';
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = '#D3CAD3';
    x.lineWidth = 2;
    x.strokeRect(1, 1, 62, 62);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // ───────────── cámara ─────────────

  vistaGeneral(inmediato = false) {
    const t = this.tienda;
    if (!t) return;
    const mira = new THREE.Vector3(t.ancho / 2, 0, t.fondo / 2 - 1);
    const pos = new THREE.Vector3(t.ancho / 2 + 2, t.ancho * 0.85, t.fondo + t.ancho * 0.5);
    this.irA(pos, mira, inmediato);
  }

  vistaPlanta() {
    const t = this.tienda;
    if (!t) return;
    this.irA(new THREE.Vector3(t.ancho / 2, Math.max(t.ancho, t.fondo) * 1.45, t.fondo / 2 + 0.6), new THREE.Vector3(t.ancho / 2, 0, t.fondo / 2), false);
  }

  /** Lleva la cámara frente al bloque, a una distancia cómoda. */
  volarA(b: Bloque) {
    const [fx, fz] = FRENTE[b.rot] ?? [0, 1];
    const mira = new THREE.Vector3(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    const lado = new THREE.Vector3(fz, 0, -fx).multiplyScalar(2.2);
    const pos = mira.clone().add(new THREE.Vector3(fx * 14, 8.5, fz * 14)).add(lado);
    pos.y = Math.max(pos.y, 3);
    this.irA(pos, mira, false);
  }

  private irA(pos: THREE.Vector3, mira: THREE.Vector3, inmediato: boolean) {
    if (inmediato) {
      this.camara.position.copy(pos);
      this.controles.target.copy(mira);
      this.controles.update();
      this.vuelo = null;
    } else this.vuelo = { pos, mira };
  }

  // ───────────── resalte y ruta ─────────────

  resaltar(b: Bloque | null, estante?: string, volar = true) {
    this.sucio = true;
    if (this.objetivo) {
      this.objetivo.malla.setMatrixAt(this.objetivo.idx, this.objetivo.base);
      this.objetivo.malla.instanceMatrix.needsUpdate = true;
      this.objetivo = null;
    }
    this.resaltado = b ? { bloque: b, estante } : null;
    this.colorear();
    this.resalte.visible = this.pin.visible = !!b;
    if (!b) return;

    for (const malla of this.mallas) {
      const idx = (malla.userData.bloques as Bloque[]).findIndex((o) => o.x === b.x && o.y === b.y && o.z === b.z);
      if (idx >= 0) {
        const base = new THREE.Matrix4();
        malla.getMatrixAt(idx, base);
        this.objetivo = { malla, idx, base };
        break;
      }
    }
    const fuerte = this.tienda?.estantes.find((e) => e.id === estante)?.fuerte ?? '#F27A9B';
    ((this.resalte.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(fuerte);
    this.resalte.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    const [fx, fz] = FRENTE[b.rot] ?? [0, 1];
    this.pin.position.set(b.x + 0.5 + fx * 0.9, b.y + 1.15, b.z + 0.5 + fz * 0.9);
    this.pin.userData.base = b.y + 1.15;
    const matPin = (this.pin.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    matPin.color.set(fuerte);
    matPin.emissive.set(fuerte);
    if (volar) this.volarA(b);
  }

  /** Huellitas desde la vereda hasta el estante. */
  mostrarRuta(celdas: [number, number][]) {
    this.sucio = true;
    if (this.huellas) {
      this.escena.remove(this.huellas);
      this.huellas.geometry.dispose();
      (this.huellas.material as THREE.Material).dispose();
      this.huellas = null;
    }
    this.puntosRuta = [];
    if (celdas.length < 2) return;
    for (let i = 0; i < celdas.length - 1; i++) {
      const [ax, az] = celdas[i];
      const [bx, bz] = celdas[i + 1];
      for (const f of [0, 0.5]) this.puntosRuta.push(new THREE.Vector3(ax + 0.5 + (bx - ax) * f, 0.03, az + 0.5 + (bz - az) * f));
    }
    const [ux, uz] = celdas[celdas.length - 1];
    this.puntosRuta.push(new THREE.Vector3(ux + 0.5, 0.03, uz + 0.5));
    const geo = new THREE.CircleGeometry(0.14, 14).rotateX(-Math.PI / 2);
    this.huellas = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#F27A9B', transparent: true, opacity: 0.9 }), this.puntosRuta.length);
    this.escena.add(this.huellas);
  }

  // ───────────── editor ─────────────

  apuntar(clientX: number, clientY: number): Apuntado {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camara);
    const hit = this.raycaster.intersectObjects([...this.mallas, ...this.pisos], false)[0];
    if (!hit) return { bloque: null, celda: null };
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const bloque = (hit.object.userData.bloques as Bloque[])[hit.instanceId];
      // la celda nueva es la vecina por la cara apuntada (normal girada según la rotación del bloque)
      const n = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ROTACION_Y[bloque.rot] ?? 0);
      const ax = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 0 : Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2;
      const celda: [number, number, number] = [bloque.x, bloque.y, bloque.z];
      celda[ax] += Math.sign(n.getComponent(ax)) || 1;
      return { bloque, celda };
    }
    return { bloque: null, celda: [Math.floor(hit.point.x), 0, Math.floor(hit.point.z)] };
  }

  /** Fantasma de una celda, o de la caja entre dos esquinas `celda` y `hasta` (modo relleno). */
  fijarFantasma(celda: [number, number, number] | null, color = '#F27A9B', borrar = false, hasta?: [number, number, number]) {
    this.sucio = true;
    this.fantasma.visible = !!celda;
    if (!celda) return;
    const b = hasta ?? celda;
    const min = [0, 1, 2].map((i) => Math.min(celda[i], b[i]));
    const max = [0, 1, 2].map((i) => Math.max(celda[i], b[i]));
    this.fantasma.scale.set(max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1);
    this.fantasma.position.set((min[0] + max[0] + 1) / 2, (min[1] + max[1] + 1) / 2, (min[2] + max[2] + 1) / 2);
    const m = this.fantasma.material as THREE.MeshBasicMaterial;
    m.color.set(borrar ? '#E0607A' : color);
    m.opacity = borrar ? 0.5 : 0.35;
  }

  // ───────────── animación ─────────────

  private paso(dt: number) {
    this.reloj += dt;
    const t = this.reloj;
    if (this.vuelo) {
      const k = 1 - Math.exp(-3.2 * dt);
      this.camara.position.lerp(this.vuelo.pos, k);
      this.controles.target.lerp(this.vuelo.mira, k);
      if (this.camara.position.distanceTo(this.vuelo.pos) < 0.05) this.vuelo = null;
    }
    this.controles.update();

    if (this.objetivo) {
      const s = 1 + Math.sin(t * 5) * 0.05;
      const b = this.resaltado!.bloque;
      this.objetivo.malla.setMatrixAt(this.objetivo.idx, this.matrizDe(b, s, this.aux));
      this.objetivo.malla.instanceMatrix.needsUpdate = true;
    }
    if (this.resalte.visible) {
      const m = (this.resalte.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.18 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.3;
      this.resalte.scale.setScalar(1 + Math.sin(t * 5) * 0.04);
    }
    if (this.pin.visible) {
      this.pin.position.y = this.pin.userData.base + Math.sin(t * 3) * 0.15;
      this.pin.rotation.y = t * 1.2;
    }
    if (this.huellas) {
      const n = this.puntosRuta.length;
      for (let i = 0; i < n; i++) {
        const onda = Math.max(0, Math.sin(t * 4 - i * 0.45));
        const s = 0.55 + onda * 0.6;
        this.aux.compose(this.puntosRuta[i], this.auxQ.identity(), this.auxV.set(s, 1, s));
        this.huellas.setMatrixAt(i, this.aux);
      }
      this.huellas.instanceMatrix.needsUpdate = true;
    }
  }

  destruir() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.controles.dispose();
    for (const m of this.mallas) m.dispose();
    this.mostrarRuta([]);
    this.escena.traverse((o) => {
      if ((o instanceof THREE.Mesh || o instanceof THREE.LineSegments) && !(o instanceof THREE.InstancedMesh)) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      }
    });
    for (const tx of this.texturasFijas) tx.dispose();
    this.recursos.liberar();
    this.renderer.dispose();
  }
}
