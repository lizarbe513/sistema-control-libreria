// Escena 3D de la tienda, compartida por el editor y el visor de ubicación.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { spriteBrillo } from '../fondo/sprites';
import { BRILLOS, TIPOS_CON_TINTE, crearRecursos, familiaDe, pintarCartel, pintarMadera, type Pieza, type Recursos } from './bloques';
import { FRENTE, clave, columnas, iniciosDeTramo, letraDe, tablasDe, tipoDeEstante, type Bloque, type Tienda } from './modelo';

export type ModoEscena = 'editor' | 'visor';
export type Celda = [number, number, number];
export type Caja = { min: Celda; max: Celda };

export interface Apuntado {
  bloque: Bloque | null; // bloque bajo el cursor (para quitar / rotar / seleccionar)
  celda: Celda | null; // celda vacía donde caería un bloque nuevo (vecina por la cara apuntada)
  normal: Celda | null; // normal de la cara apuntada (mundo, redondeada)
  marco: Caja | null; // contorno a dibujar (bloque entero, o cuadro del piso / pared)
  local: Celda | null; // punto tocado en coordenadas locales del bloque (-0.5..0.5; +z = frente)
}

const ROTACION_Y = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const BLANCO = new THREE.Color('#ffffff');
const APAGADO = new THREE.Color('#F6E9EE');
const VACIO: Apuntado = { bloque: null, celda: null, normal: null, marco: null, local: null };

export class EscenaTienda {
  readonly camara: THREE.PerspectiveCamera;
  readonly controles: OrbitControls;
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private recursos: Recursos;
  private grupo = new THREE.Group();
  private mallas: THREE.InstancedMesh[] = [];
  private extras = new THREE.Group(); // carteles y halos (se rehacen en cada carga)
  private etiquetas = new THREE.Group(); // números de tramo / repisa mientras se organiza un estante
  private superficies: THREE.Mesh[] = []; // piso, vereda y paredes (apuntables)
  private fijos = new THREE.Group();
  private texturasFijas: THREE.Texture[] = [];
  private texturaHalo: THREE.Texture;
  private raycaster = new THREE.Raycaster();
  private tienda: Tienda | null = null;
  private nivel = Infinity;

  private cursor: THREE.LineSegments;
  private cursorRelleno: THREE.Mesh;
  private seleccion: THREE.LineSegments;
  private resalte: THREE.Group;
  private pin: THREE.Group;
  private resaltado: { bloques: Bloque[]; estante?: string } | null = null;
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
  private uno = new THREE.Vector3(1, 1, 1);

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
    this.texturaHalo = new THREE.CanvasTexture(spriteBrillo());

    this.camara = new THREE.PerspectiveCamera(modo === 'editor' ? 45 : 40, 1, 0.1, 400);
    this.controles = new OrbitControls(this.camara, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.12;
    this.controles.maxPolarAngle = Math.PI * 0.47;
    this.controles.minDistance = 4;
    this.controles.maxDistance = 90;
    if (modo === 'editor') {
      this.controles.mouseButtons = {
        LEFT: null as unknown as THREE.MOUSE, // el clic izquierdo construye
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    } else {
      this.controles.enablePan = false;
      this.controles.maxDistance = 60;
    }
    if (modo === 'editor') {
      // Shift + rueda: sube o baja el punto de vista (útil para recorrer la parte alta)
      canvas.addEventListener(
        'wheel',
        (e) => {
          if (!e.shiftKey) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.moverVertical(-Math.sign(e.deltaY) * 0.8);
        },
        { capture: true, passive: false },
      );
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
    this.escena.add(this.fijos, this.grupo, this.extras, this.etiquetas);

    // contorno del cursor (como en Minecraft) + caja tenue del relleno
    const aristas = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.cursor = new THREE.LineSegments(aristas, new THREE.LineBasicMaterial({ color: '#3D2A33', transparent: true, opacity: 0.8, depthTest: false }));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.cursorRelleno = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#F27A9B', transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.cursorRelleno.visible = false;
    this.seleccion = new THREE.LineSegments(aristas.clone(), new THREE.LineBasicMaterial({ color: '#F27A9B', depthTest: false, transparent: true }));
    this.seleccion.renderOrder = 9;
    this.seleccion.visible = false;
    this.escena.add(this.cursor, this.cursorRelleno, this.seleccion);

    // resalte del compartimento buscado: caja brillante + bordes
    this.resalte = new THREE.Group();
    const geoR = new THREE.BoxGeometry(1, 1, 1);
    this.resalte.add(new THREE.Mesh(geoR, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false })));
    this.resalte.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoR), new THREE.LineBasicMaterial({ color: '#ffffff' })));
    this.resalte.visible = false;
    this.escena.add(this.resalte);

    // pin flotante frente al compartimento
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
    const cambiaTamano =
      !this.tienda || this.tienda.ancho !== t.ancho || this.tienda.fondo !== t.fondo || this.tienda.fachada !== t.fachada || this.tienda.alto !== t.alto;
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
    this.limpiarExtras();

    const visibles = t.bloques.filter((b) => b.y <= nivel);
    const grupos = new Map<string, Bloque[]>();
    const agregar = (k: string, b: Bloque) => {
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(b);
    };
    for (const b of visibles) agregar(this.recursos.claveDe(b), b);
    for (const [k, b] of this.piezasConectadas(t, visibles)) agregar(k, b);

    for (const [k, lista] of grupos) {
      const def = this.recursos.defs.get(k) ?? this.recursos.piezas.get(k);
      if (!def) continue;
      const malla = new THREE.InstancedMesh(def.geo, def.mat, lista.length);
      malla.userData.bloques = lista;
      malla.userData.marco = k.includes(':marco');
      lista.forEach((b, i) => malla.setMatrixAt(i, this.matrizDe(b, this.aux)));
      malla.setColorAt(0, BLANCO); // crea instanceColor
      this.mallas.push(malla);
      this.grupo.add(malla);
    }
    this.colorear();
    this.ponerCarteles(t, visibles);
    this.ponerHalos(visibles);
    if (this.resaltado) this.resaltar(this.resaltado.bloques, this.resaltado.estante, false);
  }

  /**
   * Piezas de marco según los vecinos («connected textures»): el marco va solo donde termina el estante;
   * los divisores marcan el inicio de cada tramo y las tablas las fronteras entre repisas.
   */
  private piezasConectadas(t: Tienda, visibles: Bloque[]): [string, Bloque][] {
    const idx = new Map(visibles.map((b) => [clave(b.x, b.y, b.z), b]));
    const mismo = (b: Bloque, x: number, y: number, z: number) => {
      const o = idx.get(clave(x, y, z));
      return !!o && o.estante === b.estante && o.rot === b.rot && o.tipo === b.tipo;
    };
    const divisiones = new Map<string, { inicios: Set<string>; tabla: (x: number, y: number, z: number) => boolean }>();
    for (const e of t.estantes) {
      const tipo = tipoDeEstante(t, e.id);
      if (!tipo || !familiaDe(tipo)) continue;
      divisiones.set(e.id, { inicios: iniciosDeTramo(e, columnas(t, e.id), tipo), tabla: tablasDe(e, t, tipo) });
    }
    const salida: [string, Bloque][] = [];
    for (const b of visibles) {
      const fam = familiaDe(b.tipo);
      if (!fam || !b.estante) continue;
      const [fx, fz] = FRENTE[b.rot] ?? [0, 1];
      const [rx, rz] = [fz, -fx];
      const div = divisiones.get(b.estante);
      const pon = (p: Pieza) => salida.push([`${fam}:${p}`, b]);
      const izq = mismo(b, b.x - rx, b.y, b.z - rz);
      if (!izq) pon('marcoIzq');
      else if (div?.inicios.has(`${b.x},${b.z}`)) pon('divisor');
      if (!mismo(b, b.x + rx, b.y, b.z + rz)) pon('marcoDer');
      const arriba = mismo(b, b.x, b.y + 1, b.z);
      if (!arriba) pon('marcoArr');
      else if (div?.tabla(b.x, b.y, b.z)) pon('tabla');
      if (!mismo(b, b.x, b.y - 1, b.z)) pon('marcoAbj');
    }
    return salida;
  }

  private matrizDe(b: Bloque, m: THREE.Matrix4) {
    this.auxQ.setFromAxisAngle(this.auxE.set(0, 1, 0), ROTACION_Y[b.rot] ?? 0);
    return m.compose(this.auxV.set(b.x + 0.5, b.y + 0.5, b.z + 0.5), this.auxQ, this.uno);
  }

  private colorear() {
    const t = this.tienda;
    if (!t) return;
    const pastel = new Map(t.estantes.map((e) => [e.id, new THREE.Color(e.color)]));
    const fuerte = new Map(t.estantes.map((e) => [e.id, new THREE.Color(e.fuerte)]));
    const foco = this.resaltado?.estante;
    const c = new THREE.Color();
    for (const malla of this.mallas) {
      const lista: Bloque[] = malla.userData.bloques;
      const esMarco = malla.userData.marco;
      lista.forEach((b, i) => {
        c.copy(BLANCO);
        if (b.estante && esMarco) {
          // el marco exterior lleva el color fuerte del estante: así se distinguen los vecinos
          const f = fuerte.get(b.estante);
          if (f) c.lerp(f, 0.62);
        } else if (b.estante && TIPOS_CON_TINTE.includes(b.tipo)) {
          const p = pastel.get(b.estante);
          if (p) c.lerp(p, b.tipo === 'estanteria' ? 0.35 : 0.45);
        }
        if (foco && b.estante !== foco) c.multiplyScalar(0.8).lerp(APAGADO, 0.5);
        malla.setColorAt(i, c);
      });
      if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    }
  }

  private limpiarExtras() {
    for (const o of [...this.extras.children]) {
      this.extras.remove(o);
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.dispose();
      } else if (o instanceof THREE.Sprite) o.material.dispose();
    }
  }

  /** Cartel con el nombre del estante, sobre su columna central y su fila más alta. */
  private ponerCarteles(t: Tienda, visibles: Bloque[]) {
    for (const e of t.estantes) {
      const bs = visibles.filter((b) => b.estante === e.id && familiaDe(b.tipo));
      if (!bs.length) continue;
      const cols = columnas({ ...t, bloques: bs }, e.id);
      const col = cols[Math.floor((cols.length - 1) / 2)];
      const arriba = col.bloques[0];
      const [fx, fz] = FRENTE[arriba.rot] ?? [0, 1];
      const par = cols.length % 2 === 0 && cols.length > 1;
      const sig = par ? cols[cols.length / 2] : col;
      const tx = new THREE.CanvasTexture(pintarCartel(e.titulo.startsWith('Estante ') ? letraDe(e) : e.titulo, e.fuerte));
      tx.colorSpace = THREE.SRGBColorSpace;
      const ancho = Math.min(1.6, 0.7 + e.titulo.length * 0.03);
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho * 0.44), new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
      placa.position.set((col.x + sig.x) / 2 + 0.5 + fx * 0.5, arriba.y + 1.18, (col.z + sig.z) / 2 + 0.5 + fz * 0.5);
      placa.rotation.y = ROTACION_Y[arriba.rot] ?? 0;
      this.extras.add(placa);
    }
  }

  private ponerHalos(visibles: Bloque[]) {
    for (const b of visibles) {
      const puntos = BRILLOS[b.tipo];
      if (!puntos) continue;
      for (const [lx, ly, lz, tam] of puntos) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.texturaHalo, color: '#FFE3A8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        const p = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ROTACION_Y[b.rot] ?? 0);
        s.position.set(b.x + 0.5 + p.x, b.y + 0.5 + p.y, b.z + 0.5 + p.z);
        s.scale.setScalar(tam);
        this.extras.add(s);
      }
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
    this.superficies = [];

    // piso de madera (interior)
    const txPiso = new THREE.CanvasTexture(pintarMadera('#F3DCC6', 21, 4));
    txPiso.colorSpace = THREE.SRGBColorSpace;
    txPiso.wrapS = txPiso.wrapT = THREE.RepeatWrapping;
    txPiso.repeat.set(t.ancho / 2, t.fachada / 2);
    this.texturasFijas.push(txPiso);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(t.ancho, t.fachada), new THREE.MeshLambertMaterial({ map: txPiso }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(t.ancho / 2, 0, t.fachada / 2);
    piso.userData.normal = [0, 1, 0];
    // vereda
    const fondoVereda = t.fondo - t.fachada;
    const txVereda = this.texturaVereda();
    txVereda.repeat.set(t.ancho / 2, fondoVereda / 2);
    this.texturasFijas.push(txVereda);
    const vereda = new THREE.Mesh(new THREE.PlaneGeometry(t.ancho, fondoVereda), new THREE.MeshLambertMaterial({ map: txVereda }));
    vereda.rotation.x = -Math.PI / 2;
    vereda.position.set(t.ancho / 2, 0, t.fachada + fondoVereda / 2);
    vereda.userData.normal = [0, 1, 0];
    this.superficies.push(piso, vereda);
    this.fijos.add(piso, vereda);

    // paredes: solo se ven desde adentro (no tapan la vista) y se pueden apuntar para colgar adornos
    const alto = t.alto;
    const pared = (w: number, x: number, z: number, rotY: number, normal: Celda) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, alto), new THREE.MeshLambertMaterial({ color: '#FBE6EC' }));
      p.position.set(x, alto / 2, z);
      p.rotation.y = rotY;
      p.userData.normal = normal;
      this.superficies.push(p);
      this.fijos.add(p);
    };
    pared(t.ancho, t.ancho / 2, 0, 0, [0, 0, 1]);
    pared(t.fachada, 0, t.fachada / 2, Math.PI / 2, [1, 0, 0]);
    pared(t.fachada, t.ancho, t.fachada / 2, -Math.PI / 2, [-1, 0, 0]);
    // zócalo de la fachada (línea de la entrada)
    const linea = new THREE.Mesh(new THREE.BoxGeometry(t.ancho, 0.06, 0.12), new THREE.MeshLambertMaterial({ color: '#F7B3C5' }));
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
    const pos = new THREE.Vector3(t.ancho / 2 + 2, Math.max(t.ancho, t.fondo) * 0.95, t.fondo + Math.max(t.ancho, t.fondo) * 0.62);
    this.irA(pos, mira, inmediato);
  }

  vistaPlanta() {
    const t = this.tienda;
    if (!t) return;
    this.irA(new THREE.Vector3(t.ancho / 2, Math.max(t.ancho, t.fondo) * 1.45, t.fondo / 2 + 0.6), new THREE.Vector3(t.ancho / 2, 0, t.fondo / 2), false);
  }

  /** Lleva la cámara frente a un punto que mira hacia `rot`, a una distancia cómoda. */
  volarA(centro: THREE.Vector3, rot: number) {
    const [fx, fz] = FRENTE[rot] ?? [0, 1];
    const lado = new THREE.Vector3(fz, 0, -fx).multiplyScalar(2.2);
    const pos = centro.clone().add(new THREE.Vector3(fx * 14, 8.5, fz * 14)).add(lado);
    pos.y = Math.max(pos.y, 3);
    this.irA(pos, centro.clone(), false);
  }

  /** Espacio + clic derecho: el botón derecho desplaza en lugar de girar (como en Blender). */
  paneo(activo: boolean) {
    this.controles.mouseButtons.RIGHT = activo ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  }

  /** Desplaza cámara y punto de mira sobre el piso (adelante / derecha, en bloques). */
  desplazar(adelante: number, derecha: number) {
    this.vuelo = null;
    const f = new THREE.Vector3();
    this.camara.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) return;
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const d = f.multiplyScalar(adelante).add(r.multiplyScalar(derecha));
    this.camara.position.add(d);
    this.controles.target.add(d);
    this.sucio = true;
  }

  moverVertical(dy: number) {
    this.vuelo = null;
    const y = Math.max(0, Math.min((this.tienda?.alto ?? 10) + 2, this.controles.target.y + dy));
    const d = y - this.controles.target.y;
    this.controles.target.y += d;
    this.camara.position.y += d;
    this.sucio = true;
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

  /** Resalta un compartimento (uno o varios bloques) y atenúa los demás estantes. */
  resaltar(bloques: Bloque[] | null, estante?: string, volar = true) {
    this.sucio = true;
    this.resaltado = bloques?.length ? { bloques, estante } : null;
    this.colorear();
    this.resalte.visible = this.pin.visible = !!this.resaltado;
    if (!bloques?.length) return;

    const { min, max } = limites(bloques);
    const centro = new THREE.Vector3((min[0] + max[0] + 1) / 2, (min[1] + max[1] + 1) / 2, (min[2] + max[2] + 1) / 2);
    const tam = new THREE.Vector3(max[0] - min[0] + 1.1, max[1] - min[1] + 1.1, max[2] - min[2] + 1.1);
    const fuerte = this.tienda?.estantes.find((e) => e.id === estante)?.fuerte ?? '#F27A9B';
    ((this.resalte.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(fuerte);
    this.resalte.position.copy(centro);
    this.resalte.userData.tam = tam;
    this.resalte.scale.copy(tam);
    const rot = bloques[0].rot;
    const [fx, fz] = FRENTE[rot] ?? [0, 1];
    this.pin.position.set(centro.x + fx * (tam.x / 2 + 0.4) * Math.abs(fx), max[1] + 1.15, centro.z + fz * (tam.z / 2 + 0.4) * Math.abs(fz));
    this.pin.userData.base = max[1] + 1.15;
    const matPin = (this.pin.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    matPin.color.set(fuerte);
    matPin.emissive.set(fuerte);
    if (volar) this.volarA(centro, rot);
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
    const hit = this.raycaster.intersectObjects([...this.mallas, ...this.superficies], false)[0];
    if (!hit) return VACIO;

    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const bloque = (hit.object.userData.bloques as Bloque[])[hit.instanceId];
      const giro = ROTACION_Y[bloque.rot] ?? 0;
      const nl = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
      const n = nl.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), giro);
      const ax = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 0 : Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2;
      const normal: Celda = [0, 0, 0];
      normal[ax] = Math.sign(n.getComponent(ax)) || 1;
      const celda: Celda = [bloque.x + normal[0], bloque.y + normal[1], bloque.z + normal[2]];
      const local = hit.point.clone().sub(new THREE.Vector3(bloque.x + 0.5, bloque.y + 0.5, bloque.z + 0.5)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -giro);
      const marco: Caja = { min: [bloque.x, bloque.y, bloque.z], max: [bloque.x + 1, bloque.y + 1, bloque.z + 1] };
      return { bloque, celda, normal, marco, local: [local.x, local.y, local.z] };
    }

    // piso, vereda o pared
    const normal = (hit.object.userData.normal ?? [0, 1, 0]) as Celda;
    const p = hit.point.clone().addScaledVector(new THREE.Vector3(...normal), 0.01);
    const celda: Celda = [Math.floor(p.x), Math.max(0, Math.floor(p.y)), Math.floor(p.z)];
    const min: Celda = [celda[0], celda[1], celda[2]];
    const max: Celda = [celda[0] + 1, celda[1] + 1, celda[2] + 1];
    // el cuadro se pega a la superficie apuntada
    const eje = normal.findIndex((v) => v !== 0);
    const plano = normal[eje] > 0 ? min[eje] : max[eje];
    min[eje] = plano;
    max[eje] = plano;
    return { bloque: null, celda, normal, marco: { min, max }, local: null };
  }

  /** Punto 3D → coordenadas de pantalla (clientX, clientY). */
  proyectar(p: Celda): [number, number] {
    const v = new THREE.Vector3(...p).project(this.camara);
    const r = this.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }

  /** Contorno del cursor sobre una caja (bloque, cuadro del piso o zona del relleno). */
  fijarCursor(caja: Caja | null, modo: 'normal' | 'borrar' | 'relleno' | 'relleno-borrar' = 'normal') {
    this.sucio = true;
    this.cursor.visible = !!caja;
    this.cursorRelleno.visible = !!caja;
    if (!caja) return;
    const e = 0.012;
    const tam = [0, 1, 2].map((i) => Math.max(0.02, caja.max[i] - caja.min[i] + e * 2));
    const centro = [0, 1, 2].map((i) => (caja.min[i] + caja.max[i]) / 2);
    for (const o of [this.cursor, this.cursorRelleno]) {
      o.position.set(centro[0], centro[1], centro[2]);
      o.scale.set(tam[0], tam[1], tam[2]);
    }
    const borrar = modo === 'borrar' || modo === 'relleno-borrar';
    (this.cursor.material as THREE.LineBasicMaterial).color.set(borrar ? '#E0405F' : modo === 'relleno' ? '#C2185B' : '#3D2A33');
    const fill = this.cursorRelleno.material as THREE.MeshBasicMaterial;
    fill.color.set(borrar ? '#E0607A' : modo === 'normal' ? '#FFFFFF' : '#F27A9B');
    fill.opacity = modo === 'normal' ? 0.22 : modo === 'borrar' ? 0.25 : 0.14;
  }

  /** Números flotantes sobre cada compartimento (se quitan con una lista vacía). */
  fijarEtiquetas(lista: { texto: string; bloques: Bloque[]; color: string; activa?: boolean }[]) {
    this.sucio = true;
    for (const o of [...this.etiquetas.children]) {
      this.etiquetas.remove(o);
      const sp = o as THREE.Sprite;
      sp.material.map?.dispose();
      sp.material.dispose();
    }
    for (const it of lista) {
      if (!it.bloques.length) continue;
      const { min, max } = limites(it.bloques);
      const rot = it.bloques[0].rot;
      const [fx, fz] = FRENTE[rot] ?? [0, 1];
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = it.color;
      x.beginPath();
      x.roundRect(4, 4, 152, 56, 28);
      x.fill();
      x.strokeStyle = it.activa ? '#fff' : 'rgba(255,255,255,0.8)';
      x.lineWidth = it.activa ? 7 : 4;
      x.stroke();
      x.fillStyle = '#fff';
      x.font = '800 30px Nunito, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(it.texto, 80, 34);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
      sp.renderOrder = 12;
      sp.scale.set(it.activa ? 1.15 : 0.95, it.activa ? 0.46 : 0.38, 1);
      sp.position.set((min[0] + max[0] + 1) / 2 + fx * 0.62, (min[1] + max[1] + 1) / 2, (min[2] + max[2] + 1) / 2 + fz * 0.62);
      this.etiquetas.add(sp);
    }
  }

  /** Marco del estante elegido con la herramienta Seleccionar. */
  fijarSeleccion(bloques: Bloque[] | null, color = '#F27A9B') {
    this.sucio = true;
    this.seleccion.visible = !!bloques?.length;
    if (!bloques?.length) return;
    const { min, max } = limites(bloques);
    this.seleccion.position.set((min[0] + max[0] + 1) / 2, (min[1] + max[1] + 1) / 2, (min[2] + max[2] + 1) / 2);
    this.seleccion.scale.set(max[0] - min[0] + 1.08, max[1] - min[1] + 1.08, max[2] - min[2] + 1.08);
    (this.seleccion.material as THREE.LineBasicMaterial).color.set(color);
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

    if (this.resalte.visible) {
      const m = (this.resalte.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.18 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.3;
      const tam = this.resalte.userData.tam as THREE.Vector3 | undefined;
      if (tam) this.resalte.scale.copy(tam).multiplyScalar(1 + Math.sin(t * 5) * 0.03);
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
    this.limpiarExtras();
    this.fijarEtiquetas([]);
    this.escena.traverse((o) => {
      if ((o instanceof THREE.Mesh || o instanceof THREE.LineSegments) && !(o instanceof THREE.InstancedMesh)) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      }
    });
    for (const tx of this.texturasFijas) tx.dispose();
    this.texturaHalo.dispose();
    this.recursos.liberar();
    this.renderer.dispose();
  }
}

export function limites(bloques: Bloque[]): { min: Celda; max: Celda } {
  const min: Celda = [Infinity, Infinity, Infinity];
  const max: Celda = [-Infinity, -Infinity, -Infinity];
  for (const b of bloques) {
    min[0] = Math.min(min[0], b.x);
    min[1] = Math.min(min[1], b.y);
    min[2] = Math.min(min[2], b.z);
    max[0] = Math.max(max[0], b.x);
    max[1] = Math.max(max[1], b.y);
    max[2] = Math.max(max[2], b.z);
  }
  return { min, max };
}

