<script lang="ts">
  // La venta en curso, en 3D: una bolsa de papel donde van entrando los libros; con 5 o más ejemplares,
  // la bolsa se va y entra una caja de cartón que se cierra (los libros van empacados adentro).
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { app } from '../estado.svelte';

  let { libros, alto = 170 }: { libros: { color: string; cantidad: number }[]; alto?: number } = $props();

  const MAX_BOLSA = 4;
  let contenedor: HTMLDivElement;
  let colores = $derived(libros.flatMap((l) => Array<string>(l.cantidad).fill(l.color)));
  let ejemplares = $derived(colores.length);
  /** Lo que ve la vendedora, para las pruebas automáticas y los lectores de pantalla. */
  let modo = $derived<'vacia' | 'bolsa' | 'caja'>(ejemplares === 0 ? 'vacia' : ejemplares > MAX_BOLSA ? 'caja' : 'bolsa');

  // estado que el bucle de dibujo lee (no reactivo a propósito)
  let objetivo = { colores: [] as string[], caja: false, animar: true };
  $effect(() => {
    objetivo = { colores: [...colores], caja: ejemplares > MAX_BOLSA, animar: app.calma.animaciones };
  });

  const easeOutBounce = (x: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  };
  const suave = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function texturaKraft(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 300;
    const x = c.getContext('2d')!;
    x.fillStyle = '#d9b27c';
    x.fillRect(0, 0, 256, 300);
    x.strokeStyle = 'rgba(120,80,30,0.10)';
    for (let i = 0; i < 90; i++) {
      x.beginPath();
      const y = Math.random() * 300;
      x.moveTo(0, y);
      x.lineTo(256, y + (Math.random() - 0.5) * 6);
      x.stroke();
    }
    x.fillStyle = '#b4894d';
    x.font = '800 30px sans-serif';
    x.textAlign = 'center';
    x.fillText('SIGLO XXI', 128, 186);
    x.font = '34px sans-serif';
    x.fillText('♥', 128, 232);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  onMount(() => {
    const canvas = document.createElement('canvas');
    contenedor.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camara.position.set(0, 2.4, 7.6);
    camara.lookAt(0, 0.25, 0);
    escena.add(new THREE.HemisphereLight(0xffffff, 0xf3d6dd, 1.25));
    const sol = new THREE.DirectionalLight(0xfff1e0, 1.8);
    sol.position.set(3, 6, 5);
    escena.add(sol);

    const kraft = texturaKraft();
    const matKraft = new THREE.MeshStandardMaterial({ map: kraft, roughness: 0.95, side: THREE.DoubleSide });
    const matInterior = new THREE.MeshStandardMaterial({ color: '#b68d55', roughness: 1, side: THREE.DoubleSide });
    const matAsa = new THREE.MeshStandardMaterial({ color: '#8c6a3a', roughness: 0.8 });
    const cartonMat = new THREE.MeshStandardMaterial({ color: '#c8a06a', roughness: 0.9, side: THREE.DoubleSide });
    const cintaMat = new THREE.MeshStandardMaterial({ color: '#e9d7b5', roughness: 0.6, side: THREE.DoubleSide });
    const geometrias: THREE.BufferGeometry[] = [];
    const geo = <T extends THREE.BufferGeometry>(g: T) => (geometrias.push(g), g);

    // ── bolsa ──
    const W = 1.7;
    const H = 1.55;
    const D = 1.1;
    const bolsa = new THREE.Group();
    const panel = (w: number, h: number, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number]) => {
      const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), mat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      bolsa.add(m);
    };
    panel(W, H, matKraft, [0, 0, D / 2], [0, 0, 0]);
    panel(W, H, matInterior, [0, 0, -D / 2], [0, Math.PI, 0]);
    panel(D, H, matInterior, [-W / 2, 0, 0], [0, -Math.PI / 2, 0]);
    panel(D, H, matInterior, [W / 2, 0, 0], [0, Math.PI / 2, 0]);
    panel(W, D, matInterior, [0, -H / 2, 0], [-Math.PI / 2, 0, 0]);
    for (const z of [D / 2 + 0.01, -D / 2 - 0.01]) {
      const asa = new THREE.Mesh(geo(new THREE.TorusGeometry(0.42, 0.028, 8, 24, Math.PI)), matAsa);
      asa.position.set(0, H / 2 - 0.08, z);
      bolsa.add(asa);
    }
    bolsa.position.y = 0;
    escena.add(bolsa);

    // ── libros dentro de la bolsa ──
    const libros3d: { m: THREE.Mesh; nacio: number; alto: number }[] = [];
    const matsLibro = new Map<string, THREE.MeshStandardMaterial[]>();
    const pagina = new THREE.MeshStandardMaterial({ color: '#fff6e4', roughness: 0.9 });
    const materialesDe = (color: string) => {
      let m = matsLibro.get(color);
      if (!m) {
        const tapa = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const lomo = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), roughness: 0.6 });
        m = [lomo, pagina, pagina, pagina, tapa, tapa];
        matsLibro.set(color, m);
      }
      return m;
    };
    const zDe = (i: number) => -0.36 + i * 0.24;
    function nuevoLibro(i: number, color: string, ahora: number) {
      const alto = 1.75 + i * 0.17;
      const m = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, alto, 0.24)), materialesDe(color));
      m.rotation.set(0, 0.05 * (i % 2 ? 1 : -1), i % 2 ? 0.04 : -0.035);
      bolsa.add(m);
      libros3d.push({ m, nacio: ahora, alto });
    }
    const ubicarLibro = (l: (typeof libros3d)[number], i: number, ahora: number, animar: boolean) => {
      const base = -H / 2 + 0.03 + l.alto / 2;
      const t = animar ? Math.min(1, (ahora - l.nacio) / 650) : 1;
      l.m.position.set(0, base + (1 - easeOutBounce(t)) * 2.6, zDe(i));
    };

    // ── caja de cartón ──
    const CW = 2.3;
    const CH = 1.45;
    const CD = 1.7;
    const caja = new THREE.Group();
    const cuerpo = new THREE.Mesh(geo(new THREE.BoxGeometry(CW, CH, CD)), cartonMat);
    caja.add(cuerpo);
    const solapa = (largo: number, ancho: number) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(largo, ancho)), cartonMat);
      m.rotation.x = -Math.PI / 2; // plana, hacia adelante del pivote
      m.position.z = -ancho / 2;
      g.add(m);
      return { g, m };
    };
    const SF = CD / 2; // solapas largas y cortas se encuentran a la mitad
    const frente = solapa(CW, SF);
    frente.g.position.set(0, CH / 2 + 0.012, CD / 2);
    const atras = solapa(CW, SF);
    atras.g.position.set(0, CH / 2 + 0.012, -CD / 2);
    atras.g.rotation.y = Math.PI;
    // las laterales miran hacia el centro; el pivote gira sobre el eje z
    const lateral = (signo: 1 | -1) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(CW / 2, CD)), cartonMat);
      m.rotation.x = -Math.PI / 2;
      m.position.x = (-signo * CW) / 4;
      g.add(m);
      g.position.set(signo * (CW / 2), CH / 2 + 0.004, 0);
      return g;
    };
    const derecha = lateral(1);
    const izquierda = lateral(-1);
    caja.add(frente.g, atras.g, derecha, izquierda);
    const cinta = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.34, CD + 0.02)), cintaMat);
    cinta.rotation.x = -Math.PI / 2;
    cinta.position.set(0, CH / 2 + 0.03, 0);
    caja.add(cinta);
    caja.position.y = -0.55;
    escena.add(caja);

    // ── bucle ──
    const reloj = new THREE.Clock();
    let bolsaV = 1;
    let cajaV = 0;
    let raf = 0;
    let visible = true;
    let ultimoDibujo = 0;

    function tam() {
      const w = Math.max(120, contenedor.clientWidth);
      renderer.setSize(w, alto, false);
      canvas.style.width = '100%';
      canvas.style.height = `${alto}px`;
      camara.aspect = w / alto;
      camara.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(tam);
    ro.observe(contenedor);
    tam();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(contenedor);

    function cuadro() {
      raf = requestAnimationFrame(cuadro);
      const ahora = performance.now();
      if (!visible || document.hidden) return;
      if (app.calma.rendimiento && ahora - ultimoDibujo < 33) return;
      ultimoDibujo = ahora;
      const dt = Math.min(0.05, reloj.getDelta());
      const t = reloj.elapsedTime;
      const { colores: cs, caja: modoCaja, animar } = objetivo;

      // libros en la bolsa: los últimos que no caben se empacan en la caja
      const aMostrar = cs.slice(0, MAX_BOLSA);
      while (libros3d.length > aMostrar.length) {
        const u = libros3d.pop()!;
        bolsa.remove(u.m);
      }
      aMostrar.forEach((c, i) => {
        if (!libros3d[i]) nuevoLibro(i, c, ahora);
        else if (libros3d[i].m.material !== materialesDe(c)) libros3d[i].m.material = materialesDe(c);
      });
      libros3d.forEach((l, i) => ubicarLibro(l, i, ahora, animar));

      // transición bolsa ↔ caja
      const k = animar ? Math.min(1, dt * 5) : 1;
      bolsaV += ((modoCaja ? 0 : 1) - bolsaV) * k;
      cajaV += ((modoCaja ? 1 : 0) - cajaV) * (animar ? Math.min(1, dt * 3.2) : 1);
      bolsa.position.x = -(1 - bolsaV) * 4.2;
      bolsa.visible = bolsaV > 0.02;
      const aterriza = Math.min(1, cajaV * 1.15);
      caja.position.y = -0.55 + (1 - (animar ? easeOutBounce(aterriza) : aterriza)) * 3.6;
      caja.visible = cajaV > 0.01;
      const abre = 1 - suave(0.5, 0.95, cajaV);
      const ang = abre * 2.1;
      frente.g.rotation.x = ang;
      atras.g.rotation.x = ang;
      derecha.rotation.z = -ang;
      izquierda.rotation.z = ang;
      cinta.visible = abre < 0.02;

      const vaiven = animar ? Math.sin(t * 0.9) * 0.22 : 0;
      bolsa.rotation.y = -0.3 + vaiven;
      caja.rotation.y = -0.4 + vaiven;
      renderer.render(escena, camara);
    }
    cuadro();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      geometrias.forEach((g) => g.dispose());
      [matKraft, matInterior, matAsa, cartonMat, cintaMat, pagina].forEach((m) => m.dispose());
      matsLibro.forEach((ms) => ms.forEach((m) => m.dispose()));
      kraft.dispose();
      renderer.dispose();
      canvas.remove();
    };
  });
</script>

<div class="bolsa" bind:this={contenedor} data-modo={modo} role="img" aria-label={modo === 'caja' ? `Caja con ${ejemplares} libros` : modo === 'bolsa' ? `Bolsa con ${ejemplares} ${ejemplares === 1 ? 'libro' : 'libros'}` : 'Bolsa vacía'}>
  <span class="cuenta" class:vacia={modo === 'vacia'}>{modo === 'caja' ? `📦 ${ejemplares} libros` : modo === 'bolsa' ? `🛍️ ${ejemplares} ${ejemplares === 1 ? 'libro' : 'libros'}` : 'Bolsa vacía'}</span>
</div>

<style>
  .bolsa {
    position: relative;
    border-radius: 18px;
    background: radial-gradient(ellipse at 50% 85%, color-mix(in srgb, var(--primary-soft) 80%, transparent), transparent 70%);
    min-height: 170px;
  }
  .bolsa :global(canvas) {
    display: block;
  }
  .cuenta {
    position: absolute;
    left: 50%;
    bottom: 6px;
    transform: translateX(-50%);
    padding: 3px 12px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    font-size: 12px;
    font-weight: 800;
    color: var(--primary-strong);
    white-space: nowrap;
  }
  .cuenta.vacia {
    color: var(--muted);
  }
</style>
