<script lang="ts">
  // Ajustes (solo la Dueña): tipos de cliente con su descuento automático y el tope de descuento a mano de las vendedoras.
  import { api, type TipoCliente } from '../api';
  import { avisar } from '../estado.svelte';
  import { prepararVentas } from '../ventas/carrito.svelte';

  let tipos = $state<TipoCliente[]>([]);
  let tope = $state('10');
  let nuevoNombre = $state('');
  let nuevoPct = $state('0');

  api.tiposCliente(true).then((t) => (tipos = t)).catch((e: Error) => avisar(e.message));
  api.topeDescuento().then((n) => (tope = String(n))).catch(() => {});

  const pct = (t: string | number) => Math.max(0, Math.min(100, Math.round(Number(String(t).replace(',', '.')) || 0)));

  async function guardar(t: TipoCliente) {
    try {
      tipos = await api.guardarTipoCliente({ id: t.id, nombre: t.nombre, descuentoPct: pct(String(t.descuentoPct)), activo: t.activo });
      await prepararVentas();
      avisar(`«${t.nombre}» guardado`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function agregar() {
    try {
      tipos = await api.guardarTipoCliente({ nombre: nuevoNombre, descuentoPct: pct(nuevoPct), activo: true });
      await prepararVentas();
      nuevoNombre = '';
      nuevoPct = '0';
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function guardarTope() {
    try {
      tope = String(await api.topeDescuento(pct(tope)));
      await prepararVentas();
      avisar(`Las vendedoras pueden descontar hasta ${tope} %`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }
</script>

<div class="tipos">
  <p class="atenuado">Al elegir el tipo en una venta, su descuento se aplica solo (aunque el cliente no esté registrado).</p>
  <ul>
    {#each tipos as t (t.id)}
      <li class:inactivo={!t.activo}>
        <input class="nombre" bind:value={t.nombre} maxlength="30" aria-label="Nombre del tipo de cliente" />
        <label class="pct"><input type="number" min="0" max="100" bind:value={t.descuentoPct} aria-label={`Descuento de ${t.nombre}`} /> %</label>
        <label class="activo"><input type="checkbox" bind:checked={t.activo} /> Activo</label>
        <button class="btn btn-suave chico" onclick={() => guardar(t)}>Guardar</button>
      </li>
    {/each}
    <li class="nuevo">
      <input class="nombre" bind:value={nuevoNombre} placeholder="Nuevo tipo (p. ej. Estudiante)" maxlength="30" aria-label="Nombre del nuevo tipo" />
      <label class="pct"><input type="number" min="0" max="100" bind:value={nuevoPct} aria-label="Descuento del nuevo tipo" /> %</label>
      <button class="btn btn-suave chico" onclick={agregar} disabled={!nuevoNombre.trim()}>Agregar</button>
    </li>
  </ul>

  <div class="tope">
    <div>
      <strong>Tope de descuento a mano para vendedoras</strong>
      <span class="atenuado">Lo que escriben por libro o al total. El descuento del tipo de cliente no cuenta. La Dueña no tiene tope.</span>
    </div>
    <label class="pct"><input type="number" min="0" max="100" bind:value={tope} aria-label="Tope de descuento" /> %</label>
    <button class="btn btn-suave chico" onclick={guardarTope}>Guardar</button>
  </div>
</div>

<style>
  .tipos {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  li.inactivo {
    opacity: 0.6;
  }
  input:not([type='checkbox']) {
    height: 38px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    color: var(--text);
    box-sizing: border-box;
  }
  .nombre {
    flex: 1;
    min-width: 150px;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
  }
  .pct input {
    width: 74px;
  }
  .activo input {
    accent-color: var(--primary);
  }
  .activo {
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 700;
    font-size: 14px;
  }
  .chico {
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
  }
  .tope {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 10px;
    border-top: 2px dashed var(--linea);
  }
  .tope div {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
  }
</style>
