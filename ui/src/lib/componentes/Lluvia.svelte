<script lang="ts">
  // Una lluvia breve de corazones y pétalos cuando se completa una venta. Respeta el modo calma.
  import { app } from '../estado.svelte';
  import { ventasCambio } from '../ventas/carrito.svelte';

  const EMOJIS = ['💕', '🌸', '💗', '🌷', '✨'];
  let activa = $state(0);
  let piezas = $state<{ x: number; d: number; t: number; e: string; s: number }[]>([]);
  let temporizador: ReturnType<typeof setTimeout>;

  $effect(() => {
    const n = ventasCambio.celebracion;
    if (!n || !app.calma.animaciones) return;
    piezas = Array.from({ length: 26 }, (_, i) => ({
      x: Math.random() * 100,
      d: Math.random() * 0.7,
      t: 1.6 + Math.random() * 1.2,
      e: EMOJIS[i % EMOJIS.length],
      s: 16 + Math.random() * 16,
    }));
    activa = n;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (activa = 0), 3200);
    return () => clearTimeout(temporizador);
  });
</script>

{#if activa}
  <div class="lluvia" aria-hidden="true">
    {#each piezas as p}
      <span style:left="{p.x}%" style:animation-delay="{p.d}s" style:animation-duration="{p.t}s" style:font-size="{p.s}px">{p.e}</span>
    {/each}
  </div>
{/if}

<style>
  .lluvia {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 80;
  }
  span {
    position: absolute;
    top: -40px;
    animation: caer linear forwards;
  }
  @keyframes caer {
    to {
      transform: translateY(110vh) rotate(40deg);
      opacity: 0.6;
    }
  }
</style>
