<script lang="ts">
  // «+ Nueva» junto a un selector de categoría: la crea ahí mismo y queda elegida (sin ir a Ajustes).
  import { api } from '../api';
  import { avisar } from '../estado.svelte';
  import { recargarCategorias } from '../inventario.svelte';

  let { onCreada }: { onCreada: (clave: string) => void } = $props();

  let abierto = $state(false);
  let nombre = $state('');
  let ocupado = $state(false);
  let campo = $state<HTMLInputElement>();

  $effect(() => {
    if (abierto) campo?.focus();
  });

  async function crear() {
    if (!nombre.trim() || ocupado) return;
    ocupado = true;
    try {
      const c = await api.crearCategoria(nombre);
      await recargarCategorias();
      onCreada(c.clave);
      avisar(`Categoría «${c.nombre}» creada`);
      nombre = '';
      abierto = false;
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      ocupado = false;
    }
  }
</script>

{#if abierto}
  <span class="nueva">
    <input
      bind:this={campo}
      bind:value={nombre}
      maxlength="40"
      placeholder="Nombre de la categoría"
      aria-label="Nombre de la categoría nueva"
      onkeydown={(e) => {
        if (e.key === 'Enter') (e.preventDefault(), crear());
        if (e.key === 'Escape') (e.stopPropagation(), (abierto = false));
      }}
    />
    <button type="button" class="btn btn-primario chico" onclick={crear} disabled={!nombre.trim() || ocupado}>Crear</button>
    <button type="button" class="x" onclick={() => (abierto = false)} aria-label="Cancelar">✕</button>
  </span>
{:else}
  <button type="button" class="mas" onclick={() => (abierto = true)} data-testid="nueva-categoria">+ Nueva</button>
{/if}

<style>
  .mas {
    font-size: 12px;
    font-weight: 800;
    color: var(--primary-strong);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--primary-soft);
  }
  .nueva {
    width: 100%;
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .nueva input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-weight: 600;
    padding: 7px 10px;
    border-radius: 10px;
    border: 2px solid var(--primary);
    background: var(--surface);
    color: var(--text);
  }
  .chico {
    font-size: 13px;
    padding: 6px 12px;
  }
  .x {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-2);
    font-weight: 800;
  }
</style>
