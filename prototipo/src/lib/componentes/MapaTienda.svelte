<script lang="ts">
  // Plano cenital generado desde los bloques: respaldo sin WebGL o en modo rendimiento.
  import { infoTipo, ruta, type Bloque, type UbicacionResuelta } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';

  let { ubicacion }: { ubicacion: UbicacionResuelta | null } = $props();

  const t = $derived(tienda.datos);

  // bloque más alto de cada celda (x, z)
  const celdas = $derived.by(() => {
    const arriba = new Map<string, Bloque>();
    for (const b of t.bloques) {
      const k = `${b.x},${b.z}`;
      const a = arriba.get(k);
      if (!a || b.y > a.y) arriba.set(k, b);
    }
    return [...arriba.values()];
  });

  const colores = $derived(new Map(t.estantes.map((e) => [e.id, e])));
  const foco = $derived(ubicacion?.estante);

  // rótulos en el centro de cada estante
  const rotulos = $derived.by(() => {
    const suma = new Map<string, { x: number; z: number; n: number }>();
    for (const b of celdas) {
      if (!b.estante) continue;
      const s = suma.get(b.estante) ?? { x: 0, z: 0, n: 0 };
      s.x += b.x + 0.5;
      s.z += b.z + 0.5;
      s.n++;
      suma.set(b.estante, s);
    }
    return [...suma].map(([id, s]) => ({ id, x: s.x / s.n, z: s.z / s.n }));
  });

  const camino = $derived.by(() => {
    if (!ubicacion) return '';
    const c = ruta(t, ubicacion.bloque);
    return c.map(([x, z], i) => `${i ? 'L' : 'M'} ${x + 0.5} ${z + 0.5}`).join(' ');
  });

  const relleno = (b: Bloque) => {
    const e = b.estante ? colores.get(b.estante) : undefined;
    if (e) return b.estante === foco ? e.fuerte : e.color;
    return infoTipo(b.tipo).color;
  };
</script>

<svg viewBox="-0.5 -0.5 {t.ancho + 1} {t.fondo + 1}" class="mapa" role="img" aria-label={ubicacion ? `Plano de la tienda: ${ubicacion.info.titulo} resaltado` : 'Plano de la tienda'}>
  <rect x="0" y="0" width={t.ancho} height={t.fachada} rx="0.6" class="piso" />
  <rect x="-0.5" y={t.fachada} width={t.ancho + 1} height={t.fondo - t.fachada + 0.5} class="vereda" />
  <line x1="0" y1={t.fachada} x2={t.ancho} y2={t.fachada} class="fachada" />
  <text x={t.ancho / 2} y={t.fondo - 0.2} class="rotulo">Vereda · calle</text>

  {#each celdas as b (`${b.x},${b.z}`)}
    <rect
      x={b.x + 0.04}
      y={b.z + 0.04}
      width="0.92"
      height="0.92"
      rx="0.15"
      fill={relleno(b)}
      class="celda"
      class:apagado={!!foco && b.estante !== foco}
    />
  {/each}

  {#if camino}<path d={camino} class="camino" />{/if}

  {#if ubicacion}
    <rect x={ubicacion.bloque.x} y={ubicacion.bloque.z} width="1" height="1" rx="0.2" class="pulso" style:stroke={ubicacion.info.fuerte} />
  {/if}

  {#each rotulos as r (r.id)}
    <text x={r.x} y={r.z + 0.35} class="letra" class:activa={r.id === foco}>{r.id}</text>
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
    stroke-width: 0.12;
  }
  .vereda {
    fill: color-mix(in srgb, var(--muted) 12%, var(--surface));
  }
  .fachada {
    stroke: var(--primary);
    stroke-width: 0.1;
    stroke-dasharray: 0.3 0.25;
  }
  .celda {
    transition: opacity 0.4s;
  }
  .celda.apagado {
    opacity: 0.4;
  }
  .pulso {
    fill: none;
    stroke-width: 0.22;
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
      transform: scale(2.6);
      opacity: 0;
    }
  }
  .letra {
    font-size: 1px;
    font-weight: 800;
    text-anchor: middle;
    fill: color-mix(in srgb, var(--text) 70%, transparent);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 0.15;
  }
  .letra.activa {
    fill: var(--primary-strong);
  }
  .rotulo {
    font-size: 0.7px;
    font-weight: 700;
    text-anchor: middle;
    fill: var(--muted);
  }
  .camino {
    fill: none;
    stroke: var(--primary);
    stroke-width: 0.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 0.05 0.45;
    animation: andar 1.2s linear infinite;
  }
  @keyframes andar {
    to {
      stroke-dashoffset: -1;
    }
  }
</style>
