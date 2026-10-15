<script lang="ts">
  // Encargos: tablero por estados (pendiente → pedido → llegó → avisado) y las fichas de clientes.
  import { api, type Encargo, type EstadoEncargo } from '../api';
  import Clientes from '../componentes/Clientes.svelte';
  import FormEncargo from '../componentes/FormEncargo.svelte';
  import Icono from '../componentes/Icono.svelte';
  import { soles, type Formato, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { ACTIVOS, encargosCambio, encargosUI, ESTADOS, hace, SIGUIENTE } from '../encargos.svelte';
  import { inventario, vista } from '../inventario.svelte';
  import { miniatura } from '../portada';
  import { entregarEncargo } from '../ventas/carrito.svelte';

  let { movil = false }: { movil?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let pestana = $state<'tablero' | 'clientes'>(encargosUI.pestana ?? 'tablero');
  encargosUI.pestana = null;

  // «Ver encargo» desde la asistente: se resalta la tarjeta un momento y se lleva a la vista
  let resaltado = $state<number | null>(null);
  $effect(() => {
    const id = encargosUI.resaltar;
    if (id === null) return;
    encargosUI.resaltar = null;
    pestana = 'tablero';
    resaltado = id;
    let intentos = 0;
    const buscar = setInterval(() => {
      const el = document.querySelector(`[data-encargo="${id}"]`);
      if (el || ++intentos > 20) {
        clearInterval(buscar);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }, 150);
    const fin = setTimeout(() => (resaltado = null), 4000);
    return () => {
      clearInterval(buscar);
      clearTimeout(fin);
    };
  });
  let activos = $state<Encargo[]>([]);
  let cerrados = $state<Encargo[]>([]);
  let verCerrados = $state(false);
  let cargando = $state(true);

  $effect(() => {
    void encargosUI.version;
    void inventario.version;
    let vigente = true;
    api
      .encargos(true)
      .then((l) => vigente && (activos = l))
      .catch((e: Error) => avisar(e.message))
      .finally(() => (cargando = false));
    if (verCerrados) api.encargos(false).then((l) => vigente && (cerrados = l)).catch(() => {});
    return () => (vigente = false);
  });

  const columna = (e: EstadoEncargo) => activos.filter((x) => x.estado === e);

  /** Portada para la tarjeta: la guardada, o una generada con el color de tapa (o neutra si no hay libro). */
  function portadaDe(e: Encargo): string {
    if (e.portada) return api.urlPortada(e.portada);
    if (e.portadaUrl) return e.portadaUrl;
    const l: Libro = {
      id: e.libroId ?? -e.id,
      titulo: e.titulo,
      autor: e.autor,
      editorial: '',
      anio: null,
      categoria: (e.categoria as Libro['categoria']) ?? 'otros',
      precio: e.precioCent ?? 0,
      stock: e.stock ?? 0,
      ubicacion: null,
      tapa: e.colorTapa ?? '#C9A7B5',
      formato: (e.formato as Formato) ?? 'normal',
      sinopsis: '',
      codigo: '',
      isbn: null,
      portada: null,
      stockMinimo: 0,
      costo: null,
      etiquetas: [],
    };
    return miniatura(l);
  }

  async function mover(e: Encargo, a: EstadoEncargo) {
    if (e.estado === a) return;
    try {
      await api.estadoEncargo(e.id, a);
      encargosCambio();
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  async function avisarle(e: Encargo) {
    try {
      const r = await api.avisarWhatsapp(e.id);
      encargosCambio();
      avisar(r.encargo.estado === 'avisado' ? `Abrí WhatsApp para avisar a ${e.cliente} 💬` : 'Abrí WhatsApp');
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  async function venderYEntregar(e: Encargo) {
    if (!e.libroId) return;
    try {
      const aviso = entregarEncargo(e, vista(await api.libro(e.libroId)));
      if (aviso && !aviso.startsWith('Solo hay')) return avisar(aviso);
      if (aviso) avisar(aviso);
      app.vista = 'vender';
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  // ── enlazar con un libro del inventario ──
  let enlazando = $state<number | null>(null);
  let textoLibro = $state('');
  let libros = $state<Libro[]>([]);
  $effect(() => {
    const q = textoLibro;
    if (enlazando === null) return;
    const t = setTimeout(() => api.buscarLibros(q, { limite: 6 }).then((r) => (libros = r.map(vista))).catch(() => {}), 120);
    return () => clearTimeout(t);
  });
  async function enlazar(e: Encargo, l: Libro) {
    try {
      await api.enlazarLibroEncargo(e.id, l.id);
      enlazando = null;
      encargosCambio();
      avisar(`Enlazado con «${l.titulo}»`);
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  // ── cancelar ──
  let cancelando = $state<number | null>(null);
  let devolver = $state(true);
  async function cancelar(e: Encargo) {
    try {
      await api.estadoEncargo(e.id, 'cancelado', e.adelantoCent > 0 && devolver);
      cancelando = null;
      encargosCambio();
      avisar(e.adelantoCent > 0 && devolver ? `Encargo cancelado; se anotó la devolución de ${soles(e.adelantoCent)}` : 'Encargo cancelado');
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  // ── arrastrar entre columnas ──
  let arrastrado = $state<number | null>(null);
  let sobre = $state<EstadoEncargo | null>(null);
  function soltar(estado: EstadoEncargo) {
    const e = activos.find((x) => x.id === arrastrado);
    arrastrado = null;
    sobre = null;
    if (e) void mover(e, estado);
  }

  const saldo = (e: Encargo) => {
    const base = e.precioAcordadoCent ?? e.precioCent;
    return base != null ? base * e.cantidad - e.adelantoCent : null;
  };
</script>

<div class="encargos" class:movil data-vacio>
  <header class="cabecera" data-vacio>
    <h1>Encargos</h1>
    <div class="der">
      <div class="pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === 'tablero'} class:activa={pestana === 'tablero'} onclick={() => (pestana = 'tablero')}>
          Tablero{#if activos.length}<span class="bolita">{activos.length}</span>{/if}
        </button>
        <button role="tab" aria-selected={pestana === 'clientes'} class:activa={pestana === 'clientes'} onclick={() => (pestana = 'clientes')}>Clientes</button>
      </div>
      <button class="btn btn-primario" onclick={() => (encargosUI.nuevo = {})}><Icono nombre="mas" tam={18} /> Nuevo encargo</button>
    </div>
  </header>

  {#if pestana === 'clientes'}
    <Clientes />
  {:else}
    {#if !cargando && !activos.length}
      <div class="vacio vidrio">
        <span>📦</span>
        <p>No hay encargos activos. Cuando un cliente pida un libro que no está, usa <b>«¿Lo encargamos?»</b> en la búsqueda o <b>«Nuevo encargo»</b>.</p>
      </div>
    {/if}
    <div class="tablero" data-vacio>
      {#each ACTIVOS as est (est)}
        {@const lista = columna(est)}
        <section
          class="columna"
          class:sobre={sobre === est}
          style:--tono={ESTADOS[est].color}
          aria-label={ESTADOS[est].nombre}
          ondragover={(ev) => {
            if (arrastrado === null) return;
            ev.preventDefault();
            sobre = est;
          }}
          ondragleave={() => sobre === est && (sobre = null)}
          ondrop={(ev) => {
            ev.preventDefault();
            soltar(est);
          }}
        >
          <h2><span>{ESTADOS[est].emoji} {ESTADOS[est].nombre}</span><span class="n">{lista.length}</span></h2>
          {#each lista as e (e.id)}
            {@const s = saldo(e)}
            <article
              class="tarjeta enc"
              class:resaltado={resaltado === e.id}
              data-encargo={e.id}
              class:arrastrando={arrastrado === e.id}
              draggable="true"
              ondragstart={(ev) => {
                arrastrado = e.id;
                ev.dataTransfer?.setData('text/plain', String(e.id));
              }}
              ondragend={() => ((arrastrado = null), (sobre = null))}
            >
              <div class="arriba">
                <img src={portadaDe(e)} alt="" />
                <div class="txt">
                  <strong>{e.titulo}</strong>
                  {#if e.autor}<small>{e.autor}</small>{/if}
                  <span class="cli">👤 {e.cliente}{#if e.cantidad > 1} · {e.cantidad} ej.{/if}</span>
                  <small class="meta">
                    {[hace(e.creado), e.precioAcordadoCent ?? e.precioCent ? `precio ${soles((e.precioAcordadoCent ?? e.precioCent)!)}` : '', e.adelantoCent ? `adelanto ${soles(e.adelantoCent)}` : '', s != null && s > 0 ? `saldo ${soles(s)}` : ''].filter(Boolean).join(' · ')}
                  </small>
                  {#if !e.libroId}<small class="sin">Sin libro enlazado</small>{/if}
                  {#if e.notas}<small class="notas">📝 {e.notas}</small>{/if}
                </div>
              </div>

              {#if cancelando === e.id}
                <div class="confirmar">
                  {#if e.adelantoCent > 0}
                    <label><input type="checkbox" bind:checked={devolver} /> Devolver el adelanto ({soles(e.adelantoCent)})</label>
                  {/if}
                  <span class="fila">
                    <button class="btn btn-primario chico" onclick={() => cancelar(e)}>Cancelar encargo</button>
                    <button class="enlace" onclick={() => (cancelando = null)}>No</button>
                  </span>
                </div>
              {:else if enlazando === e.id}
                <div class="confirmar">
                  <!-- svelte-ignore a11y_autofocus -->
                  <input bind:value={textoLibro} placeholder="Buscar el libro en el inventario…" aria-label="Buscar libro para enlazar" autofocus />
                  <ul class="opciones">
                    {#each libros as l (l.id)}
                      <li><button onclick={() => enlazar(e, l)}>{l.titulo}<small>{l.stock ? `${l.stock} en stock` : 'agotado'}</small></button></li>
                    {/each}
                  </ul>
                  <button class="enlace" onclick={() => (enlazando = null)}>Cancelar</button>
                </div>
              {:else}
                <div class="acciones">
                  {#if (e.estado === 'llego' || e.estado === 'avisado') && e.libroId}
                    <button class="btn btn-primario chico" onclick={() => venderYEntregar(e)}>🛍️ Vender y entregar</button>
                  {/if}
                  {#if (e.estado === 'llego' || e.estado === 'avisado') && e.telefono}
                    <button class="btn btn-suave chico wa" onclick={() => avisarle(e)}>📲 {e.estado === 'avisado' ? 'Avisar otra vez' : 'Avisar por WhatsApp'}</button>
                  {/if}
                  {#if SIGUIENTE[e.estado]}
                    {@const sig = SIGUIENTE[e.estado]!}
                    <button class="btn btn-suave chico" onclick={() => mover(e, sig)}>→ {ESTADOS[sig].nombre}</button>
                  {/if}
                  {#if !e.libroId}
                    <button class="enlace" onclick={() => ((enlazando = e.id), (textoLibro = e.titulo))}>Enlazar con un libro…</button>
                  {/if}
                  <button class="enlace gris" onclick={() => ((cancelando = e.id), (devolver = true))}>Cancelar…</button>
                </div>
              {/if}
            </article>
          {:else}
            <p class="hueco">{arrastrado !== null ? 'Suelta aquí' : 'Nada por aquí'}</p>
          {/each}
        </section>
      {/each}
    </div>

    <details class="cerrados" bind:open={verCerrados}>
      <summary>Entregados y cancelados</summary>
      {#if !cerrados.length}
        <p class="hueco">Todavía no hay encargos cerrados.</p>
      {:else}
        <ul>
          {#each cerrados as e (e.id)}
            <li>
              <span class="estado" style:background={ESTADOS[e.estado].color}>{ESTADOS[e.estado].emoji} {ESTADOS[e.estado].nombre}</span>
              <strong>{e.titulo}</strong>
              <span class="atenuado">{e.cliente}</span>
              <span class="atenuado">{e.fechaCierre ? new Date(e.fechaCierre).toLocaleDateString('es-PE') : ''}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}
</div>

{#if encargosUI.nuevo}
  <FormEncargo precarga={encargosUI.nuevo} onCerrar={() => (encargosUI.nuevo = null)} />
{/if}

<style>
  .enc.resaltado {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
    animation: brillo 1s ease-in-out 3;
  }
  @keyframes brillo {
    50% {
      box-shadow: 0 0 0 8px color-mix(in srgb, var(--primary) 30%, transparent);
    }
  }
  .encargos {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 6px 24px;
  }
  .cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .der {
    display: flex;
    gap: 10px;
    align-items: center;
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
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px;
    text-align: center;
  }
  .vacio span {
    font-size: 44px;
  }
  .vacio p {
    margin: 0;
    color: var(--muted);
    font-weight: 600;
  }
  .tablero {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }
  @media (max-width: 1250px) {
    .tablero {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .movil .tablero {
    grid-template-columns: minmax(0, 1fr);
  }
  .columna {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--tono) 55%, transparent);
    min-height: 120px;
    transition: box-shadow 0.15s;
  }
  .columna.sobre {
    box-shadow: inset 0 0 0 3px var(--primary);
  }
  .columna h2 {
    margin: 2px 4px 2px;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
  }
  .n {
    min-width: 24px;
    text-align: center;
    border-radius: 999px;
    background: var(--surface);
    font-size: 12px;
    padding: 2px 6px;
  }
  .enc {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: grab;
  }
  .enc.arrastrando {
    opacity: 0.45;
  }
  .arriba {
    display: flex;
    gap: 10px;
  }
  .arriba img {
    width: 40px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    flex: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }
  .txt strong {
    line-height: 1.2;
  }
  .txt small {
    color: var(--muted);
  }
  .cli {
    font-weight: 700;
    font-size: 13px;
  }
  .meta {
    font-size: 12px;
  }
  .sin {
    color: #b0243f;
    font-weight: 700;
  }
  .notas {
    font-style: italic;
  }
  .acciones,
  .confirmar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .confirmar {
    flex-direction: column;
    align-items: stretch;
  }
  .confirmar label {
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 700;
    font-size: 13px;
  }
  .confirmar input:not([type='checkbox']) {
    height: 36px;
    border-radius: 10px;
    border: 1.5px solid var(--linea);
    padding: 0 10px;
    font: inherit;
    background: var(--surface);
    color: var(--text);
  }
  .opciones {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .opciones button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    text-align: left;
    font-weight: 700;
    font-size: 13px;
  }
  .opciones button:hover {
    background: var(--primary-soft);
  }
  .opciones small {
    color: var(--muted);
    white-space: nowrap;
  }
  .fila {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .chico {
    height: 32px;
    padding: 0 12px;
    font-size: 12.5px;
  }
  .wa {
    background: color-mix(in srgb, #25d366 22%, var(--surface));
    color: #136b38;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 12.5px;
  }
  .enlace.gris {
    color: var(--muted);
  }
  .hueco {
    margin: 0;
    padding: 14px 6px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }
  .cerrados {
    padding: 10px 16px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  .cerrados summary {
    cursor: pointer;
    font-weight: 800;
  }
  .cerrados ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cerrados li {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .estado {
    font-size: 12px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
  }
</style>
