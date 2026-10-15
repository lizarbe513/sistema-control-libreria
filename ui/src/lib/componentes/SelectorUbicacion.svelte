<script lang="ts">
  // Estante → tramo → repisa con listas (cómodo en el celular), y el plano de la tienda con el lugar marcado.
  import type { UbicacionApi } from '../api';
  import { compartimentos, infoTipo, resolver, textoPosicion, tipoDeEstante } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';
  import MapaTienda from './MapaTienda.svelte';

  let { valor, onCambio, mapa = true }: { valor: UbicacionApi | null; onCambio: (u: UbicacionApi | null) => void; mapa?: boolean } = $props();

  const muebles = $derived(
    tienda.datos.estantes.filter((e) => {
      const t = tipoDeEstante(tienda.datos, e.id);
      return t && infoTipo(t).guardaLibros;
    }),
  );
  const tramos = $derived(valor ? compartimentos(tienda.datos, valor.estante) : []);
  const resuelta = $derived(valor ? resolver(tienda.datos, valor) : null);
</script>

<div class="selector">
  <div class="listas">
    <select
      aria-label="Estante"
      value={valor?.estante ?? ''}
      onchange={(e) => {
        const id = e.currentTarget.value;
        onCambio(id ? { estante: id, tramo: 1, repisa: 1 } : null);
      }}
    >
      <option value="">Sin ubicación</option>
      {#each muebles as m (m.id)}<option value={m.id}>{m.titulo}{m.tema ? ` · ${m.tema}` : ''}</option>{/each}
    </select>
    {#if valor && tramos.length > 1}
      <select
        aria-label="Tramo"
        value={valor.tramo}
        onchange={(e) => {
          if (!valor) return;
          const n = Number(e.currentTarget.value);
          onCambio({ ...valor, tramo: n, repisa: Math.min(valor.repisa, tramos[n - 1]?.repisas.length ?? 1) });
        }}
      >
        {#each tramos as _, i}<option value={i + 1}>Tramo {i + 1}</option>{/each}
      </select>
    {/if}
    {#if valor && (tramos[valor.tramo - 1]?.repisas.length ?? 0) > 1}
      <select aria-label="Repisa" value={valor.repisa} onchange={(e) => valor && onCambio({ ...valor, repisa: Number(e.currentTarget.value) })}>
        {#each tramos[valor.tramo - 1].repisas as _, i}<option value={i + 1}>Repisa {i + 1}</option>{/each}
      </select>
    {/if}
  </div>
  {#if resuelta}
    <span class="elegida" style:--f={resuelta.info.fuerte} style:--c={resuelta.info.color}>📍 {resuelta.info.titulo} · {textoPosicion(resuelta)}</span>
  {:else if valor}
    <span class="atenuado">Esa ubicación ya no existe en la tienda: elige otra.</span>
  {/if}
  {#if mapa && resuelta}
    <div class="mapa" data-sin-deslizar><MapaTienda ubicacion={resuelta} /></div>
  {/if}
</div>

<style>
  .selector {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .listas {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  select {
    flex: 1;
    min-width: 0;
    height: 42px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    font-weight: 600;
    color: var(--text);
  }
  .elegida {
    align-self: flex-start;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--c, var(--primary-soft));
    color: var(--f, var(--primary-strong));
    font-weight: 800;
    font-size: 13px;
  }
  .mapa {
    border-radius: 14px;
    overflow: hidden;
    max-height: 200px;
  }
</style>
