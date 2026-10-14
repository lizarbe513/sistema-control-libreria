<script lang="ts">
  // Ajustes (solo la Dueña): margen de ganancia que se suma al costo de un libro encargado.
  import { api } from '../api';
  import { soles } from '../datos';
  import { avisar } from '../estado.svelte';
  import { precioConMargen } from '../ventas/calculo';

  let margen = $state('30');
  api.margenEncargos().then((m) => (margen = String(m))).catch(() => {});

  const pct = $derived(Math.max(0, Math.min(500, Math.round(Number(String(margen).replace(',', '.')) || 0))));

  async function guardar() {
    try {
      margen = String(await api.margenEncargos(pct));
      avisar(`Margen de ganancia: ${margen} %`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }
</script>

<div class="margen">
  <div>
    <strong>Margen sobre el costo del proveedor</strong>
    <span class="atenuado">Precio de venta = costo + margen, subido a los 10 céntimos. Se aplica al encargar un libro que no tenemos; en cada encargo se puede ajustar el precio final.</span>
    <span class="ej">Ejemplo: un libro que cuesta {soles(2000)} se vende a <b>{soles(precioConMargen(2000, pct))}</b>.</span>
  </div>
  <label class="pct"><input type="number" min="0" max="500" bind:value={margen} aria-label="Margen de ganancia" /> %</label>
  <button class="btn btn-suave" onclick={guardar}>Guardar</button>
</div>

<style>
  .margen {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .margen > div {
    flex: 1;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ej {
    font-size: 13px;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
  }
  .pct input {
    width: 80px;
    height: 38px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    color: var(--text);
    box-sizing: border-box;
  }
</style>
