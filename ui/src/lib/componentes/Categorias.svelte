<script lang="ts">
  // Ajustes → Categorías (Dueña): crear, renombrar, cambiar el color y eliminar las que no tienen libros.
  import { onMount } from 'svelte';
  import { api } from '../api';
  import { avisar } from '../estado.svelte';
  import { inventario, recargarCategorias } from '../inventario.svelte';
  import Confirmar from './Confirmar.svelte';

  let conteo = $state<Record<string, number>>({});
  let nueva = $state('');
  let editando = $state<string | null>(null);
  let eNombre = $state('');
  let eColor = $state('#F1ECEE');
  let porEliminar = $state<{ clave: string; nombre: string } | null>(null);

  async function cargarConteo() {
    try {
      conteo = Object.fromEntries((await api.conteoCategorias()).map((c) => [c.clave, c.libros]));
    } catch {
      conteo = {};
    }
  }
  onMount(cargarConteo);

  async function crear(e: SubmitEvent) {
    e.preventDefault();
    try {
      const c = await api.crearCategoria(nueva);
      nueva = '';
      await recargarCategorias();
      await cargarConteo();
      avisar(`Categoría «${c.nombre}» creada`);
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  function editar(c: { clave: string; nombre: string; color: string }) {
    editando = c.clave;
    eNombre = c.nombre;
    eColor = c.color;
  }

  async function guardar(clave: string) {
    try {
      await api.editarCategoria(clave, eNombre, eColor);
      editando = null;
      await recargarCategorias();
      avisar('Categoría guardada');
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  async function eliminar() {
    const c = porEliminar;
    porEliminar = null;
    if (!c) return;
    try {
      await api.eliminarCategoria(c.clave);
      await recargarCategorias();
      await cargarConteo();
      avisar(`Se eliminó «${c.nombre}»`);
    } catch (x) {
      avisar((x as Error).message);
    }
  }
</script>

<p class="atenuado">Las categorías ordenan el inventario, los filtros y los reportes. Una categoría con libros no se puede eliminar.</p>
<ul class="lista" data-testid="lista-categorias">
  {#each inventario.categorias as c (c.clave)}
    <li>
      {#if editando === c.clave}
        <input type="color" bind:value={eColor} aria-label="Color de la categoría" />
        <input class="nombre" bind:value={eNombre} maxlength="40" aria-label="Nombre de la categoría" />
        <button class="btn btn-primario chico" onclick={() => guardar(c.clave)} disabled={!eNombre.trim()}>Guardar</button>
        <button class="btn btn-blanco chico" onclick={() => (editando = null)}>Cancelar</button>
      {:else}
        <span class="muestra" style:background={c.color}></span>
        <strong>{c.nombre}</strong>
        <small class="atenuado">{conteo[c.clave] ?? 0} {conteo[c.clave] === 1 ? 'libro' : 'libros'}</small>
        <button class="btn btn-blanco chico" onclick={() => editar(c)}>Editar</button>
        <button
          class="btn btn-blanco chico quitar"
          disabled={(conteo[c.clave] ?? 0) > 0}
          title={(conteo[c.clave] ?? 0) > 0 ? 'Tiene libros: muévelos antes de eliminarla' : 'Eliminar'}
          onclick={() => (porEliminar = c)}>Eliminar</button
        >
      {/if}
    </li>
  {/each}
</ul>
<form class="nueva" onsubmit={crear}>
  <input bind:value={nueva} maxlength="40" placeholder="Nueva categoría (ej.: Ciencia ficción)" aria-label="Nueva categoría" />
  <button class="btn btn-primario" disabled={!nueva.trim()}>Crear</button>
</form>

{#if porEliminar}
  <Confirmar titulo="¿Eliminar «{porEliminar.nombre}»?" textoSi="Sí, eliminar" peligro onSi={eliminar} onNo={() => (porEliminar = null)}>
    <p>No tiene libros, así que no se pierde nada.</p>
  </Confirmar>
{/if}

<style>
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 14px;
    background: var(--surface);
    flex-wrap: wrap;
  }
  li strong {
    flex: 1;
    min-width: 120px;
  }
  .muestra {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    border: 1px solid var(--linea);
  }
  input[type='color'] {
    width: 38px;
    height: 34px;
    padding: 0;
    border: none;
    background: none;
  }
  .nombre,
  .nueva input {
    flex: 1;
    min-width: 140px;
    font: inherit;
    padding: 7px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  .chico {
    font-size: 13px;
    padding: 6px 12px;
  }
  .quitar {
    color: #b0243f;
  }
  .quitar:disabled {
    opacity: 0.4;
  }
  .nueva {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
</style>
