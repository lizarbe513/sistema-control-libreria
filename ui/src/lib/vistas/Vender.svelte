<script lang="ts">
  // Nueva venta: buscar libros, armar el carrito, elegir tipo de cliente y cobrar. Y las ventas del día.
  import { api, type Cliente, type ResumenVentas, type Venta } from '../api';
  import BolsaVenta from '../componentes/BolsaVenta.svelte';
  import Cobrar from '../componentes/Cobrar.svelte';
  import Comprobante from '../componentes/Comprobante.svelte';
  import Osito from '../componentes/Osito.svelte';
  import DescuentoCampo from '../componentes/DescuentoCampo.svelte';
  import Icono from '../componentes/Icono.svelte';
  import IconoMetodo from '../componentes/IconoMetodo.svelte';
  import { cat, soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { inventario, vista } from '../inventario.svelte';
  import { miniatura } from '../portada';
  import { esDuena } from '../sesion.svelte';
  import { calculoActual, carrito, agregar, hoyLocal, METODOS, pasaElTope, quitar, rangoDia, tipoActual, vaciar, ventasCambio } from '../ventas/carrito.svelte';

  let { movil = false }: { movil?: boolean } = $props();

  let pestana = $state<'nueva' | 'hoy'>('nueva');
  let consulta = $state('');
  let resultados = $state<Libro[]>([]);
  let cobrando = $state(false);
  let comprobante = $state<Venta | null>(null);
  let entrada: HTMLInputElement | undefined = $state();

  const calc = $derived(calculoActual());
  const excede = $derived(!esDuena() && pasaElTope());
  const unidades = $derived(carrito.lineas.reduce((s, l) => s + l.cantidad, 0));

  // ── búsqueda ──
  $effect(() => {
    const q = consulta;
    void inventario.version;
    let vigente = true;
    const t = setTimeout(
      async () => {
        try {
          const r = (await api.buscarLibros(q, { limite: 24 })).map(vista);
          if (vigente) resultados = r;
        } catch (e) {
          if (vigente) avisar((e as Error).message);
        }
      },
      q.trim() ? 120 : 0,
    );
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  });

  function sumar(l: Libro) {
    const aviso = agregar(l);
    if (aviso) return avisar(aviso);
    void avisarApartado(l);
  }

  /** Si el libro está apartado para el encargo de otro cliente y no sobra stock, se avisa (no se impide). */
  async function avisarApartado(l: Libro) {
    try {
      const otros = (await api.encargosApartados(l.id)).filter((e) => e.id !== carrito.encargo?.id);
      const apartados = otros.reduce((s, e) => s + e.cantidad, 0);
      const enCarrito = carrito.lineas.find((x) => x.libro.id === l.id)?.cantidad ?? 0;
      if (otros.length && l.stock - enCarrito < apartados)
        avisar(`Ojo: «${l.titulo}» está apartado para el encargo de ${otros.map((e) => e.cliente).join(', ')} 📦`);
    } catch {
      /* solo es un aviso */
    }
  }

  const adelanto = $derived(carrito.encargo?.adelantoCent ?? 0);

  /** Enter: agrega el primer resultado con stock (sirve para un ISBN o un código escrito o escaneado). */
  async function enter() {
    const r = (await api.buscarLibros(consulta, { limite: 24 })).map(vista);
    resultados = r;
    const primero = r.find((l) => l.stock > 0) ?? r[0];
    if (!primero) return avisar('No encontré ese libro');
    sumar(primero);
    consulta = '';
    entrada?.focus();
  }

  const cantidadEn = (id: number) => carrito.lineas.find((l) => l.libro.id === id)?.cantidad ?? 0;

  function cambiarCantidad(id: number, delta: number) {
    const l = carrito.lineas.find((x) => x.libro.id === id);
    if (!l) return;
    if (delta > 0) return sumar(l.libro);
    if (l.cantidad <= 1) return quitar(id);
    l.cantidad--;
  }

  // ── cliente ──
  let buscandoCliente = $state(false);
  let textoCliente = $state('');
  let clientes = $state<Cliente[]>([]);
  let nuevoNombre = $state('');
  let nuevoTelefono = $state('');
  let creando = $state(false);

  $effect(() => {
    const q = textoCliente;
    if (!buscandoCliente) return;
    api.buscarClientes(q).then((c) => (clientes = c)).catch((e: Error) => avisar(e.message));
  });

  function elegirCliente(c: Cliente) {
    carrito.cliente = c;
    carrito.clienteNombre = c.nombre;
    // un cliente registrado como Profesor o Mayorista trae su tipo
    if (c.tipoClienteId && carrito.tipos.some((t) => t.id === c.tipoClienteId)) carrito.tipoId = c.tipoClienteId;
    buscandoCliente = false;
    textoCliente = '';
  }

  async function crearCliente() {
    try {
      const c = await api.crearCliente({ nombre: nuevoNombre, telefono: nuevoTelefono, tipoClienteId: carrito.tipoId });
      elegirCliente(c);
      creando = false;
      nuevoNombre = nuevoTelefono = '';
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  // ── venta lista ──
  function listo(v: Venta) {
    cobrando = false;
    vaciar();
    ventasCambio.version++;
    comprobante = v;
    consulta = '';
    inventario.version++;
  }

  // ── ventas del día ──
  let dia = $state(hoyLocal());
  let ventas = $state<Venta[]>([]);
  let resumen = $state<ResumenVentas | null>(null);
  let abierta = $state<number | null>(null);
  let anulando = $state<number | null>(null);
  let motivo = $state('');

  $effect(() => {
    if (pestana !== 'hoy') return;
    void ventasCambio.version;
    const [d, h] = rangoDia(dia);
    let vigente = true;
    Promise.all([api.ventas(d, h), api.resumenVentas(d, h)])
      .then(([v, r]) => {
        if (vigente) [ventas, resumen] = [v, r];
      })
      .catch((e: Error) => avisar(e.message));
    return () => (vigente = false);
  });

  async function anular(v: Venta) {
    try {
      await api.anularVenta(v.id, motivo);
      anulando = null;
      motivo = '';
      ventasCambio.version++;
      inventario.version++;
      avisar(`Venta #${v.id} anulada: el stock volvió a la tienda`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<div class="vender" class:movil data-vacio>
  <header class="cabecera" data-vacio>
    <h1>Vender</h1>
    <div class="pestanas" role="tablist">
      <button role="tab" aria-selected={pestana === 'nueva'} class:activa={pestana === 'nueva'} onclick={() => (pestana = 'nueva')}>
        Nueva venta{#if unidades}<span class="bolita">{unidades}</span>{/if}
      </button>
      <button role="tab" aria-selected={pestana === 'hoy'} class:activa={pestana === 'hoy'} onclick={() => (pestana = 'hoy')}>Ventas del día</button>
    </div>
  </header>

  {#if pestana === 'nueva'}
    <div class="cuerpo" data-vacio>
      <section class="izq" data-vacio>
        <form class="buscador" onsubmit={(e) => (e.preventDefault(), enter())}>
          <Icono nombre="buscar" tam={18} />
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:this={entrada} bind:value={consulta} placeholder="Título, autor, ISBN o código…" aria-label="Buscar libro para vender" autofocus={!movil} />
        </form>
        <ul class="resultados">
          {#each resultados as l (l.id)}
            {@const en = cantidadEn(l.id)}
            <li class="tarjeta res" class:agotado={l.stock === 0}>
              <img src={l.portada ?? miniatura(l)} alt="" />
              <span class="textos">
                <strong>{l.titulo}</strong>
                <small>{l.autor || 'Autor desconocido'}</small>
                <span class="meta">
                  <span class="cat" style:background={cat(l.categoria).color}>{cat(l.categoria).nombre}</span>
                  <span class="stk" class:cero={l.stock === 0} class:bajo={l.stock > 0 && l.stock <= l.stockMinimo}>{l.stock === 0 ? 'Agotado' : `${l.stock} en stock`}</span>
                </span>
              </span>
              <span class="precio">{soles(l.precio)}</span>
              {#if l.stock === 0}
                <button class="mas" disabled aria-label="Agotado">—</button>
              {:else}
                <button class="mas" onclick={() => sumar(l)} aria-label={`Agregar ${l.titulo}`}>{#if en}<span>{en}</span>{:else}<Icono nombre="mas" tam={18} />{/if}</button>
              {/if}
            </li>
          {:else}
            <li class="vacio">Ningún libro coincide 🔍</li>
          {/each}
        </ul>
      </section>

      <aside class="carrito vidrio" aria-label="Carrito de la venta">
        <h2>🛍️ Venta en curso</h2>
        <BolsaVenta libros={carrito.lineas.map((l) => ({ color: l.libro.tapa, cantidad: l.cantidad }))} />
        {#if carrito.encargo}
          <div class="entrega" data-testid="entrega-encargo">
            <span>📦 Entrega del encargo de <strong>{carrito.encargo.cliente}</strong>{#if adelanto} · adelanto −{soles(adelanto)}{/if}</span>
            <button class="enlace" onclick={() => (carrito.encargo = null)} title="Vender sin entregar el encargo">Quitar</button>
          </div>
        {/if}

        {#if !carrito.lineas.length}
          <div class="vacio-carrito">
            <span>🌸</span>
            <p>Busca un libro y toca <strong>＋</strong> para agregarlo.</p>
          </div>
        {:else}
          <ul class="lineas">
            {#each carrito.lineas as l, i (l.libro.id)}
              <li class="linea">
                <div class="l1">
                  <span class="nombre">{l.libro.titulo}</span>
                  <span class="imp">{soles(calc.lineas[i]?.totalCent ?? 0)}</span>
                </div>
                <div class="l2">
                  <span class="cant">
                    <button onclick={() => cambiarCantidad(l.libro.id, -1)} aria-label="Una menos">−</button>
                    <span data-testid="cantidad">{l.cantidad}</span>
                    <button onclick={() => cambiarCantidad(l.libro.id, 1)} aria-label="Una más">＋</button>
                  </span>
                  <span class="pu">× {soles(l.libro.precio)}</span>
                  <DescuentoCampo valor={l.descuento} onCambio={(d) => (l.descuento = d)} etiqueta={`Descuento de ${l.libro.titulo}`} />
                  <button class="x" onclick={() => quitar(l.libro.id)} aria-label={`Quitar ${l.libro.titulo}`}>✕</button>
                </div>
              </li>
            {/each}
          </ul>

          <div class="bloque">
            <span class="etq">Tipo de cliente</span>
            <div class="tipos" role="radiogroup" aria-label="Tipo de cliente">
              {#each carrito.tipos as t (t.id)}
                <button role="radio" aria-checked={carrito.tipoId === t.id} class:activo={carrito.tipoId === t.id} onclick={() => (carrito.tipoId = t.id)}>
                  {t.nombre}{#if t.descuentoPct}<small>−{t.descuentoPct} %</small>{/if}
                </button>
              {/each}
            </div>
          </div>

          <div class="bloque">
            <span class="etq">Nombre del cliente <small>(opcional)</small></span>
            <input class="nombre-cliente" bind:value={carrito.clienteNombre} maxlength="80" placeholder="Cliente" aria-label="Nombre del cliente" />
            {#if carrito.cliente}
              <div class="cliente">
                <span>👤 {carrito.cliente.nombre}{#if carrito.cliente.telefono} · {carrito.cliente.telefono}{/if}</span>
                <button class="enlace" onclick={() => ((carrito.cliente = null), (carrito.clienteNombre = ''))}>Quitar</button>
              </div>
            {:else if creando}
              <div class="nuevo">
                <input bind:value={nuevoNombre} placeholder="Nombre" aria-label="Nombre del cliente" />
                <input bind:value={nuevoTelefono} placeholder="Teléfono / WhatsApp" inputmode="tel" aria-label="Teléfono del cliente" />
                <span class="fila">
                  <button class="btn btn-suave chico" onclick={crearCliente}>Guardar cliente</button>
                  <button class="enlace" onclick={() => (creando = false)}>Cancelar</button>
                </span>
              </div>
            {:else if buscandoCliente}
              <input bind:value={textoCliente} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente" />
              <ul class="clientes">
                {#each clientes as c (c.id)}
                  <li><button onclick={() => elegirCliente(c)}>{c.nombre}<small>{c.telefono}</small></button></li>
                {/each}
              </ul>
              <span class="fila">
                <button class="enlace" onclick={() => ((creando = true), (buscandoCliente = false))}>＋ Cliente nuevo</button>
                <button class="enlace" onclick={() => (buscandoCliente = false)}>Cancelar</button>
              </span>
            {:else}
              <button class="enlace" onclick={() => (buscandoCliente = true)}>¿Es un cliente registrado? Buscar o crear</button>
            {/if}
          </div>

          <div class="bloque fila-desc">
            <span class="etq">Descuento al total</span>
            <DescuentoCampo valor={carrito.descuento} onCambio={(d) => (carrito.descuento = d)} etiqueta="Descuento al total" />
          </div>
          {#if excede}
            <p class="tope" role="alert">⚠️ Los descuentos a mano llegan hasta {carrito.tope} %. Para más, que lo haga la Dueña.</p>
          {/if}

          <dl class="resumen">
            <div><dt>Subtotal</dt><dd>{soles(calc.subtotalCent)}</dd></div>
            {#if calc.descuentoCent}
              <div class="desc"><dt>Descuentos {#if tipoActual()?.descuentoPct}<small>({tipoActual()?.nombre} −{tipoActual()?.descuentoPct} %)</small>{/if}</dt><dd>−{soles(calc.descuentoCent)}</dd></div>
            {/if}
            {#if adelanto}
              <div class="desc"><dt>Adelanto del encargo</dt><dd>−{soles(adelanto)}</dd></div>
            {/if}
            <div class="total"><dt>{adelanto ? 'Falta cobrar' : 'Total'}</dt><dd data-testid="total">{soles(calc.totalPrevioCent - adelanto)}</dd></div>
          </dl>

          <div class="acciones">
            <button class="enlace" onclick={vaciar}>Vaciar</button>
            <button class="btn btn-primario grande" disabled={excede || calc.totalPrevioCent <= 0} onclick={() => (cobrando = true)}>{calc.totalPrevioCent - adelanto > 0 ? `Cobrar ${soles(calc.totalPrevioCent - adelanto)}` : 'Entregar'}</button>
          </div>
        {/if}
      </aside>
    </div>
  {:else}
    <div class="dia" data-vacio>
      <div class="barra-dia">
        <label>Día <input type="date" bind:value={dia} max={hoyLocal()} aria-label="Día" /></label>
        {#if resumen}
          <div class="kpis">
            <span class="kpi"><strong data-testid="dia-total">{soles(resumen.totalCent)}</strong><small>{resumen.ventas} {resumen.ventas === 1 ? 'venta' : 'ventas'} · {resumen.unidades} libros</small></span>
            {#each resumen.porMetodo as m (m.metodo)}
              <span class="chip"><IconoMetodo metodo={m.metodo} tam={18} /> {soles(m.montoCent)}</span>
            {/each}
            {#if resumen.adelantosCent}<span class="chip" title="Adelantos de encargos recibidos ese día (menos devoluciones)">📦 incluye adelantos {soles(resumen.adelantosCent)}</span>{/if}
            {#if resumen.anuladas}<span class="chip anul">{resumen.anuladas} anulada{resumen.anuladas === 1 ? '' : 's'}</span>{/if}
          </div>
        {/if}
      </div>

      {#if !ventas.length}
        <div class="vacio vidrio"><span>☕</span><p>{dia === hoyLocal() ? 'Todavía no hay ventas hoy… ¡ya llegarán!' : 'No hubo ventas ese día.'}</p></div>
      {:else}
        <ul class="ventas">
          {#each ventas as v (v.id)}
            <li class="ticket venta" class:anulada={v.anulada}>
              <span class="sello-osito" aria-hidden="true"><Osito mono camina={false} tam={56} /></span>
              <button class="cab" onclick={() => (abierta = abierta === v.id ? null : v.id)} aria-expanded={abierta === v.id}>
                <span class="h">{hora(v.fecha)}</span>
                <span class="quien">{v.cliente} · <small>{v.vendedora}</small></span>
                <span class="res-items">{v.items.map((i) => (i.cantidad > 1 ? `${i.cantidad}× ` : '') + i.titulo).join(', ')}</span>
                <span class="mets">{#each v.pagos as p}<IconoMetodo metodo={p.metodo} tam={18} />{/each}</span>
                <strong class="monto">{soles(v.totalCent)}</strong>
                {#if v.anulada}<span class="sello">ANULADA</span>{/if}
              </button>
              {#if abierta === v.id}
                <div class="detalle">
                  <table>
                    <tbody>
                      {#each v.items as i}
                        <tr><td>{i.cantidad} × {i.titulo}</td><td>{soles(i.precioUnitCent)}</td><td class="der">{soles(i.totalCent)}</td></tr>
                      {/each}
                    </tbody>
                  </table>
                  <p class="nota">
                    {v.tipoNombre}{#if v.tipoPct} (−{v.tipoPct} %){/if}
                    {#if v.descuentoCent} · descuentos −{soles(v.descuentoCent)}{/if}
                    {#if v.redondeoCent} · redondeo −{soles(v.redondeoCent)}{/if}
                  </p>
                  <p class="nota">
                    {#each v.pagos as p}
                      <IconoMetodo metodo={p.metodo} tam={16} /> {METODOS[p.metodo].nombre} {soles(p.montoCent)}{#if p.vueltoCent} (vuelto {soles(p.vueltoCent)}){/if}{' '}
                    {/each}
                  </p>
                  {#if v.anulada}
                    <p class="nota anul">Anulada: {v.motivoAnulacion}</p>
                  {:else if esDuena()}
                    {#if anulando === v.id}
                      <span class="fila">
                        <input bind:value={motivo} placeholder="Motivo de la anulación" aria-label="Motivo de la anulación" />
                        <button class="btn btn-primario chico" onclick={() => anular(v)}>Confirmar anulación</button>
                        <button class="enlace" onclick={() => ((anulando = null), (motivo = ''))}>Cancelar</button>
                      </span>
                    {:else}
                      <button class="btn btn-suave chico" onclick={() => (anulando = v.id)}>Anular venta…</button>
                    {/if}
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

{#if comprobante}
  <Comprobante venta={comprobante} onCerrar={() => (comprobante = null)} />
{/if}

{#if cobrando}
  <Cobrar onCerrar={() => (cobrando = false)} onListo={listo} />
{/if}

<style>
  .vender {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 6px 24px;
    min-height: 0;
  }
  .cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 800;
  }
  .pestanas {
    display: flex;
    gap: 6px;
  }
  .pestanas button {
    padding: 9px 16px;
    border-radius: 999px;
    font-weight: 700;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .pestanas button.activa {
    background: var(--primary);
    color: var(--on-primary);
  }
  .bolita {
    min-width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--surface);
    color: var(--primary-strong);
    font-size: 12px;
    display: grid;
    place-items: center;
  }
  .cuerpo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 16px;
    align-items: start;
  }
  .movil .cuerpo {
    grid-template-columns: minmax(0, 1fr);
  }
  @media (max-width: 1100px) {
    .cuerpo {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .izq {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .buscador {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    color: var(--muted);
  }
  .buscador input {
    flex: 1;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 15px;
    padding: 13px 0;
    color: var(--text);
    outline: none;
  }
  .resultados {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .res {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 44px;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 8px 8px;
  }
  .res.agotado {
    opacity: 0.6;
  }
  .res img {
    width: 40px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .textos {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }
  .textos strong,
  .textos small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .textos small {
    color: var(--muted);
  }
  .meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cat,
  .stk {
    font-size: 11px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 8px;
  }
  .stk {
    background: color-mix(in srgb, #5dbb8a 22%, var(--surface));
  }
  .stk.bajo {
    background: color-mix(in srgb, #e9b949 32%, var(--surface));
  }
  .stk.cero {
    background: color-mix(in srgb, #e0405f 18%, var(--surface));
    color: #b0243f;
  }
  .precio {
    font-weight: 800;
    color: var(--primary-strong);
  }
  .mas {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 800;
    box-shadow: 0 6px 14px color-mix(in srgb, var(--primary) 40%, transparent);
    transition: transform 0.15s;
  }
  .mas:hover:not(:disabled) {
    transform: scale(1.08);
  }
  .mas:disabled {
    background: var(--surface-2);
    color: var(--muted);
    box-shadow: none;
  }
  .vacio {
    padding: 28px;
    text-align: center;
    color: var(--muted);
    font-weight: 700;
  }
  .carrito {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 6px;
    background: var(--surface);
  }
  .carrito h2 {
    margin: 0;
    font-size: 18px;
  }
  .vacio-carrito {
    text-align: center;
    padding: 24px 8px;
    color: var(--muted);
  }
  .vacio-carrito span {
    font-size: 44px;
  }
  .lineas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow: auto;
  }
  .linea {
    padding: 8px 10px;
    border-radius: 14px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .l1 {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
  }
  .nombre {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .imp {
    font-weight: 800;
    color: var(--primary-strong);
  }
  .l2 {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cant {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: var(--surface);
    border-radius: 999px;
    padding: 2px;
    font-weight: 800;
  }
  .cant button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-weight: 800;
  }
  .cant button:hover {
    background: var(--primary-soft);
  }
  .cant span {
    min-width: 22px;
    text-align: center;
  }
  .pu {
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }
  .x {
    margin-left: auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--muted);
  }
  .bloque {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fila-desc {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .etq {
    font-weight: 800;
    font-size: 13px;
  }
  .etq small {
    color: var(--muted);
    font-weight: 600;
  }
  .tipos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 6px;
  }
  .tipos button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 6px;
    border-radius: 14px;
    background: var(--surface-2);
    font-weight: 800;
  }
  .tipos button small {
    color: var(--primary-strong);
    font-weight: 800;
  }
  .tipos button.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  .tipos button.activo small {
    color: var(--on-primary);
  }
  .cliente {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }
  .nuevo,
  .bloque > input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .nuevo input,
  .bloque > input,
  .fila input {
    height: 36px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    color: var(--text);
    box-sizing: border-box;
    min-width: 0;
  }
  .clientes {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 120px;
    overflow: auto;
  }
  .clientes button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 10px;
    font-weight: 700;
    text-align: left;
  }
  .clientes button:hover {
    background: var(--primary-soft);
  }
  .clientes small {
    color: var(--muted);
  }
  .fila {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
    text-align: left;
  }
  .chico {
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
  .tope {
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-size: 13px;
    font-weight: 700;
  }
  .resumen {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 2px dashed var(--linea);
  }
  .resumen div {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
  }
  .resumen dd {
    margin: 0;
  }
  .resumen .desc dd {
    color: #2f8a5c;
  }
  .resumen small {
    color: var(--muted);
  }
  .resumen .total {
    font-size: 24px;
    font-weight: 800;
    color: var(--primary-strong);
  }
  .acciones {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .grande {
    height: 50px;
    padding: 0 26px;
    font-size: 17px;
  }
  /* ventas del día */
  .dia {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .barra-dia {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;
  }
  .barra-dia label {
    font-weight: 700;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .barra-dia input {
    height: 38px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    color: var(--text);
  }
  .kpis {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    padding: 6px 16px;
    border-radius: 16px;
    background: var(--primary-soft);
  }
  .kpi strong {
    font-size: 22px;
    color: var(--primary-strong);
  }
  .kpi small {
    color: var(--muted);
    font-weight: 700;
  }
  .anul {
    background: color-mix(in srgb, #e0405f 18%, var(--surface));
  }
  .ventas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .venta.anulada {
    opacity: 0.7;
  }
  /* papelito de caja: papel crema, borde inferior dentado, línea punteada y el Osito de una sola tinta */
  .ticket {
    position: relative;
    background: #fffdf8;
    color: #3d2f2a;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 3px 10px rgba(120, 40, 70, 0.1);
    --d: 9px;
    mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / var(--d) 51% repeat-x, linear-gradient(#000 0 0) top / 100% calc(100% - var(--d) * 0.5) no-repeat;
    padding-bottom: 8px;
    overflow: hidden;
  }
  .ticket::before {
    content: '';
    position: absolute;
    left: 102px;
    top: 10px;
    bottom: 14px;
    border-left: 2px dashed #e1d3ca;
  }
  .sello-osito {
    position: absolute;
    right: 150px;
    bottom: -4px;
    color: #3d2f2a;
    opacity: 0.14;
    pointer-events: none;
  }
  .ticket .h,
  .ticket .monto {
    font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
  }
  .ticket .quien small {
    font-weight: 600;
  }
  .entrega {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-size: 13px;
    font-weight: 600;
  }
  .nombre-cliente {
    height: 36px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    color: var(--text);
    box-sizing: border-box;
    min-width: 0;
  }
  .venta.anulada .res-items,
  .venta.anulada .monto {
    text-decoration: line-through;
  }
  .cab {
    width: 100%;
    display: grid;
    grid-template-columns: 76px 170px minmax(0, 1fr) auto auto auto;
    gap: 12px;
    align-items: center;
    padding: 12px 16px 12px 22px;
    text-align: left;
  }
  .h {
    font-weight: 800;
    white-space: nowrap;
  }
  .quien {
    color: var(--muted);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .res-items {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .monto {
    color: var(--primary-strong);
  }
  .sello {
    font-size: 11px;
    font-weight: 800;
    color: #b0243f;
    border: 2px solid #b0243f;
    border-radius: 6px;
    padding: 1px 6px;
  }
  .detalle {
    padding: 0 16px 14px 118px;
    align-items: flex-start;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .detalle table {
    border-collapse: collapse;
    width: min(560px, 100%);
    font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
    font-size: 13px;
  }
  .detalle td {
    padding: 3px 0;
    font-weight: 600;
  }
  .der {
    text-align: right;
  }
  .nota {
    margin: 0;
    color: var(--muted);
    font-weight: 700;
    font-size: 13px;
  }
  .nota.anul {
    color: #b0243f;
  }
  @media (max-width: 760px) {
    .ticket::before {
      display: none;
    }
    .detalle {
      padding-left: 16px;
    }
    .cab {
      grid-template-columns: 50px minmax(0, 1fr) auto;
    }
    .quien,
    .mets {
      display: none;
    }
    .res-items {
      grid-column: 2 / -1;
      grid-row: 2;
    }
  }
</style>
