<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Hotbar, { type Modo } from '../componentes/tienda/Hotbar.svelte';
  import Inventario from '../componentes/tienda/Inventario.svelte';
  import PanelTienda from '../componentes/tienda/PanelTienda.svelte';
  import OrganizarEstante from '../componentes/tienda/OrganizarEstante.svelte';
  import TarjetaEstante from '../componentes/tienda/TarjetaEstante.svelte';
  import { app, avisar, guardar, leer } from '../estado.svelte';
    import { EscenaTienda, type Apuntado, type Caja, type Celda } from '../tienda/escena';
  import {
    columnas,
    compartimentos,
    infoTipo,
    textoPosicion,
    ubicacionDe,
    type Bloque,
    type TipoBloque,
  } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';

  let contenedor: HTMLDivElement = $state()!;
  let canvas: HTMLCanvasElement = $state()!;
  let escena: EscenaTienda | null = $state(null);
  let sinWebGL = $state(false);

  // barra de bloques (empieza vacía; cada usuaria arma la suya)
  let ranuras = $state<(TipoBloque | null)[]>(leer('hotbar', Array(9).fill(null)));
  let elegida = $state(0);
  let modo = $state<Modo>('construir');
  let relleno = $state(false);
  let giroExtra = $state(0);
  let destello = $state(-1);
  let inventario = $state(false);
  $effect(() => guardar('hotbar', $state.snapshot(ranuras)));

  let nivel = $state(tienda.datos.alto - 1);
  let info = $state<{ x: number; y: number; texto: string } | null>(null);
  let esquina = $state<Celda | null>(null);

  // seleccionar / unir / separar
  let seleccionado = $state<string | null>(null);
  let uniendo = $state(false);
  let separarEn = $state<{ x: number; z: number } | null>(null);
  let organizando = $state(false);
  let sobreCuadro = $state<Bloque[] | null>(null);
  const estanteSel = $derived(tienda.datos.estantes.find((e) => e.id === seleccionado) ?? null);
  const puedeSeparar = $derived.by(() => {
    if (!seleccionado || !separarEn) return false;
    const cols = columnas(tienda.datos, seleccionado);
    return cols.findIndex((c) => c.x === separarEn!.x && c.z === separarEn!.z) > 0;
  });

  let panelAbierto = $state(false); // cajón del panel en modo enfoque
  const enfoque = $derived(app.enfoque);
  const MAX_RELLENO = 6000;

  onMount(() => {
    try {
      escena = new EscenaTienda(canvas, contenedor, 'editor');
      // solo en desarrollo: permite a las pruebas automáticas apuntar a celdas concretas
      if (import.meta.env.DEV) Object.assign(window, { __escenaTienda: escena, __tienda: tienda });
    } catch {
      sinWebGL = true;
    }
    return () => {
      app.enfoque = false;
      escena?.destruir();
      escena = null;
    };
  });

  $effect(() => {
    escena?.cargar(tienda.datos, nivel);
  });
  $effect(() => {
    if (nivel > tienda.datos.alto - 1) nivel = tienda.datos.alto - 1;
  });
  $effect(() => {
    // si el estante elegido desaparece (por ejemplo, al borrar todos sus bloques), se suelta la selección
    if (seleccionado && !tienda.datos.estantes.some((e) => e.id === seleccionado)) seleccionado = null;
    if (!seleccionado) organizando = false;
  });
  // mientras se organiza: números flotantes sobre cada compartimento y resalte del que está bajo el mouse
  $effect(() => {
    const e = estanteSel;
    if (!organizando || !e) {
      escena?.fijarEtiquetas([]);
      return;
    }
    const tr = compartimentos(tienda.datos, e.id);
    const term = infoTipo(tienda.datos.bloques.find((b) => b.estante === e.id)?.tipo ?? 'estanteria').terminos;
    const sig = typeof term === 'object' ? [term[0][0], term[1][0]] : ['T', 'R'];
    const lista = tr.flatMap((t, ti) =>
      t.repisas.map((rep, ri) => ({
        texto: `${sig[0]}${ti + 1}·${sig[1]}${ri + 1}`,
        bloques: rep,
        color: e.fuerte,
        activa: sobreCuadro === rep || (!!sobreCuadro && sobreCuadro.length === rep.length && sobreCuadro[0] === rep[0]),
      })),
    );
    escena?.fijarEtiquetas(lista);
  });
  $effect(() => {
    if (!organizando) escena?.resaltar(null);
    else escena?.resaltar(sobreCuadro, seleccionado ?? undefined, false);
  });
  $effect(() => {
    const id = seleccionado;
    escena?.fijarSeleccion(id ? tienda.datos.bloques.filter((b) => b.estante === id) : null, estanteSel?.fuerte);
  });
  $effect(() => {
    // al cambiar de herramienta se cancela lo que estaba a medias
    void relleno;
    if (modo !== 'seleccionar') uniendo = false;
    esquina = null;
  });

  // ───────── colocar ─────────

  /** Rotación que mira hacia la cámara (como en Minecraft) + los giros extra con R. */
  function rotHaciaCamara(x: number, z: number) {
    if (!escena) return 0;
    const dx = escena.camara.position.x - (x + 0.5);
    const dz = escena.camara.position.z - (z + 0.5);
    const base = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? 0 : 2) : dx < 0 ? 1 : 3;
    return (base + giroExtra) % 4;
  }

  /** Los objetos de pared miran hacia afuera de la cara donde se cuelgan. */
  function rotDeNormal(n: Celda | null) {
    if (!n) return null;
    if (n[2] === 1) return 0;
    if (n[0] === -1) return 1;
    if (n[2] === -1) return 2;
    if (n[0] === 1) return 3;
    return null;
  }

  function nuevoBloque([x, y, z]: Celda, tipo: TipoBloque, normal: Celda | null = null): Bloque {
    const i = infoTipo(tipo);
    const rot = i.montaje === 'pared' ? (rotDeNormal(normal) ?? rotHaciaCamara(x, z)) : i.rota ? rotHaciaCamara(x, z) : 0;
    return { x, y, z, tipo, rot };
  }

  /** Estante al que se suma un bloque suelto: el del vecino del mismo tipo, o el elegido si coincide. */
  function estanteVecino(b: Bloque): string | null {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const o = tienda.datos.bloques.find((v) => v.x === b.x + dx && v.y === b.y + dy && v.z === b.z + dz);
      if (o?.estante && o.tipo === b.tipo && o.rot === b.rot) return o.estante;
    }
    if (seleccionado) {
      const t = tienda.datos.bloques.find((v) => v.estante === seleccionado);
      if (!t || t.tipo === b.tipo) return seleccionado;
    }
    return null;
  }

  function poner(celda: Celda, tipo: TipoBloque, normal: Celda | null) {
    const b = nuevoBloque(celda, tipo, normal);
    if (!infoTipo(tipo).guardaLibros) return tienda.colocar([b]);
    const e = estanteVecino(b);
    if (e) return tienda.colocar([{ ...b, estante: e }]);
    const nuevo = tienda.colocarComoEstante([b], tipo);
    if (nuevo) {
      seleccionado = nuevo.id;
      avisar(`Nuevo: ${nuevo.titulo}`);
    }
  }

  function cajaDe(a: Celda, b: Celda): Caja {
    return {
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
      max: [Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1, Math.max(a[2], b[2]) + 1],
    };
  }

  function rellenar(a: Celda, b: Celda) {
    const { min, max } = cajaDe(a, b);
    if (modo === 'borrar') {
      const n = tienda.quitarCaja(min, [max[0] - 1, max[1] - 1, max[2] - 1]);
      avisar(n ? `Quitados ${n} bloques` : 'No había bloques ahí');
      return;
    }
    const tipo = ranuras[elegida];
    if (!tipo) return;
    const total = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
    if (total > MAX_RELLENO) {
      avisar(`Demasiado grande (${total} bloques). Máximo ${MAX_RELLENO}.`);
      return;
    }
    const nuevos: Bloque[] = [];
    for (let x = min[0]; x < max[0]; x++) for (let y = min[1]; y < max[1]; y++) for (let z = min[2]; z < max[2]; z++) nuevos.push(nuevoBloque([x, y, z], tipo));
    if (infoTipo(tipo).guardaLibros) {
      // un relleno de muebles crea un estante conectado
      const e = tienda.colocarComoEstante(nuevos, tipo);
      if (e) {
        seleccionado = e.id;
        avisar(`${e.titulo}: ${nuevos.length} bloques conectados`);
      } else avisar('Ese espacio ya estaba lleno');
      return;
    }
    const n = tienda.colocar(nuevos);
    avisar(n ? `Colocados ${n} bloques` : 'Ese espacio ya estaba lleno');
  }

  // ───────── puntero ─────────

  let inicio: { x: number; y: number; boton: number } | null = null;

  function textoInfo(ap: Apuntado): string | null {
    if (modo === 'seleccionar' && uniendo) return ap.bloque?.estante ? 'Clic: unir con este estante' : 'Elige otro estante';
    if (modo === 'construir' && !ranuras[elegida]) return 'Ranura vacía: abre el inventario (E)';
    if (!ap.bloque) return esquina ? 'Clic: la otra punta' : null;
    const u = ubicacionDe(tienda.datos, ap.bloque);
    if (u) return `${u.info.titulo}${typeof infoTipo(u.tipo).terminos === 'object' ? ' · ' + textoPosicion(u) : ''}`;
    return infoTipo(ap.bloque.tipo).nombre;
  }

  function mover(e: PointerEvent) {
    if (!escena) return;
    const ap = escena.apuntar(e.clientX, e.clientY);
    if (relleno && esquina && (modo === 'construir' || modo === 'borrar')) {
      const b = modo === 'borrar' && ap.bloque ? ([ap.bloque.x, ap.bloque.y, ap.bloque.z] as Celda) : ap.celda;
      escena.fijarCursor(b ? cajaDe(esquina, b) : cajaDe(esquina, esquina), modo === 'borrar' ? 'relleno-borrar' : 'relleno');
    } else if (modo === 'borrar') {
      escena.fijarCursor(ap.bloque ? ap.marco : null, 'borrar');
    } else {
      escena.fijarCursor(ap.marco);
    }
    const texto = textoInfo(ap);
    const r = contenedor.getBoundingClientRect();
    info = texto ? { x: e.clientX - r.left, y: e.clientY - r.top, texto } : null;
  }

  function presionar(e: PointerEvent) {
    if (e.button === 0 || e.button === 2) inicio = { x: e.clientX, y: e.clientY, boton: e.button };
  }

  function soltar(e: PointerEvent) {
    if (!escena || !inicio || e.button !== inicio.boton) return;
    const quieto = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6;
    inicio = null;
    if (!quieto) return;
    const ap = escena.apuntar(e.clientX, e.clientY);

    if (e.button === 2) {
      // clic derecho: cancela lo que esté a medias, o quita el bloque
      if (esquina || uniendo) {
        esquina = null;
        uniendo = false;
      } else if (ap.bloque) tienda.quitar(ap.bloque.x, ap.bloque.y, ap.bloque.z);
      mover(e);
      return;
    }

    if (modo === 'seleccionar') {
      const id = ap.bloque?.estante ?? null;
      if (uniendo && seleccionado && id && id !== seleccionado) {
        tienda.unir(seleccionado, id);
        avisar('Estantes unidos 🔗');
        uniendo = false;
      } else {
        seleccionado = id;
        separarEn = ap.bloque ? { x: ap.bloque.x, z: ap.bloque.z } : null;
        uniendo = false;
      }
    } else if (relleno) {
      const punto = modo === 'borrar' && ap.bloque ? ([ap.bloque.x, ap.bloque.y, ap.bloque.z] as Celda) : ap.celda;
      if (punto) {
        if (!esquina) {
          if (modo === 'construir' && !ranuras[elegida]) avisar('Elige un bloque: abre el inventario (E)');
          else esquina = punto;
        } else {
          rellenar(esquina, punto);
          esquina = null;
        }
      }
    } else if (modo === 'borrar') {
      if (ap.bloque) tienda.quitar(ap.bloque.x, ap.bloque.y, ap.bloque.z);
    } else {
      const tipo = ranuras[elegida];
      if (!tipo) avisar('Elige un bloque: abre el inventario (E)');
      else if (ap.celda) poner(ap.celda, tipo, ap.normal);
    }
    mover(e);
  }

  // ───────── teclado e inventario ─────────

  function elegirDelInventario(tipo: TipoBloque) {
    let i = ranuras[elegida] === null ? elegida : ranuras.indexOf(null);
    if (i < 0) i = elegida;
    ranuras[i] = tipo;
    elegida = i;
    modo = 'construir';
    destello = i;
    setTimeout(() => (destello = -1), 450);
  }

  // Espacio + clic derecho = desplazar la maqueta (como en Blender)
  let espacio = $state(false);
  function soltarTecla(e: KeyboardEvent) {
    if (e.code === 'Space') {
      espacio = false;
      escena?.paneo(false);
    }
  }
  const sinEspacio = () => {
    espacio = false;
    escena?.paneo(false);
  };

  function tecla(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') {
      e.preventDefault(); // sin scroll ni clic en botones enfocados
      if (!espacio) {
        espacio = true;
        escena?.paneo(true);
      }
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const paso = e.shiftKey ? 2.5 : 1;
      escena?.desplazar(e.key === 'ArrowUp' ? paso : e.key === 'ArrowDown' ? -paso : 0, e.key === 'ArrowRight' ? paso : e.key === 'ArrowLeft' ? -paso : 0);
      return;
    }
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) tienda.rehacer();
      else tienda.deshacer();
    } else if (ctrl && k === 'y') {
      e.preventDefault();
      tienda.rehacer();
    } else if (ctrl) {
      return;
    } else if (k === 'e') {
      inventario = !inventario;
    } else if (e.key === 'Escape') {
      if (inventario) inventario = false;
      else if (esquina || uniendo) {
        esquina = null;
        uniendo = false;
      } else if (seleccionado) seleccionado = null;
      else if (app.enfoque) app.enfoque = false;
    } else if (e.key === 'Tab') {
      e.preventDefault();
      app.enfoque = !app.enfoque;
    } else if (k >= '1' && k <= '9') {
      elegida = Number(k) - 1;
      modo = 'construir';
    } else if (k === 'x') modo = modo === 'borrar' ? 'construir' : 'borrar';
    else if (k === 'v') modo = modo === 'seleccionar' ? 'construir' : 'seleccionar';
    else if (k === 'o') organizando = !organizando && !!seleccionado;
    else if (k === 'f') relleno = !relleno;
    else if (k === 'r') giroExtra = (giroExtra + 1) % 4;
    else if (k === 'p' && app.enfoque) panelAbierto = !panelAbierto;
  }

  function separar() {
    if (!seleccionado || !separarEn) return;
    const n = tienda.separar(seleccionado, separarEn.x, separarEn.z);
    if (n) {
      seleccionado = n.id;
      avisar(`Separado: ${n.titulo}`);
    }
  }

  function borrarSeleccionado() {
    if (estanteSel && confirm(`¿Borrar «${estanteSel.titulo}» y todos sus bloques?`)) {
      tienda.borrarEstante(estanteSel.id);
      seleccionado = null;
    }
  }

  const ayudaModo = $derived(
    modo === 'borrar'
      ? '🧽 Borrador: clic quita' + (relleno ? ' · ▦ dos puntas vacían la zona' : '')
      : modo === 'seleccionar'
        ? '👆 Seleccionar: clic en un estante para editarlo'
        : relleno
            ? '▦ Relleno: clic en una punta y luego en la otra (apunta a una pared o bloque para subir)'
            : 'Clic pone · clic derecho quita · arrastrar con clic derecho gira · Espacio + clic derecho mueve · rueda zoom · R rota',
  );
</script>

<svelte:window onkeydown={tecla} onkeyup={soltarTecla} onblur={sinEspacio} />

<div class="editor" class:enfoque>
  <div class="escenario" class:vidrio={!enfoque} bind:this={contenedor}>
    {#if sinWebGL}
      <p class="aviso">Este equipo no tiene WebGL; el editor 3D no está disponible.</p>
    {/if}
    <canvas
      bind:this={canvas}
      class:herramienta={modo !== 'construir'}
      class:mano={espacio}
      onpointermove={mover}
      onpointerdown={presionar}
      onpointerup={soltar}
      onpointerleave={() => {
        escena?.fijarCursor(null);
            info = null;
      }}
      oncontextmenu={(e) => e.preventDefault()}
    ></canvas>

    <div class="barra-sup">
      {#if enfoque}
        <span class="quien"><span class="avatar">{app.usuario[0] ?? '🌸'}</span> {app.usuario} diseñando ✨</span>
      {:else}
        <h1>Mi tienda</h1>
      {/if}
      <button class="btn btn-blanco" onclick={() => escena?.vistaGeneral()}>Vista general</button>
      <button class="btn btn-blanco" onclick={() => escena?.vistaPlanta()}>Planta</button>
      <button class="btn btn-blanco icono" onclick={() => tienda.deshacer()} disabled={!tienda.puedeDeshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
      <button class="btn btn-blanco icono" onclick={() => tienda.rehacer()} disabled={!tienda.puedeRehacer} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">↷</button>
      <label class="nivel">
        <span>Altura visible</span>
        <input type="range" min="0" max={tienda.datos.alto - 1} bind:value={nivel} />
        <strong>{nivel + 1}</strong>
      </label>
      {#if enfoque}
        <button class="btn btn-blanco" onclick={() => (panelAbierto = !panelAbierto)} title="Panel (P)">☰ Panel</button>
      {/if}
      <button class="btn" class:btn-primario={enfoque} class:btn-blanco={!enfoque} onclick={() => (app.enfoque = !app.enfoque)} title="Modo enfoque (Tab)">
        {enfoque ? '✕ Salir del enfoque' : '⤢ Enfoque'}
      </button>
    </div>

    {#if estanteSel && organizando}
      <OrganizarEstante estante={estanteSel} onResaltar={(b) => (sobreCuadro = b)} onCerrar={() => (organizando = false)} />
    {:else if estanteSel}
      <TarjetaEstante
        estante={estanteSel}
        {puedeSeparar}
        {uniendo}
        onUnir={() => {
          modo = 'seleccionar';
          uniendo = !uniendo;
        }}
        onSeparar={separar}
        onOrganizar={() => (organizando = true)}
        onBorrar={borrarSeleccionado}
        onCerrar={() => (seleccionado = null)}
      />
    {/if}

    {#if info}
      <div class="etiqueta" style:left="{info.x + 16}px" style:top="{info.y + 16}px">{info.texto}</div>
    {/if}

    <div class="abajo">
      <Hotbar bind:ranuras bind:elegida bind:modo bind:relleno {destello} onInventario={() => (inventario = true)} />
      <p class="ayuda">{ayudaModo}{esquina ? ' · Esc cancela' : ''}</p>
    </div>

    {#if inventario}
      <Inventario onElegir={elegirDelInventario} onCerrar={() => (inventario = false)} />
    {/if}
  </div>

  {#if !enfoque || panelAbierto}
    <aside class="panel vidrio" class:cajon={enfoque} transition:fade={{ duration: 150 }}>
      <PanelTienda bind:seleccionado onNivel={(alto) => (nivel = alto - 1)} />
    </aside>
  {/if}
</div>

<style>
  .editor {
    height: calc(100vh - 36px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 290px;
    gap: 16px;
    position: relative;
  }
  .editor.enfoque {
    height: 100vh;
    grid-template-columns: minmax(0, 1fr);
  }
  .escenario {
    position: relative;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 20%, #fffafc, color-mix(in srgb, var(--primary-soft) 60%, var(--surface)));
  }
  .enfoque .escenario {
    border-radius: 0;
  }
  :global([data-tema='noche']) .escenario {
    background: radial-gradient(ellipse at 50% 20%, #5a4b7e, #2c2648);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
  canvas.herramienta {
    cursor: pointer;
  }
  canvas.mano {
    cursor: grab;
  }
  .aviso {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  .barra-sup {
    position: absolute;
    top: 14px;
    left: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    pointer-events: none;
  }
  .barra-sup > * {
    pointer-events: auto;
  }
  h1,
  .quien {
    font-size: 18px;
    margin: 0 4px 0 0;
    font-weight: 800;
    padding: 6px 16px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    display: grid;
    place-items: center;
    font-size: 14px;
  }
  .btn {
    font-size: 13px;
  }
  .btn.icono {
    width: 40px;
    padding: 0;
    font-size: 18px;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .nivel {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
    font-weight: 700;
    box-shadow: var(--sombra-suave);
  }
  .nivel input {
    accent-color: var(--primary);
    width: 100px;
  }
  .etiqueta {
    position: absolute;
    pointer-events: none;
    padding: 5px 10px;
    border-radius: 10px;
    background: var(--text);
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    z-index: 6;
  }
  .abajo {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .ayuda {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    padding: 3px 12px;
    border-radius: 999px;
  }
  .panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    overflow-y: auto;
  }
  .panel.cajon {
    position: absolute;
    top: 70px;
    right: 14px;
    bottom: 110px;
    width: 300px;
    z-index: 7;
    background: var(--surface);
  }
</style>
