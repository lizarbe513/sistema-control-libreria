<script lang="ts">
  // «Divisiones verticales»: cuántos tramos tiene el mueble (1 = repisas corridas, sin divisiones).
  import { columnas, compartimentos } from '../../tienda/modelo';
  import { tienda } from '../../tienda/tienda.svelte';

  let { id, compacto = false }: { id: string; compacto?: boolean } = $props();

  const total = $derived(columnas(tienda.datos, id).length);
  const tramos = $derived(compartimentos(tienda.datos, id).length);

  const fijar = (n: number) => tienda.tramosEn(id, n);
</script>

<div class="control" class:compacto>
  <span class="titulo">Divisiones verticales</span>
  <div class="paso" role="group" aria-label="Número de tramos">
    <button type="button" onclick={() => fijar(tramos - 1)} disabled={tramos <= 1} aria-label="Un tramo menos">−</button>
    <output aria-live="polite"><strong>{tramos}</strong> {tramos === 1 ? 'tramo' : 'tramos'}</output>
    <button type="button" onclick={() => fijar(tramos + 1)} disabled={tramos >= total} aria-label="Un tramo más">+</button>
  </div>
  <button type="button" class="sin" class:activo={tramos === 1} onclick={() => fijar(1)} title="Las repisas corren de lado a lado">Sin divisiones</button>
</div>

<style>
  .control {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
  }
  .titulo {
    min-width: 150px;
  }
  .compacto .titulo {
    min-width: 0;
    flex-basis: 100%;
  }
  .paso {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--surface-2);
    padding: 2px;
  }
  .paso button {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    color: var(--primary-strong);
  }
  .paso button:hover:not(:disabled) {
    background: var(--primary-soft);
  }
  .paso button:disabled {
    opacity: 0.35;
  }
  output {
    min-width: 86px;
    text-align: center;
  }
  .sin {
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 2px solid transparent;
    font-size: 12px;
  }
  .sin:hover {
    border-color: var(--primary);
  }
  .sin.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
</style>
