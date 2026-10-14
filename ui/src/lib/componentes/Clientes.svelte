<script lang="ts">
  // Clientes: lista con buscador y la ficha (datos editables + historial de compras y encargos).
  import { api, type Cliente, type FichaCliente } from '../api';
  import { soles } from '../datos';
  import { avisar } from '../estado.svelte';
  import { encargosUI, ESTADOS } from '../encargos.svelte';
  import { carrito } from '../ventas/carrito.svelte';

  let texto = $state('');
  let lista = $state<Cliente[]>([]);
  let ficha = $state<FichaCliente | null>(null);
  let edicion = $state<Cliente | null>(null);
  let creando = $state(false);
  let guardando = $state(false);

  $effect(() => {
    const q = texto;
    void encargosUI.version;
    const t = setTimeout(() => api.buscarClientes(q).then((c) => (lista = c)).catch((e: Error) => avisar(e.message)), 120);
    return () => clearTimeout(t);
  });

  async function abrir(id: number) {
    try {
      ficha = await api.fichaCliente(id);
      edicion = { ...ficha.cliente };
      creando = false;
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  function nuevo() {
    ficha = null;
    creando = true;
    edicion = { id: 0, nombre: texto.trim(), telefono: '', correo: '', tipoClienteId: null, notas: '' };
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!edicion) return;
    guardando = true;
    try {
      const c = await api.guardarCliente({ ...edicion, id: creando ? null : edicion.id });
      avisar(creando ? `${c.nombre} registrado 💕` : 'Ficha guardada');
      texto = texto; // refresca la lista
      lista = await api.buscarClientes(texto);
      await abrir(c.id);
    } catch (x) {
      avisar((x as Error).message);
    } finally {
      guardando = false;
    }
  }

  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  const tipoDe = (id: number | null) => carrito.tipos.find((t) => t.id === id)?.nombre;
</script>

<div class="clientes" data-vacio>
  <section class="lista">
    <div class="barra">
      <input bind:value={texto} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente" />
      <button class="btn btn-suave chico" onclick={nuevo}>＋ Cliente</button>
    </div>
    <ul>
      {#each lista as c (c.id)}
        <li>
          <button class="fila tarjeta" class:activa={edicion?.id === c.id && !creando} onclick={() => abrir(c.id)}>
            <span class="avatar">{c.nombre.slice(0, 1).toUpperCase()}</span>
            <span class="txt"><strong>{c.nombre}</strong><small>{c.telefono || 'sin teléfono'}{#if tipoDe(c.tipoClienteId)} · {tipoDe(c.tipoClienteId)}{/if}</small></span>
          </button>
        </li>
      {:else}
        <li class="vacio">{texto ? 'Nadie con ese nombre o teléfono.' : 'Todavía no hay clientes. Se registran al vender o al hacer un encargo.'}</li>
      {/each}
    </ul>
  </section>

  <section class="ficha vidrio">
    {#if edicion}
      <form onsubmit={guardar}>
        <h2>{creando ? 'Cliente nuevo' : edicion.nombre}</h2>
        <div class="dos">
          <label>Nombre<input bind:value={edicion.nombre} maxlength="80" /></label>
          <label>Teléfono / WhatsApp<input bind:value={edicion.telefono} inputmode="tel" placeholder="987 654 321" /></label>
          <label>Correo <small>(opcional)</small><input bind:value={edicion.correo} type="email" placeholder="nombre@correo.com" /></label>
          <label>
            Tipo de cliente
            <select bind:value={edicion.tipoClienteId}>
              <option value={null}>—</option>
              {#each carrito.tipos as t (t.id)}<option value={t.id}>{t.nombre}{t.descuentoPct ? ` (−${t.descuentoPct} %)` : ''}</option>{/each}
            </select>
          </label>
        </div>
        <label>Notas<textarea bind:value={edicion.notas} rows="2" maxlength="500" placeholder="Le gustan las novelas históricas…"></textarea></label>
        <div class="acciones">
          {#if !creando && ficha}
            <button type="button" class="btn btn-blanco chico" onclick={() => (encargosUI.nuevo = {})}>📦 Nuevo encargo</button>
          {/if}
          <button class="btn btn-primario chico" disabled={guardando || !edicion.nombre.trim()}>{guardando ? 'Guardando…' : 'Guardar ficha'}</button>
        </div>
      </form>

      {#if ficha && !creando}
        <div class="historial">
          <h3>Compras <small>· {soles(ficha.totalCompradoCent)} en total</small></h3>
          {#if ficha.compras.length}
            <ul>
              {#each ficha.compras as c (c.ventaId)}
                <li><span class="f">{fecha(c.fecha)}</span><span class="libros">{c.libros}</span><strong>{soles(c.totalCent)}</strong></li>
              {/each}
            </ul>
          {:else}
            <p class="atenuado">Todavía no hay compras registradas a su nombre.</p>
          {/if}
          <h3>Encargos</h3>
          {#if ficha.encargos.length}
            <ul>
              {#each ficha.encargos as e (e.id)}
                <li>
                  <span class="f">{fecha(e.creado)}</span><span class="libros">{e.titulo}</span>
                  <span class="estado" style:background={ESTADOS[e.estado].color}>{ESTADOS[e.estado].emoji} {ESTADOS[e.estado].nombre}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="atenuado">Sin encargos.</p>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="nada">
        <span>👤</span>
        <p>Elige un cliente para ver su ficha, sus compras y sus encargos.</p>
      </div>
    {/if}
  </section>
</div>

<style>
  .clientes {
    display: grid;
    grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .clientes {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .barra {
    display: flex;
    gap: 8px;
  }
  .barra input {
    flex: 1;
    min-width: 0;
    height: 42px;
    border-radius: 999px;
    border: none;
    padding: 0 16px;
    font: inherit;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    color: var(--text);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fila {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    text-align: left;
    border: 2px solid transparent;
  }
  .fila.activa {
    border-color: var(--primary);
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-weight: 800;
    flex: none;
  }
  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .txt small {
    color: var(--muted);
  }
  .vacio {
    padding: 14px;
    color: var(--muted);
    font-weight: 600;
    font-size: 14px;
  }
  .ficha {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--surface);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  h3 small {
    color: var(--muted);
    font-weight: 700;
  }
  .dos {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
    min-width: 0;
  }
  label small {
    color: var(--muted);
    font-weight: 600;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 9px 12px;
    font: inherit;
    font-weight: 600;
    color: var(--text);
  }
  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .chico {
    height: 38px;
    padding: 0 16px;
    font-size: 13px;
  }
  .historial li {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 14px;
  }
  .f {
    color: var(--muted);
    font-weight: 700;
    font-size: 13px;
  }
  .libros {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .estado {
    font-size: 12px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .nada {
    text-align: center;
    padding: 30px 10px;
    color: var(--muted);
    font-weight: 600;
  }
  .nada span {
    font-size: 40px;
  }
  @media (max-width: 560px) {
    .dos {
      grid-template-columns: minmax(0, 1fr);
    }
    .historial li {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .f {
      display: none;
    }
  }
</style>
