<script lang="ts">
  import { ELEMENTOS_MAPA, ESTANTES, MAPA } from '../datos';

  let { estanteId }: { estanteId: string } = $props();

  const caja = ELEMENTOS_MAPA.find((e) => e.tipo === 'caja')!;
  const activo = $derived(ESTANTES.find((e) => e.id === estanteId));

  // camino punteado desde la caja hasta el lado más cercano del estante
  const camino = $derived.by(() => {
    if (!activo) return '';
    const sx = caja.x + caja.w / 2;
    const sy = caja.y;
    const m = 0.45;
    const px = Math.max(activo.x - m, Math.min(activo.x + activo.w + m, sx));
    const py = Math.max(activo.y - m, Math.min(activo.y + activo.h + m, sy));
    const my = (sy + py) / 2;
    return `M ${sx} ${sy} C ${sx} ${my}, ${px} ${my}, ${px} ${py}`;
  });
</script>

<svg viewBox="-0.4 -0.4 {MAPA.ancho + 0.8} {MAPA.alto + 0.8}" class="mapa" role="img" aria-label={activo ? `Mapa de la tienda: estante ${activo.id} resaltado` : 'Mapa de la tienda'}>
  <rect x="0" y="0" width={MAPA.ancho} height={MAPA.alto} rx="0.8" class="piso" />

  {#each ELEMENTOS_MAPA as el}
    {#if el.tipo === 'entrada'}
      <rect x={el.x} y={el.y} width={el.w} height={el.h + 0.4} class="entrada" />
      <text x={el.x + el.w / 2} y={el.y - 0.15} class="rotulo">▲ {el.etiqueta}</text>
    {:else if el.tipo === 'ventana'}
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx="0.15" class="ventana" />
      <text x={el.x + el.w / 2} y={el.y - 0.25} class="rotulo">{el.etiqueta}</text>
    {:else}
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx="0.35" class={el.tipo} />
      <text x={el.x + el.w / 2} y={el.y + el.h / 2 + 0.22} class="rotulo">{el.etiqueta}</text>
    {/if}
  {/each}

  {#if activo}
    <path d={camino} class="camino" />
  {/if}

  {#each ESTANTES as e (e.id)}
    {@const es = e.id === estanteId}
    {#if es}
      <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="0.35" class="pulso" style:stroke={e.fuerte} />
    {/if}
    <rect
      x={e.x}
      y={e.y}
      width={e.w}
      height={e.h}
      rx="0.35"
      class="estante"
      class:activo={es}
      class:apagado={!!activo && !es}
      style:fill={es ? e.fuerte : e.color}
      style:stroke={e.fuerte}
    />
    <text x={e.x + e.w / 2} y={e.y + e.h / 2 + 0.34} class="letra" class:activa={es}>{e.id}</text>
  {/each}
</svg>

<style>
  .mapa {
    width: 100%;
    height: auto;
    display: block;
  }
  .piso {
    fill: var(--surface-2);
    stroke: color-mix(in srgb, var(--primary) 30%, var(--linea));
    stroke-width: 0.14;
  }
  .estante {
    stroke-width: 0.08;
    transition: opacity 0.4s;
  }
  .estante.apagado {
    opacity: 0.45;
  }
  .estante.activo {
    filter: drop-shadow(0 0 0.35px rgba(255, 255, 255, 0.9));
  }
  .pulso {
    fill: none;
    stroke-width: 0.25;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulso 1.6s ease-out infinite;
  }
  @keyframes pulso {
    from {
      transform: scale(1);
      opacity: 0.9;
    }
    to {
      transform: scale(1.35, 1.6);
      opacity: 0;
    }
  }
  .letra {
    font-size: 0.95px;
    font-weight: 800;
    text-anchor: middle;
    fill: color-mix(in srgb, var(--text) 70%, transparent);
  }
  .letra.activa {
    fill: #fff;
  }
  .rotulo {
    font-size: 0.6px;
    font-weight: 700;
    text-anchor: middle;
    fill: var(--muted);
  }
  .caja {
    fill: var(--yellow);
    stroke: #e9b949;
    stroke-width: 0.06;
  }
  .mesa {
    fill: var(--lilac);
    stroke: #9b87e0;
    stroke-width: 0.06;
    stroke-dasharray: 0.25 0.18;
  }
  .entrada {
    fill: var(--surface-2);
  }
  .ventana {
    fill: var(--sky);
    stroke: #6fa8dc;
    stroke-width: 0.05;
  }
  .camino {
    fill: none;
    stroke: var(--primary);
    stroke-width: 0.16;
    stroke-linecap: round;
    stroke-dasharray: 0.05 0.4;
    animation: andar 1.2s linear infinite;
  }
  @keyframes andar {
    to {
      stroke-dashoffset: -0.9;
    }
  }
</style>
