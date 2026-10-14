<script lang="ts">
  // Barras de ventas por día o mes; la parte oscura es la ganancia. Sin librerías: SVG propio y adaptable.
  import type { PuntoReporte } from '../api';
  import { soles } from '../datos';
  import { etiquetaCorta, etiquetaLarga } from '../reportes/rango';

  let { puntos }: { puntos: PuntoReporte[] } = $props();

  const W = 760;
  const H = 230;
  const M = { l: 54, r: 8, t: 12, b: 30 };

  const maximo = $derived(Math.max(1, ...puntos.map((p) => p.totalCent)));
  // eje: un máximo «redondo» (50, 100, 200, 500…) para que las líneas guía tengan sentido
  const tope = $derived.by(() => {
    const soles_ = maximo / 100;
    const base = 10 ** Math.floor(Math.log10(soles_));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * base >= soles_) return k * base * 100;
    return maximo;
  });
  const ancho = $derived((W - M.l - M.r) / Math.max(1, puntos.length));
  const barra = $derived(Math.min(46, ancho * 0.7));
  const y = (c: number) => M.t + (H - M.t - M.b) * (1 - c / tope);
  const cada = $derived(Math.max(1, Math.ceil(puntos.length / 12)));
  let activo = $state<number | null>(null);
</script>

<div class="grafico">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Ventas del período" preserveAspectRatio="xMidYMid meet">
    {#each [0, 0.25, 0.5, 0.75, 1] as g}
      <line x1={M.l} x2={W - M.r} y1={y(tope * g)} y2={y(tope * g)} class="guia" />
      <text x={M.l - 6} y={y(tope * g) + 4} class="eje" text-anchor="end">{(tope * g) / 100 >= 1000 ? `${Math.round((tope * g) / 100000)}k` : Math.round((tope * g) / 100)}</text>
    {/each}
    {#each puntos as p, i (p.etiqueta)}
      {@const x = M.l + ancho * i + (ancho - barra) / 2}
      {@const g = Math.max(0, Math.min(p.gananciaCent, p.totalCent))}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g onpointerenter={() => (activo = i)} onpointerleave={() => (activo = null)}>
        <rect x={M.l + ancho * i} y={M.t} width={ancho} height={H - M.t - M.b} fill="transparent" />
        {#if p.totalCent > 0}
          <rect {x} y={y(p.totalCent)} width={barra} height={y(0) - y(p.totalCent)} rx="4" class="total" class:sel={activo === i} />
          <rect {x} y={y(g)} width={barra} height={y(0) - y(g)} rx="4" class="ganancia" />
        {:else}
          <rect {x} y={y(0) - 2} width={barra} height="2" class="cero" />
        {/if}
        {#if i % cada === 0}
          <text x={M.l + ancho * i + ancho / 2} y={H - 10} class="eje" text-anchor="middle">{etiquetaCorta(p.etiqueta)}</text>
        {/if}
      </g>
    {/each}
    {#if activo !== null}
      {@const p = puntos[activo]}
      {@const cx = Math.min(W - 130, Math.max(M.l, M.l + ancho * activo + ancho / 2 - 62))}
      <g class="tip" pointer-events="none">
        <rect x={cx} y={M.t - 6} width="124" height="58" rx="8" />
        <text x={cx + 8} y={M.t + 10}>{etiquetaLarga(p.etiqueta)}</text>
        <text x={cx + 8} y={M.t + 26} class="b">{soles(p.totalCent)} · {p.ventas} {p.ventas === 1 ? 'venta' : 'ventas'}</text>
        <text x={cx + 8} y={M.t + 42}>Ganancia {soles(p.gananciaCent)}</text>
      </g>
    {/if}
  </svg>
  <div class="leyenda"><span><i class="c1"></i> Vendido</span><span><i class="c2"></i> Ganancia estimada</span></div>
</div>

<style>
  .grafico {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .guia {
    stroke: var(--linea);
    stroke-dasharray: 3 4;
  }
  .eje {
    fill: var(--muted);
    font-size: 11px;
    font-weight: 700;
  }
  .total {
    fill: color-mix(in srgb, var(--primary) 55%, var(--surface));
    transition: fill 0.15s;
  }
  .total.sel {
    fill: color-mix(in srgb, var(--primary) 80%, var(--surface));
  }
  .ganancia {
    fill: var(--primary-strong);
    opacity: 0.85;
  }
  .cero {
    fill: var(--linea);
  }
  .tip rect {
    fill: #3a2d33;
    opacity: 0.95;
  }
  .tip text {
    fill: #fff;
    font-size: 11px;
    font-weight: 600;
  }
  .tip text.b {
    font-weight: 800;
  }
  .leyenda {
    display: flex;
    gap: 14px;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }
  .leyenda i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 5px;
  }
  .c1 {
    background: color-mix(in srgb, var(--primary) 55%, var(--surface));
  }
  .c2 {
    background: var(--primary-strong);
  }
</style>
