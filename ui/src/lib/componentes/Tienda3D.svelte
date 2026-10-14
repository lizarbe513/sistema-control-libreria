<script lang="ts">
  import { onMount } from 'svelte';
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
  }: {
    ubicacion: UbicacionResuelta | null;
    /** Modo «elegir»: tocar un estante, caja, mesa o puerta devuelve su compartimento. */
    onElegir?: (u: UbicacionResuelta) => void;
    alto?: number;
  } = $props();
  const eligiendo = $derived(!!onElegir);

  let contenedor: HTMLDivElement = $state()!;
  let canvas: HTMLCanvasElement = $state()!;
  let escena: EscenaTienda | null = $state(null);
  let sinWebGL = $state(false);
  const plano = $derived(sinWebGL || app.calma.rendimiento);

  onMount(() => {
    if (plano) return;
    try {
      escena = new EscenaTienda(canvas, contenedor, 'visor');
    } catch {
      sinWebGL = true;
    }
    return () => {
      escena?.destruir();
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

  function recentrar() {
    if (ubicacion) escena?.resaltar(ubicacion.bloques, ubicacion.estante);
    else escena?.vistaGeneral();
  }
</script>

{#if plano}
  <MapaTienda {ubicacion} />
{:else}
  <div class="visor" bind:this={contenedor} style:height="{alto}px" class:eligiendo>
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
    <span class="pista">{eligiendo ? pista || 'Toca el estante, la caja, la mesa o la puerta · arrastra para girar' : 'Arrastra para girar la tienda'}</span>
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
