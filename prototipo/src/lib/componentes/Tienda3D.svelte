<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../estado.svelte';
  import { EscenaTienda } from '../tienda/escena';
  import { ruta, type UbicacionResuelta } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';
  import Icono from './Icono.svelte';
  import MapaTienda from './MapaTienda.svelte';

  let { ubicacion }: { ubicacion: UbicacionResuelta | null } = $props();

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
    escena.resaltar(u?.bloque ?? null, u?.estante);
    escena.mostrarRuta(u ? ruta(tienda.datos, u.bloque) : []);
  });

  function recentrar() {
    if (ubicacion) escena?.volarA(ubicacion.bloque);
    else escena?.vistaGeneral();
  }
</script>

{#if plano}
  <MapaTienda {ubicacion} />
{:else}
  <div class="visor" bind:this={contenedor}>
    <canvas bind:this={canvas} aria-label="Tienda en 3D con el estante resaltado"></canvas>
    <button class="recentrar" onclick={recentrar} aria-label="Volver a centrar" title="Volver a centrar"><Icono nombre="pin" tam={16} /></button>
    <span class="pista">Arrastra para girar la tienda</span>
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
