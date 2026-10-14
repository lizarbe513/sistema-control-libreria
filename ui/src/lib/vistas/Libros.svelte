<script lang="ts">
  // Inventario: lista de libros con filtros, alta, edición y stock.
  import { api, type Filtros } from '../api';
  import FormLibro from '../componentes/FormLibro.svelte';
  import Icono from '../componentes/Icono.svelte';
  import { CATEGORIAS, soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { inventario, vista } from '../inventario.svelte';
  import { miniatura } from '../portada';
  import { esDuena } from '../sesion.svelte';
  import { resolver, textoCorto } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';

  let consulta = $state('');
  let categoria = $state('');
  let filtro = $state<'todos' | 'bajo' | 'agotados' | 'sinUbicacion'>('todos');
  let libros = $state<Libro[]>([]);
  let cargando = $state(true);

  const puedeEditar = $derived(esDuena() || inventario.vendedoresEditan);
  const enEdicion = $derived(app.editar === 'nuevo' ? null : (libros.find((l) => l.id === app.editar) ?? null));
  let libroCargado = $state<Libro | null>(null);

  $effect(() => {
    const q = consulta;
    const f: Filtros = {
      categoria: categoria || null,
      stockBajo: filtro === 'bajo' || filtro === 'agotados',
      sinUbicacion: filtro === 'sinUbicacion',
      limite: 500,
    };
    const soloAgotados = filtro === 'agotados';
    void inventario.version;
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const r = (await api.buscarLibros(q, f)).map(vista);
        if (vigente) libros = soloAgotados ? r.filter((l) => l.stock === 0) : r;
      } catch (e) {
        if (vigente) avisar((e as Error).message);
      } finally {
        if (vigente) cargando = false;
      }
    }, q.trim() ? 150 : 0);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  });

  // si se pide editar un libro que no está en la lista filtrada (p. ej. desde la ficha), se trae
  $effect(() => {
    const id = app.editar;
    if (typeof id === 'number' && !libros.some((l) => l.id === id)) {
      api.libro(id).then((l) => (libroCargado = vista(l))).catch((e: Error) => avisar(e.message));
    } else libroCargado = null;
  });

  function abrir(l: Libro) {
    app.seleccionado = l;
    app.vista = 'buscar';
  }

  const FILTROS = [
    { id: 'todos', nombre: 'Todos' },
    { id: 'bajo', nombre: 'Por agotarse' },
    { id: 'agotados', nombre: 'Agotados' },
    { id: 'sinUbicacion', nombre: 'Sin ubicación' },
  ] as const;
</script>

<div class="libros" data-vacio>
  <header class="cabecera" data-vacio>
    <div>
      <h1>Libros</h1>
      <span class="atenuado">{cargando ? 'Cargando…' : `${libros.length} ${libros.length === 1 ? 'libro' : 'libros'}`}</span>
    </div>
    {#if puedeEditar}
      <button class="btn btn-primario" onclick={() => (app.editar = 'nuevo')}><Icono nombre="mas" tam={18} /> Nuevo libro</button>
    {/if}
  </header>

  <div class="herramientas" data-vacio>
    <div class="buscador">
      <Icono nombre="buscar" tam={18} />
      <input bind:value={consulta} placeholder="Buscar por título, autor, ISBN o código…" aria-label="Buscar en el inventario" />
    </div>
    <select bind:value={categoria} aria-label="Categoría">
      <option value="">Todas las categorías</option>
      {#each inventario.categorias as c (c.clave)}<option value={c.clave}>{c.nombre}</option>{/each}
    </select>
    <div class="filtros" role="radiogroup" aria-label="Filtro">
      {#each FILTROS as f (f.id)}
        <button class="filtro" class:activo={filtro === f.id} onclick={() => (filtro = f.id)} role="radio" aria-checked={filtro === f.id}>{f.nombre}</button>
      {/each}
    </div>
  </div>

  {#if !cargando && !libros.length}
    <div class="vacio vidrio">
      <span>📚</span>
      {#if consulta || categoria || filtro !== 'todos'}
        <p>Ningún libro coincide con esos filtros.</p>
      {:else}
        <p>Todavía no hay libros. {puedeEditar ? 'Agrega el primero con «Nuevo libro».' : 'Pídele a la Dueña que los agregue.'}</p>
      {/if}
    </div>
  {:else}
    <ul class="lista">
      {#each libros as l (l.id)}
        {@const u = l.ubicacion ? resolver(tienda.datos, l.ubicacion) : null}
        <li class="fila tarjeta">
          <button class="principal" onclick={() => abrir(l)} title="Ver la ficha">
            <img src={l.portada ?? miniatura(l)} alt="" />
            <span class="textos">
              <strong>{l.titulo}</strong>
              <small>{l.autor || 'Autor desconocido'} · <code>{l.codigo}</code></small>
            </span>
          </button>
          <span class="cat" style:background={CATEGORIAS[l.categoria]?.color}>{CATEGORIAS[l.categoria]?.nombre}</span>
          <span class="precio">{soles(l.precio)}</span>
          <span class="stock" class:cero={l.stock === 0} class:bajo={l.stock > 0 && l.stock <= l.stockMinimo}>{l.stock}</span>
          {#if u}
            <span class="ubic" style:background={u.info.color} style:color={u.info.fuerte}>{textoCorto(u)}</span>
          {:else}
            <span class="ubic sin">{l.ubicacion ? 'Por revisar' : 'Sin ubicación'}</span>
          {/if}
          {#if puedeEditar}
            <button class="editar" onclick={() => (app.editar = l.id)} aria-label={`Editar ${l.titulo}`} title="Editar"><Icono nombre="nota" tam={18} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if app.editar === 'nuevo'}
  <FormLibro libro={null} onCerrar={() => (app.editar = null)} />
{:else if app.editar !== null && (enEdicion ?? libroCargado)}
  {#key app.editar}
    <FormLibro libro={enEdicion ?? libroCargado} onCerrar={() => (app.editar = null)} />
  {/key}
{/if}

<style>
  .libros {
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
  }
  h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 800;
  }
  .herramientas {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .buscador {
    flex: 1;
    min-width: 260px;
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
    padding: 12px 0;
    color: var(--text);
    outline: none;
  }
  select {
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    padding: 10px 14px;
    border-radius: 999px;
    border: none;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--sombra-suave);
  }
  .filtros {
    display: flex;
    gap: 6px;
  }
  .filtro {
    padding: 8px 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 13px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  .filtro.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fila {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px 90px 54px 140px 40px;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 8px;
  }
  .principal {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    text-align: left;
  }
  .principal img {
    width: 40px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    flex: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .textos {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .textos strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .textos small {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat,
  .ubic {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 10px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ubic.sin {
    background: var(--surface-2);
    color: var(--muted);
  }
  .precio {
    font-weight: 800;
    color: var(--primary-strong);
    text-align: right;
  }
  .stock {
    font-weight: 800;
    text-align: center;
    padding: 4px 0;
    border-radius: 10px;
    background: color-mix(in srgb, #5dbb8a 20%, var(--surface));
  }
  .stock.bajo {
    background: color-mix(in srgb, #e9b949 30%, var(--surface));
  }
  .stock.cero {
    background: color-mix(in srgb, #e0405f 18%, var(--surface));
    color: #b0243f;
  }
  .editar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--primary-strong);
    background: var(--surface-2);
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px;
    text-align: center;
  }
  .vacio span {
    font-size: 48px;
  }
  .vacio p {
    margin: 0;
    color: var(--muted);
    font-weight: 600;
  }
</style>
