<script lang="ts">
  // Una propuesta de la asistente: explica qué hará y espera la confirmación. El cliente de un encargo se elige aquí
  // (registrado o nuevo) y nunca pasa por la IA. Al confirmar, la app lo hace con los permisos de quien confirma.
  import { api, type Cliente } from '../api';
  import { avisar } from '../estado.svelte';
  import { encargosCambio } from '../encargos.svelte';
  import { inventarioCambio } from '../inventario.svelte';
  import { miniatura } from '../portada';
  import { vista } from '../inventario.svelte';
  import { anotar, irA, nombreDestino, type TarjetaAccion } from '../asistente.svelte';

  let { tarjeta }: { tarjeta: TarjetaAccion } = $props();

  const p = $derived(tarjeta.propuesta);
  const ICONOS: Record<string, string> = { encargo: '📦', estado_encargo: '🚚', stock: '📚', editar_libro: '✏️', libro_nuevo: '➕' };

  // cliente (solo para encargos)
  // svelte-ignore state_referenced_locally
  let modoCliente = $state<'registrado' | 'nuevo'>('registrado');
  // svelte-ignore state_referenced_locally
  let busqueda = $state(tarjeta.propuesta.clienteSugerido ?? '');
  let encontrados = $state<Cliente[]>([]);
  let elegido = $state<Cliente | null>(null);
  // svelte-ignore state_referenced_locally
  let nombreNuevo = $state(tarjeta.propuesta.clienteSugerido ?? '');
  let telefonoNuevo = $state('');

  // libro nuevo: precio y stock
  // svelte-ignore state_referenced_locally
  const ini = tarjeta.propuesta.accion as { precio_cent?: number | null; stock?: number };
  let precio = $state(ini.precio_cent ? (ini.precio_cent / 100).toFixed(2) : '');
  let stock = $state(String(ini.stock ?? 1));

  let ocupado = $state(false);
  let error = $state('');

  $effect(() => {
    const q = busqueda.trim();
    if (!p.pideCliente || modoCliente !== 'registrado' || q.length < 2) {
      encontrados = [];
      return;
    }
    const t = setTimeout(() => api.buscarClientes(q).then((r) => (encontrados = r.slice(0, 5))).catch(() => (encontrados = [])), 200);
    return () => clearTimeout(t);
  });

  async function confirmar() {
    error = '';
    const extra: Parameters<typeof api.asistenteConfirmar>[1] = {};
    if (p.pideCliente) {
      if (modoCliente === 'registrado') {
        if (!elegido) return void (error = 'Elige al cliente de la lista (o registra uno nuevo)');
        extra.clienteId = elegido.id;
      } else {
        if (!nombreNuevo.trim()) return void (error = 'Escribe el nombre del cliente nuevo');
        extra.clienteNuevo = { nombre: nombreNuevo.trim(), telefono: telefonoNuevo.trim() };
      }
    }
    if (p.pidePrecio) {
      const n = Number(precio.replace(',', '.'));
      if (!n || n <= 0) return void (error = 'Escribe el precio (por ejemplo 45.90)');
      extra.precioSoles = n;
      extra.stock = Math.max(0, Math.round(Number(stock) || 0));
    }
    ocupado = true;
    try {
      const r = await api.asistenteConfirmar(tarjeta.id, extra);
      tarjeta.estado = 'hecho';
      tarjeta.resultado = r;
      anotar(r.mensaje);
      inventarioCambio();
      encargosCambio();
      avisar('Hecho ✓');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      ocupado = false;
    }
  }

  async function descartar() {
    try {
      await api.asistenteDescartar(tarjeta.id);
    } catch {
      /* ya no existía */
    }
    tarjeta.estado = 'descartado';
    anotar(`No se hizo: «${p.titulo}» (la persona lo descartó).`);
  }

  const libro = $derived(tarjeta.libro ? vista(tarjeta.libro) : null);
</script>

<div class="accion tarjeta" class:hecha={tarjeta.estado === 'hecho'} class:descartada={tarjeta.estado === 'descartado'} data-testid="tarjeta-accion">
  <div class="cab">
    <span class="ico">{ICONOS[p.accion.tipo] ?? '✨'}</span>
    <strong>{p.titulo}</strong>
    {#if tarjeta.estado === 'hecho'}<span class="sello ok">✓ Hecho</span>{:else if tarjeta.estado === 'descartado'}<span class="sello">Descartado</span>{:else}<span class="sello pendiente">Falta confirmar</span>{/if}
  </div>
  <div class="cuerpo">
    {#if libro || p.portadaUrl}
      <img src={p.portadaUrl ?? (libro ? (libro.portada ?? miniatura(libro)) : '')} alt="" />
    {/if}
    <ul>
      {#each p.explicacion as linea (linea)}<li>{linea}</li>{/each}
    </ul>
  </div>

  {#if tarjeta.estado === 'pendiente'}
    {#if p.pideCliente}
      <div class="cliente">
        <div class="modo" role="tablist" aria-label="Cliente">
          <button role="tab" aria-selected={modoCliente === 'registrado'} class:activo={modoCliente === 'registrado'} onclick={() => (modoCliente = 'registrado')}>Cliente registrado</button>
          <button role="tab" aria-selected={modoCliente === 'nuevo'} class:activo={modoCliente === 'nuevo'} onclick={() => (modoCliente = 'nuevo')}>Cliente nuevo</button>
        </div>
        {#if modoCliente === 'registrado'}
          {#if elegido}
            <div class="elegido">👤 {elegido.nombre}{elegido.telefono ? ` · ${elegido.telefono}` : ''} <button class="enlace" onclick={() => (elegido = null)}>Cambiar</button></div>
          {:else}
            <input bind:value={busqueda} placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" />
            {#each encontrados as c (c.id)}
              <button class="opcion" onclick={() => ((elegido = c), (encontrados = []))}>👤 {c.nombre}{c.telefono ? ` · ${c.telefono}` : ''}</button>
            {/each}
            {#if busqueda.trim().length >= 2 && !encontrados.length}<small class="atenuado">No hay coincidencias: puedes registrarlo como cliente nuevo.</small>{/if}
          {/if}
        {:else}
          <div class="dos">
            <input bind:value={nombreNuevo} placeholder="Nombre" aria-label="Nombre del cliente nuevo" />
            <input bind:value={telefonoNuevo} inputmode="tel" placeholder="Celular (para avisarle)" aria-label="Celular del cliente nuevo" />
          </div>
        {/if}
        <small class="atenuado">🔒 El cliente se guarda en la tienda; no se le envía a la IA.</small>
      </div>
    {/if}
    {#if p.pidePrecio}
      <div class="dos">
        <label>Precio (S/)<input bind:value={precio} inputmode="decimal" placeholder="45.90" aria-label="Precio del libro nuevo" /></label>
        <label>Stock inicial<input bind:value={stock} inputmode="numeric" aria-label="Stock inicial" /></label>
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="botones">
      <button class="btn btn-blanco" onclick={descartar} disabled={ocupado}>No, gracias</button>
      <button class="btn btn-primario" onclick={confirmar} disabled={ocupado} data-testid="confirmar-accion">{ocupado ? 'Haciéndolo…' : 'Confirmar'}</button>
    </div>
  {:else if tarjeta.estado === 'hecho' && tarjeta.resultado}
    <p class="hecho">{tarjeta.resultado.mensaje}</p>
    {#if tarjeta.resultado.ir}
      <button class="btn btn-suave" onclick={() => irA(tarjeta.resultado!.ir!)} data-testid="ir-resultado">{nombreDestino(tarjeta.resultado.ir)} →</button>
    {/if}
  {/if}
</div>

<style>
  .accion {
    margin-top: 10px;
    padding: 12px;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 2px solid var(--primary-soft);
  }
  .accion.hecha {
    border-color: color-mix(in srgb, #5dbb8a 50%, transparent);
  }
  .accion.descartada {
    opacity: 0.6;
  }
  .cab {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cab strong {
    flex: 1;
  }
  .ico {
    font-size: 20px;
  }
  .sello {
    font-size: 11px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .sello.pendiente {
    background: color-mix(in srgb, var(--yellow, #ffd86b) 55%, var(--surface));
    color: var(--text);
  }
  .sello.ok {
    background: color-mix(in srgb, #5dbb8a 30%, var(--surface));
    color: #23704a;
  }
  .cuerpo {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .cuerpo img {
    width: 46px;
    height: 68px;
    object-fit: cover;
    border-radius: 5px;
    flex: none;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.5;
  }
  .cliente {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .modo {
    display: flex;
    gap: 6px;
  }
  .modo button {
    flex: 1;
    padding: 6px;
    border-radius: 10px;
    background: var(--surface);
    font-weight: 800;
    font-size: 12px;
    color: var(--muted);
  }
  .modo button.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  input {
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .dos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-weight: 800;
  }
  .opcion {
    text-align: left;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--surface);
    font-weight: 700;
    font-size: 13px;
  }
  .elegido {
    font-weight: 800;
    font-size: 13px;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 800;
    font-size: 12px;
  }
  .botones {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .error {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #b0243f;
  }
  .hecho {
    margin: 0;
    font-weight: 700;
    font-size: 13px;
    color: #23704a;
  }
</style>
