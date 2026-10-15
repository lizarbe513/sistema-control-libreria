<script lang="ts">
  // Nuevo encargo: quién lo pide, qué libro (del inventario o escrito a mano), cantidad, notas y adelanto opcional.
  import { alAtras } from '../atras.svelte';
  import { fly } from 'svelte/transition';
  import { api, type Cliente, type Metodo, type ResultadoLinea } from '../api';
  import { soles, type Libro } from '../datos';
  import { avisar } from '../estado.svelte';
  import { encargosCambio, type Precarga } from '../encargos.svelte';
  import { aCentimos, aSoles, buscarExistente, vista } from '../inventario.svelte';
  import { miniatura } from '../portada';
  import { carrito, METODOS } from '../ventas/carrito.svelte';
  import { precioConMargen } from '../ventas/calculo';
  import BuscadorLinea from './BuscadorLinea.svelte';
  import Icono from './Icono.svelte';
  import IconoMetodo from './IconoMetodo.svelte';

  let { precarga, onCerrar }: { precarga: Precarga; onCerrar: () => void } = $props();
  // en el celular, «atrás» cierra esto
  $effect(() => alAtras(() => onCerrar()));

  // ── cliente ──
  let cliente = $state<Cliente | null>(null);
  let modoCliente = $state<'buscar' | 'nuevo'>('buscar');
  let textoCliente = $state('');
  let clientes = $state<Cliente[]>([]);
  let nuevoNombre = $state('');
  let nuevoTelefono = $state('');
  let nuevoTipo = $state<number | null>(null);

  $effect(() => {
    const q = textoCliente;
    if (cliente || modoCliente !== 'buscar') return;
    const t = setTimeout(() => api.buscarClientes(q).then((c) => (clientes = c)).catch(() => {}), 120);
    return () => clearTimeout(t);
  });

  // svelte-ignore state_referenced_locally
  if (precarga.clienteId) api.fichaCliente(precarga.clienteId).then((f) => (cliente = f.cliente)).catch(() => {});

  // ── libro ──
  // svelte-ignore state_referenced_locally
  let modoLibro = $state<'inventario' | 'internet' | 'mano'>(precarga.libroId || !precarga.titulo ? 'inventario' : 'internet');
  /** Libro elegido en la búsqueda en internet (aún no está en el inventario). */
  let hallado = $state<ResultadoLinea | null>(null);
  let yaLoTenia = $state<Libro | null>(null);

  async function elegirEnLinea(r: ResultadoLinea) {
    hallado = r;
    titulo = r.titulo;
    autor = r.autor;
    costoTexto = '';
    precioTexto = '';
    yaLoTenia = null;
    // si ya lo habíamos tenido en la tienda, se usa ese mismo libro (con su precio)
    try {
      const l = await buscarExistente(r);
      if (hallado === r && l) {
        yaLoTenia = l;
        libro = l;
      }
    } catch {
      /* sin la comprobación, igual se puede encargar */
    }
  }
  let libro = $state<Libro | null>(null);
  // svelte-ignore state_referenced_locally
  let textoLibro = $state(precarga.titulo ?? '');
  let libros = $state<Libro[]>([]);
  // svelte-ignore state_referenced_locally
  let titulo = $state(precarga.titulo ?? '');
  // svelte-ignore state_referenced_locally
  let autor = $state(precarga.autor ?? '');

  // svelte-ignore state_referenced_locally
  if (precarga.libroId) api.libro(precarga.libroId).then((l) => (libro = vista(l))).catch(() => {});

  $effect(() => {
    const q = textoLibro;
    if (libro || modoLibro !== 'inventario') return;
    const t = setTimeout(() => api.buscarLibros(q, { limite: 8 }).then((r) => (libros = r.map(vista))).catch(() => {}), 120);
    return () => clearTimeout(t);
  });

  // ── resto ──
  let cantidad = $state(1);
  let notas = $state('');
  let conAdelanto = $state(false);
  let adelantoTexto = $state('');
  let adelantoMetodo = $state<Metodo>('efectivo');

  // ── precio: el del libro si ya está en la tienda; si no, costo del proveedor + margen ──
  let margen = $state(30);
  api.margenEncargos().then((m) => (margen = m)).catch(() => {});
  let costoTexto = $state('');
  let precioTexto = $state('');
  const costo = $derived(costoTexto.trim() ? aCentimos(costoTexto) : null);
  const sugerido = $derived(costo ? precioConMargen(costo, margen) : null);
  const precioFinal = $derived(libro ? libro.precio : precioTexto.trim() ? aCentimos(precioTexto) : sugerido);
  const total = $derived(precioFinal != null ? precioFinal * cantidad : null);
  const ganancia = $derived(!libro && costo && precioFinal ? precioFinal - costo : null);
  let guardando = $state(false);
  let error = $state('');

  const listo = $derived(
    (cliente || (modoCliente === 'nuevo' && nuevoNombre.trim())) &&
      (libro || ((modoLibro === 'mano' || (modoLibro === 'internet' && hallado)) && titulo.trim())) &&
      cantidad >= 1 &&
      costoTexto.trim() === (costo === null ? '' : costoTexto.trim()),
  );

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const adelanto = conAdelanto ? aCentimos(adelantoTexto) : 0;
    if (conAdelanto && !adelanto) return void (error = 'Escribe el monto del adelanto (p. ej. 10.00)');
    guardando = true;
    try {
      const enc = await api.crearEncargo({
        clienteId: cliente?.id ?? null,
        cliente: cliente ? null : { nombre: nuevoNombre, telefono: nuevoTelefono, tipoClienteId: nuevoTipo },
        libroId: libro?.id ?? null,
        titulo: libro ? '' : titulo,
        autor: libro ? '' : autor,
        costoCent: libro ? null : costo,
        precioAcordadoCent: libro ? libro.precio : precioTexto.trim() ? aCentimos(precioTexto) : null,
        portadaUrl: libro ? null : (hallado?.portadaUrl ?? null),
        cantidad,
        notas,
        adelanto: adelanto ? { metodo: adelantoMetodo, montoCent: adelanto } : null,
      });
      encargosCambio();
      avisar(`Encargo de «${enc.titulo}» para ${enc.cliente} anotado 📦`);
      onCerrar();
    } catch (x) {
      error = (x as Error).message;
    } finally {
      guardando = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onCerrar()} />

<div class="velo" role="presentation" onclick={onCerrar} transition:fly={{ duration: 120 }}></div>
<aside class="cajon" transition:fly={{ x: 60, duration: 260 }} aria-label="Nuevo encargo">
  <header>
    <h2>📦 Nuevo encargo</h2>
    <button class="cerrar" onclick={onCerrar} aria-label="Cerrar"><Icono nombre="cerrar" tam={18} /></button>
  </header>

  <form onsubmit={guardar}>
    <section>
      <h3>¿Quién lo encarga?</h3>
      {#if cliente}
        <div class="elegido">
          <span>👤 <strong>{cliente.nombre}</strong>{#if cliente.telefono} · {cliente.telefono}{/if}</span>
          <button type="button" class="enlace" onclick={() => (cliente = null)}>Cambiar</button>
        </div>
        {#if !cliente.telefono}<p class="nota">⚠️ Sin teléfono no se le podrá avisar por WhatsApp. Puedes agregarlo en su ficha.</p>{/if}
      {:else}
        <div class="seg" role="tablist">
          <button type="button" role="tab" aria-selected={modoCliente === 'buscar'} class:on={modoCliente === 'buscar'} onclick={() => (modoCliente = 'buscar')}>Cliente registrado</button>
          <button type="button" role="tab" aria-selected={modoCliente === 'nuevo'} class:on={modoCliente === 'nuevo'} onclick={() => (modoCliente = 'nuevo')}>＋ Cliente nuevo</button>
        </div>
        {#if modoCliente === 'buscar'}
          <input bind:value={textoCliente} placeholder="Nombre o teléfono…" aria-label="Buscar cliente" />
          <ul class="opciones">
            {#each clientes as c (c.id)}
              <li><button type="button" onclick={() => (cliente = c)}><span>{c.nombre}</span><small>{c.telefono}</small></button></li>
            {:else}
              <li class="vacio">{textoCliente ? 'No hay clientes con ese nombre. Usa «＋ Cliente nuevo».' : 'Todavía no hay clientes registrados.'}</li>
            {/each}
          </ul>
        {:else}
          <div class="dos">
            <label>Nombre<input bind:value={nuevoNombre} maxlength="80" placeholder="Rosa Quispe" /></label>
            <label>Teléfono / WhatsApp<input bind:value={nuevoTelefono} inputmode="tel" placeholder="987 654 321" /></label>
          </div>
          <label>
            Tipo de cliente
            <select bind:value={nuevoTipo}>
              <option value={null}>—</option>
              {#each carrito.tipos as t (t.id)}<option value={t.id}>{t.nombre}{t.descuentoPct ? ` (−${t.descuentoPct} %)` : ''}</option>{/each}
            </select>
          </label>
        {/if}
      {/if}
    </section>

    <section>
      <h3>¿Qué libro?</h3>
      {#if libro}
        <div class="elegido libro">
          <img src={libro.portada ?? miniatura(libro)} alt="" />
          <span><strong>{libro.titulo}</strong><small>{libro.autor} · {soles(libro.precio)} · {libro.stock ? `${libro.stock} en stock` : 'agotado'}</small></span>
          <button type="button" class="enlace" onclick={() => ((libro = null), (yaLoTenia = null))}>Cambiar</button>
        </div>
        {#if yaLoTenia}
          <p class="nota ok">✅ Ya lo habíamos tenido en la tienda: se usa ese mismo libro y su precio.</p>
        {/if}
      {:else}
        <div class="seg" role="tablist">
          <button type="button" role="tab" aria-selected={modoLibro === 'inventario'} class:on={modoLibro === 'inventario'} onclick={() => (modoLibro = 'inventario')}>Del inventario</button>
          <button type="button" role="tab" aria-selected={modoLibro === 'internet'} class:on={modoLibro === 'internet'} onclick={() => (modoLibro = 'internet')}>🔎 Buscar en internet</button>
          <button type="button" role="tab" aria-selected={modoLibro === 'mano'} class:on={modoLibro === 'mano'} onclick={() => (modoLibro = 'mano')}>Escribirlo</button>
        </div>
        {#if modoLibro === 'inventario'}
          <input bind:value={textoLibro} placeholder="Título, autor o ISBN…" aria-label="Buscar libro del inventario" />
          <ul class="opciones">
            {#each libros as l (l.id)}
              <li>
                <button type="button" onclick={() => (libro = l)}>
                  <span>{l.titulo} <small>· {l.autor}</small></span>
                  <small class:cero={!l.stock}>{l.stock ? `${l.stock} en stock` : 'agotado'}</small>
                </button>
              </li>
            {:else}
              <li class="vacio">No está en el inventario. <button type="button" class="enlace" onclick={() => ((modoLibro = 'mano'), (titulo = textoLibro))}>Escribirlo a mano</button></li>
            {/each}
          </ul>
        {:else if modoLibro === 'internet'}
          {#if hallado}
            <div class="elegido libro">
              {#if hallado.portadaUrl}<img src={hallado.portadaUrl} alt="" />{/if}
              <span><strong>{hallado.titulo}</strong><small>{[hallado.autor, hallado.editorial, hallado.anio].filter(Boolean).join(' · ')}</small></span>
              <button type="button" class="enlace" onclick={() => ((hallado = null), (titulo = ''), (autor = ''))}>Cambiar</button>
            </div>
          {:else}
            <BuscadorLinea onElegir={elegirEnLinea} />
          {/if}
        {:else}
          <div class="dos">
            <label>Título<input bind:value={titulo} maxlength="200" placeholder="Los ríos profundos" /></label>
            <label><span>Autor <small>(opcional)</small></span><input bind:value={autor} maxlength="120" placeholder="José María Arguedas" /></label>
          </div>
        {/if}
      {/if}
      <div class="dos">
        <label>Cantidad<input type="number" min="1" max="999" bind:value={cantidad} /></label>
        <label><span>Notas <small>(opcional)</small></span><input bind:value={notas} maxlength="300" placeholder="Edición de bolsillo, para el lunes…" /></label>
      </div>
    </section>

    {#if libro || hallado || (modoLibro === 'mano' && titulo.trim())}
      <section class="precio" data-testid="precio-encargo">
        <h3>Precio</h3>
        {#if libro}
          <p class="linea">Precio en la tienda: <strong>{soles(libro.precio)}</strong>{#if cantidad > 1} · {cantidad} ejemplares: <strong>{soles(libro.precio * cantidad)}</strong>{/if}</p>
        {:else}
          <div class="dos">
            <label><span>Costo del proveedor <small>(opcional)</small></span><input bind:value={costoTexto} inputmode="decimal" placeholder="20.00" aria-label="Costo del proveedor" /></label>
            <label><span>Margen de ganancia</span><input value="{margen} %" disabled aria-label="Margen de ganancia" /></label>
          </div>
          {#if sugerido}
            <p class="linea">Precio de venta sugerido: <strong data-testid="precio-sugerido">{soles(sugerido)}</strong> <small>(costo {soles(costo ?? 0)} + {margen} %)</small></p>
            <label class="corto">
              <span>Precio final al cliente (S/)</span>
              <input bind:value={precioTexto} inputmode="decimal" placeholder={aSoles(sugerido)} aria-label="Precio final" />
            </label>
            {#if ganancia != null}<p class="nota">Ganancia por ejemplar: {soles(ganancia)}</p>{/if}
          {:else}
            <p class="nota">Sin costo no se calcula el precio. Puedes dejarlo vacío o escribir el precio final directo.</p>
            <label class="corto">
              <span>Precio final al cliente (S/) <small>(opcional)</small></span>
              <input bind:value={precioTexto} inputmode="decimal" placeholder="35.00" aria-label="Precio final" />
            </label>
          {/if}
        {/if}
        {#if total != null && cantidad > 1}<p class="linea">Total: <strong>{soles(total)}</strong></p>{/if}
      </section>
    {/if}

    <section>
      <label class="check"><input type="checkbox" bind:checked={conAdelanto} /> Deja un adelanto</label>
      {#if conAdelanto}
        <div class="adelanto">
          <label>Monto (S/)<input bind:value={adelantoTexto} inputmode="decimal" placeholder="10.00" aria-label="Monto del adelanto" /></label>
          <div class="metodos" role="radiogroup" aria-label="Método del adelanto">
            {#each Object.entries(METODOS) as [id, m] (id)}
              <button type="button" role="radio" aria-checked={adelantoMetodo === id} class:on={adelantoMetodo === id} onclick={() => (adelantoMetodo = id as Metodo)}>
                <IconoMetodo metodo={id as Metodo} tam={20} /> {m.nombre}
              </button>
            {/each}
          </div>
          <p class="nota">El adelanto entra en la caja de hoy y se descuenta al entregar.</p>
        </div>
      {/if}
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      <button type="button" class="btn btn-blanco" onclick={onCerrar}>Cancelar</button>
      <button class="btn btn-primario" disabled={!listo || guardando}>{guardando ? 'Guardando…' : 'Anotar encargo'}</button>
    </footer>
  </form>
</aside>

<style>
  .velo {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--text) 18%, transparent);
  }
  .cajon {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(560px, calc(100vw - 24px));
    z-index: 41;
    overflow-y: auto;
    padding: 20px 22px 24px;
    border-radius: var(--r-panel);
    background: var(--surface);
    box-shadow: var(--sombra);
    box-sizing: border-box;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
  }
  .cerrar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
  }
  form,
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  form {
    gap: 18px;
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
  input:not([type='checkbox']),
  select {
    height: 40px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    font-weight: 600;
    color: var(--text);
  }
  .dos {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .seg {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
    align-self: flex-start;
  }
  .seg button {
    padding: 7px 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 13px;
  }
  .seg button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .opciones {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 190px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .opciones button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    padding: 8px 10px;
    border-radius: 10px;
    font-weight: 700;
  }
  .opciones button:hover {
    background: var(--primary-soft);
  }
  .opciones small {
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
  }
  .opciones small.cero {
    color: #b0243f;
  }
  .opciones .vacio {
    padding: 8px 10px;
    color: var(--muted);
    font-size: 13px;
  }
  .elegido {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--primary-soft);
  }
  .elegido.libro img {
    width: 34px;
    height: 50px;
    object-fit: cover;
    border-radius: 4px;
  }
  .elegido.libro span {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .elegido small {
    color: var(--muted);
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
  .nota.ok {
    color: #2f8a5c;
    font-weight: 700;
  }
  .precio {
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--yellow) 35%, var(--surface));
  }
  .linea {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .linea small {
    color: var(--muted);
  }
  label.corto {
    max-width: 220px;
  }
  input:disabled {
    background: var(--surface-2);
  }
  .nota {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
  }
  .adelanto {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .adelanto label {
    max-width: 160px;
  }
  .metodos {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .metodos button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    font-weight: 700;
    font-size: 13px;
  }
  .metodos button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .error {
    margin: 0;
    color: #b0243f;
    font-weight: 700;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @media (max-width: 560px) {
    .dos {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
