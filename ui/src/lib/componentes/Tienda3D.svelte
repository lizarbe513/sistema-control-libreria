<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../estado.svelte';
  import { EscenaTienda } from '../tienda/escena';
  import { infoTipo, ruta, ubicacionDe, type UbicacionResuelta } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';
  import Icono from './Icono.svelte';
  import MapaTienda from './MapaTienda.svelte';

  let {
    ubicacion,
    onElegir,
    alto = 230,
    enfocar = 0,
  }: {
    ubicacion: UbicacionResuelta | null;
    /** Modo «elegir»: tocar un estante, caja, mesa o puerta devuelve su compartimento. */
    onElegir?: (u: UbicacionResuelta) => void;
    alto?: number;
    /** Cada vez que cambia (y no es 0), la cámara vuela a enfocar la ubicación. Sirve para las listas desplegables. */
    enfocar?: number;
  } = $props();
  const eligiendo = $derived(!!onElegir);

  let contenedor: HTMLDivElement = $state()!;
  let canvas: HTMLCanvasElement = $state()!;
  let escena: EscenaTienda | null = $state(null);
  let sinWebGL = $state(false);
  const plano = $derived(sinWebGL || app.calma.rendimiento);

  // La escena nace y muere con el visor: al activar el modo rendimiento (plano) se destruye, al desactivarlo se recrea.
  $effect(() => {
    if (plano || !canvas || !contenedor) return;
    let e: EscenaTienda;
    try {
      e = new EscenaTienda(canvas, contenedor, 'visor');
    } catch {
      sinWebGL = true;
      return;
    }
    escena = e;
    // solo en desarrollo: permite a las pruebas automáticas leer la cámara
    if (import.meta.env.DEV) Object.assign(window, { __visorTienda: e });
    return () => {
      e.destruir();
      escena = null;
    };
  });

  $effect(() => {
    escena?.cargar(tienda.datos);
  });

  $effect(() => {
    if (!escena) return;
    const u = ubicacion;
    // al elegir no se mueve la cámara ni se dibuja el camino: la usuaria está mirando la tienda
    escena.resaltar(u?.bloques ?? null, u?.estante, !eligiendo);
    escena.mostrarRuta(u && !eligiendo ? ruta(tienda.datos, u.bloque) : []);
  });

  // ── modo elegir ──
  let inicio: { x: number; y: number } | null = null;
  let pista = $state('');

  function compartimentoEn(e: PointerEvent) {
    const ap = escena?.apuntar(e.clientX, e.clientY);
    const b = ap?.bloque;
    if (!b?.estante || !infoTipo(b.tipo).guardaLibros) return null;
    return ubicacionDe(tienda.datos, b);
  }

  function mover(e: PointerEvent) {
    if (!eligiendo || !escena || e.buttons) return;
    const u = compartimentoEn(e);
    escena.fijarCursor(u ? limites(u) : null);
    pista = u ? `${u.info.titulo} · ${u.tramo}/${u.repisa}` : '';
  }

  function limites(u: UbicacionResuelta) {
    const xs = u.bloques.map((b) => b.x);
    const ys = u.bloques.map((b) => b.y);
    const zs = u.bloques.map((b) => b.z);
    return {
      min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)] as [number, number, number],
      max: [Math.max(...xs) + 1, Math.max(...ys) + 1, Math.max(...zs) + 1] as [number, number, number],
    };
  }

  function presionar(e: PointerEvent) {
    inicio = { x: e.clientX, y: e.clientY };
  }

  function soltar(e: PointerEvent) {
    if (!eligiendo || !inicio) return;
    const quieto = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6;
    inicio = null;
    if (!quieto) return;
    const u = compartimentoEn(e);
    if (u) onElegir?.(u);
  }

  // al elegir con las listas, la cámara se mueve al estante (al tocar en el 3D no: la usuaria ya está mirando)
  $effect(() => {
    if (!enfocar || !escena) return;
    untrack(() => {
      if (ubicacion) escena?.resaltar(ubicacion.bloques, ubicacion.estante, true);
    });
  });

  // ── moverse por la maqueta: Espacio + clic derecho desplaza, flechas recorren (con el mouse encima) ──
  let encima = false;
  function tecla(e: KeyboardEvent) {
    if (!encima || !escena || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') {
      e.preventDefault(); // sin scroll ni clic en el botón enfocado
      escena.paneo(true);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const paso = e.shiftKey ? 2.5 : 1;
      escena.desplazar(e.key === 'ArrowUp' ? paso : e.key === 'ArrowDown' ? -paso : 0, e.key === 'ArrowRight' ? paso : e.key === 'ArrowLeft' ? -paso : 0);
    }
  }
  function soltarTecla(e: KeyboardEvent) {
    if (e.code === 'Space') escena?.paneo(false);
  }

  function recentrar() {
    if (ubicacion) escena?.resaltar(ubicacion.bloques, ubicacion.estante);
    else escena?.vistaGeneral();
  }
</script>

<svelte:window onkeydown={tecla} onkeyup={soltarTecla} onblur={() => escena?.paneo(false)} />

{#if plano}
  <MapaTienda {ubicacion} />
{:else}
  <div
    class="visor"
    bind:this={contenedor}
    style:height="{alto}px"
    class:eligiendo
    onpointerenter={() => (encima = true)}
    onpointerleave={() => {
      encima = false;
      escena?.paneo(false);
    }}
    role="group"
    aria-label="Tienda en 3D"
  >
    <canvas
      bind:this={canvas}
      aria-label={eligiendo ? 'Tienda en 3D: toca dónde va el libro' : 'Tienda en 3D con el estante resaltado'}
      onpointermove={mover}
      onpointerdown={presionar}
      onpointerup={soltar}
      onpointerleave={() => {
        escena?.fijarCursor(null);
        pista = '';
      }}
    ></canvas>
    <button class="recentrar" onclick={recentrar} aria-label="Volver a centrar" title="Volver a centrar"><Icono nombre="pin" tam={16} /></button>
    <span class="pista">{eligiendo ? pista || 'Toca un estante, caja, mesa o puerta · Espacio + clic derecho: mover' : 'Arrastra: girar · Espacio + clic derecho: mover'}</span>
  </div>
{/if}

<style>
  .visor {
    position: relative;
    height: 230px;
    border-radius: 16px;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 30%, #fff9fb, color-mix(in srgb, var(--primary-soft) 55%, var(--surface)));
  }
  :global([data-tema='noche']) .visor {
    background: radial-gradient(ellipse at 50% 30%, #5a4b7e, #2c2648);
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }
  .eligiendo canvas {
    cursor: pointer;
  }
  canvas:active {
    cursor: grabbing;
  }
  .recentrar {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--primary-strong);
    box-shadow: var(--sombra-suave);
  }
  .pista {
    position: absolute;
    left: 50%;
    bottom: 8px;
    translate: -50% 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    padding: 2px 10px;
    border-radius: 999px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
