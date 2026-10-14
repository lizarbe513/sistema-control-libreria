<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import type { Libro } from '../datos';
  import { app } from '../estado.svelte';
  import { spriteBrillo } from '../fondo/sprites';
  import { contratapa, fuentesListas, lomo, miniatura, portada, primeraPagina, tono } from '../portada';

  let { libro }: { libro: Libro } = $props();

  let contenedor: HTMLDivElement;
  let canvas: HTMLCanvasElement = $state()!;
  let sinWebGL = $state(false);
  let pista = $state(true);

  const DIMENSIONES = {
    normal: [1.4, 2.1, 0.32],
    grueso: [1.45, 2.15, 0.62],
    infantil: [1.85, 1.8, 0.18],
    delgado: [1.3, 1.95, 0.12],
  } as const;
  const TAPA = 0.035;
  const GRAVEDAD = 24;
  const REBOTE = 0.4;

  // estado de la animación
  let y = 0;
  let vy = 0;
  let asentado = true;
  let giro = 0;
  let vgiro = 0;
  let aplast = 0;
  let vaplast = 0;
  let abierta = 0;
  let abrir = 0;
  let rotUsuario = 0;
  let arrastrando = false;
  let t = 0;
  // entradas con resorte (todas menos la caída): desplazamiento x, escala y volteo
  type Entrada = 'caida' | 'estante' | 'pluma' | 'trompo' | 'pop' | 'volteo';
  let modo: Entrada = 'caida';
  let ox = 0;
  let vox = 0;
  let esc = 1;
  let vesc = 0;
  let inc = 0;
  let vinc = 0;
  let ultimaEntrada: Entrada | null = null;
  let calma = 0; // 0 → recién llegado, 1 → flotando tranquilo

  let renderer: THREE.WebGLRenderer | null = null;
  let escena: THREE.Scene;
  let camara: THREE.PerspectiveCamera;
  let grupo: THREE.Group | null = null;
  let bisagra: THREE.Group | null = null;
  let sombra: THREE.Mesh;
  let alto = 2.1;
  let ancho = 1.4;
  const brillos: { s: THREE.Sprite; v: THREE.Vector3; t: number }[] = [];
  let texturaBorde: THREE.CanvasTexture;
  let texturaBrillo: THREE.CanvasTexture;

  function texturaCanvas(c: HTMLCanvasElement) {
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
    return tx;
  }

  function crearTexturaBorde() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFF8EC';
    ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 64; i += 2) {
      ctx.fillStyle = `rgba(190,160,130,${0.08 + Math.random() * 0.12})`;
      ctx.fillRect(i, 0, 1, 256);
    }
    return texturaCanvas(c);
  }

  function crearTexturaSombra() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(180,80,110,0.55)');
    g.addColorStop(1, 'rgba(180,80,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function liberar(obj: THREE.Object3D) {
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && m.map !== texturaBorde) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  function construir(l: Libro) {
    const [w, h, d] = DIMENSIONES[l.formato];
    ancho = w;
    alto = h;
    const g = new THREE.Group();
    const color = new THREE.Color(l.tapa);
    const tela = () => new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
    const crema = new THREE.MeshStandardMaterial({ color: '#FFF8EC', roughness: 0.9 });
    const borde = () => new THREE.MeshStandardMaterial({ map: texturaBorde, roughness: 0.95 });

    // bloque de páginas (+x, -x, +y, -y, +z, -z)
    const pw = w - TAPA - 0.05;
    const paginas = new THREE.Mesh(new THREE.BoxGeometry(pw, h - 0.08, d - TAPA * 2), [
      borde(),
      crema,
      borde(),
      borde(),
      new THREE.MeshStandardMaterial({ map: texturaCanvas(primeraPagina(l)), roughness: 0.9 }),
      crema,
    ]);
    paginas.position.x = -w / 2 + TAPA + pw / 2;
    g.add(paginas);

    // contratapa
    const atras = new THREE.Mesh(new THREE.BoxGeometry(w, h, TAPA), [
      tela(),
      tela(),
      tela(),
      tela(),
      tela(),
      new THREE.MeshStandardMaterial({ map: texturaCanvas(contratapa(l)), roughness: 0.6 }),
    ]);
    atras.position.z = -d / 2 + TAPA / 2;
    g.add(atras);

    // lomo
    const lomoMesh = new THREE.Mesh(new THREE.BoxGeometry(TAPA, h, d), [
      tela(),
      new THREE.MeshStandardMaterial({ map: texturaCanvas(lomo(l)), roughness: 0.6 }),
      tela(),
      tela(),
      tela(),
      tela(),
    ]);
    lomoMesh.position.x = -w / 2 + TAPA / 2;
    g.add(lomoMesh);

    // tapa delantera con bisagra en el lomo
    const b = new THREE.Group();
    b.position.set(-w / 2, 0, d / 2 - TAPA / 2);
    const frente = new THREE.Mesh(new THREE.BoxGeometry(w, h, TAPA), [
      tela(),
      tela(),
      tela(),
      tela(),
      new THREE.MeshStandardMaterial({ map: texturaCanvas(portada(l)), roughness: 0.55 }),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(tono(l.tapa, 0.8)), roughness: 0.9 }),
    ]);
    frente.position.x = w / 2;
    b.add(frente);
    g.add(b);

    bisagra = b;
    return g;
  }

  function nuevoLibro(l: Libro) {
    if (!renderer) return;
    if (grupo) {
      escena.remove(grupo);
      liberar(grupo);
    }
    grupo = construir(l);
    escena.add(grupo);
    sombra.position.y = -alto / 2 - 0.02;
    abierta = 0;
    abrir = 0;
    rotUsuario = 0;
    calma = 0;
    ox = vox = vinc = vesc = vy = vgiro = 0;
    inc = 0;
    esc = 1;
    y = 0;
    giro = 0;
    asentado = true;
    if (app.calma.animaciones) {
      modo = elegirEntrada();
      asentado = false;
      switch (modo) {
        case 'caida':
          y = 3.4;
          giro = -Math.PI * 1.3;
          break;
        case 'estante': // sale deslizándose de un estante a la derecha
          ox = 4.2;
          giro = 0.9;
          inc = 0.25;
          break;
        case 'pluma': // baja despacio, balanceándose
          y = 3.4;
          ox = 1.2;
          giro = 1.6;
          break;
        case 'trompo': // aparece girando rápido y se frena
          esc = 0;
          giro = -Math.PI * 5;
          break;
        case 'pop': // brota con un golpecito elástico
          esc = 0;
          giro = 0.5;
          break;
        case 'volteo': // vuelta de campana hacia delante
          inc = -Math.PI * 2;
          y = 0.8;
          esc = 0.6;
          break;
      }
    }
  }

  function elegirEntrada(): Entrada {
    const todas: Entrada[] = ['caida', 'estante', 'pluma', 'trompo', 'pop', 'volteo'];
    const fija = app.calma.animLibro;
    if (fija && fija !== 'aleatoria') return fija;
    const otras = todas.filter((m) => m !== ultimaEntrada);
    return (ultimaEntrada = otras[Math.floor(Math.random() * otras.length)]);
  }

  function chispas() {
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texturaBrillo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const a = (i / 12) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.4, -alto / 2 + 0.2 + Math.random() * 0.6, Math.sin(a) * 0.4 + 0.3);
      s.scale.setScalar(0.35);
      escena.add(s);
      brillos.push({ s, v: new THREE.Vector3(Math.cos(a) * 2.4, 1.2 + Math.random() * 1.6, Math.sin(a) * 0.8), t: 0 });
    }
  }

  function paso(dt: number) {
    t += dt;
    // caída con rebotes, o resortes para las demás entradas
    if (!asentado && modo === 'caida') {
      vy -= GRAVEDAD * dt;
      y += vy * dt;
      if (y <= 0) {
        y = 0;
        const impacto = Math.abs(vy);
        if (impacto > 9) chispas();
        vaplast += impacto * 0.06;
        if (impacto < 1.6) {
          asentado = true;
          vy = 0;
        } else vy = impacto * REBOTE;
      }
    } else if (!asentado) {
      const suave = modo === 'pluma';
      vy += (-(suave ? 7 : 40) * y - (suave ? 4.2 : 9) * vy) * dt;
      y += vy * dt;
      vox += (-(suave ? 5 : 30) * ox - (suave ? 1.6 : 7) * vox) * dt;
      ox += vox * dt;
      vesc += (-(modo === 'pop' ? 90 : 40) * (esc - 1) - (modo === 'pop' ? 7 : 9) * vesc) * dt;
      esc += vesc * dt;
      vinc += (-24 * inc - 6.5 * vinc) * dt;
      inc += vinc * dt;
      if (Math.abs(y) + Math.abs(ox) + Math.abs(esc - 1) + Math.abs(inc) + Math.abs(giro) < 0.05 && Math.abs(vy) + Math.abs(vox) + Math.abs(vgiro) < 0.2) {
        y = ox = inc = giro = 0;
        esc = 1;
        asentado = true;
        if (modo !== 'pluma') chispas();
      }
    } else {
      calma = Math.min(1, calma + dt * 0.6);
    }
    // giro con resorte (pequeño sobrepaso)
    vgiro += (-26 * giro - 6.5 * vgiro) * dt;
    giro += vgiro * dt;
    // aplastamiento (squash & stretch) amortiguado
    vaplast += (-260 * aplast - 14 * vaplast) * dt;
    aplast += vaplast * dt;
    // tapa
    abierta += (abrir - abierta) * Math.min(1, dt * 4);
    if (!arrastrando) rotUsuario += (0 - rotUsuario) * Math.min(1, dt * 0.8);

    if (grupo && bisagra) {
      const e = abierta * abierta * (3 - 2 * abierta);
      const flotar = Math.sin(t * 1.6) * 0.06 * calma;
      const vaiven = Math.sin(t * 0.45) * 0.28 * calma * (1 - e);
      const sy = 1 - aplast;
      const sxz = 1 + aplast * 0.6;
      grupo.scale.set(sxz * esc, sy * esc, sxz * esc);
      grupo.position.set(e * ancho * 0.48 + ox, y + flotar - (alto / 2) * (1 - sy), 0);
      grupo.rotation.set(inc + 0.08 * (1 - e) + Math.sin(t * 0.7) * 0.03 * calma, 0.38 * (1 - e * 0.85) + giro + vaiven + rotUsuario, Math.sin(t * 0.9) * 0.02 * calma - vox * 0.08);
      bisagra.rotation.y = -2.45 * e;
      const mat = sombra.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 * Math.max(0.15, 1 - y / 3.4);
      sombra.scale.setScalar(Math.max(0.5, 1 - y * 0.12) * (1 + e * 0.5));
      sombra.position.x = grupo.position.x;
      sombra.visible = esc > 0.05;
    }
    for (let i = brillos.length - 1; i >= 0; i--) {
      const b = brillos[i];
      b.t += dt;
      if (b.t > 0.9) {
        escena.remove(b.s);
        b.s.material.dispose();
        brillos.splice(i, 1);
        continue;
      }
      b.s.position.addScaledVector(b.v, dt);
      b.v.multiplyScalar(Math.exp(-3 * dt));
      (b.s.material as THREE.SpriteMaterial).opacity = 1 - b.t / 0.9;
      b.s.scale.setScalar(0.25 + Math.sin((b.t / 0.9) * Math.PI) * 0.3);
    }
  }

  onMount(() => {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      sinWebGL = true;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, app.calma.rendimiento ? 1 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    escena = new THREE.Scene();
    camara = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camara.position.set(0, 0.35, 5.8);
    camara.lookAt(0, -0.05, 0);
    escena.add(new THREE.HemisphereLight(0xfff5f8, 0xf7c6d4, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.9);
    sol.position.set(3, 4, 5);
    escena.add(sol);
    const relleno = new THREE.DirectionalLight(0xffc4d6, 0.6);
    relleno.position.set(-4, 1, 2);
    escena.add(relleno);

    texturaBorde = crearTexturaBorde();
    texturaBrillo = new THREE.CanvasTexture(spriteBrillo());
    sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.1),
      new THREE.MeshBasicMaterial({ map: crearTexturaSombra(), transparent: true, depthWrite: false }),
    );
    sombra.rotation.x = -Math.PI / 2;
    escena.add(sombra);

    const ajustar = () => {
      const w = contenedor.clientWidth;
      const h = contenedor.clientHeight;
      if (!w || !h || !renderer) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.position.z = w / h < 0.9 ? 5.8 / (w / h / 0.9) : 5.8;
      camara.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(contenedor);
    ajustar();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(contenedor);

    let raf = 0;
    let ultimo = performance.now();
    const bucle = (ahora: number) => {
      raf = requestAnimationFrame(bucle);
      const dt = Math.min(0.05, (ahora - ultimo) / 1000);
      ultimo = ahora;
      if (!visible || document.hidden) return;
      paso(dt);
      renderer!.render(escena, camara);
    };
    raf = requestAnimationFrame(bucle);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (grupo) liberar(grupo);
      texturaBorde.dispose();
      texturaBrillo.dispose();
      renderer?.dispose();
      renderer = null;
    };
  });

  // primer libro y cada cambio de libro → nueva aparición (onMount ya creó el renderer)
  let idActual = -1;
  $effect(() => {
    const l = libro;
    if (l.id !== idActual && renderer) {
      idActual = l.id;
      fuentesListas.then(() => nuevoLibro(l));
    }
  });

  // arrastrar para girar, clic para abrir
  let inicioX = 0;
  let previoX = 0;
  let movido = false;
  function presionar(e: PointerEvent) {
    arrastrando = true;
    movido = false;
    inicioX = previoX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  }
  function mover(e: PointerEvent) {
    if (!arrastrando) return;
    if (Math.abs(e.clientX - inicioX) > 5) movido = true;
    rotUsuario += (e.clientX - previoX) * 0.012;
    previoX = e.clientX;
  }
  function soltar() {
    if (!arrastrando) return;
    arrastrando = false;
    pista = false;
    if (!movido) abrir = abrir > 0.5 ? 0 : 1;
  }
</script>

<div class="libro3d" bind:this={contenedor}>
  {#if sinWebGL}
    {#key libro.id}
      <img class="plano" src={miniatura(libro)} alt={`Portada de ${libro.titulo}`} />
    {/key}
  {:else}
    <canvas
      bind:this={canvas}
      onpointerdown={presionar}
      onpointermove={mover}
      onpointerup={soltar}
      onpointercancel={soltar}
      aria-label={`Libro ${libro.titulo} en 3D. Arrastra para girarlo, haz clic para abrirlo.`}
    ></canvas>
    {#if pista}
      <span class="pista">Arrastra para girar · clic para abrir</span>
    {/if}
  {/if}
</div>

<style>
  .libro3d {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 220px;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }
  canvas:active {
    cursor: grabbing;
  }
  .pista {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    background: var(--surface-glass);
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
    pointer-events: none;
  }
  .plano {
    display: block;
    height: 85%;
    margin: 4% auto 0;
    border-radius: 6px 14px 14px 6px;
    box-shadow: 0 18px 30px rgba(180, 80, 110, 0.3);
    animation: caer 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes caer {
    from {
      transform: translateY(-60%) rotate(-12deg);
      opacity: 0;
    }
  }
</style>
