<script lang="ts">
  // Cuando el llavero de este equipo no tiene la llave: se pide la contraseña maestra.
  import { api } from '../api';
  import { aplicarEstado, sesion } from '../sesion.svelte';
  import Icono from '../componentes/Icono.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';
  import AbrirCarpeta from './AbrirCarpeta.svelte';

  let contrasena = $state('');
  let ocupado = $state(false);
  let error = $state('');
  let otra = $state(false);

  async function desbloquear(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      aplicarEstado(await api.desbloquear(contrasena));
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }
</script>

{#if otra}
  <AbrirCarpeta onVolver={() => (otra = false)} />
{:else}
  <MarcoAcceso titulo="La librería está protegida" subtitulo="Escribe la contraseña maestra para abrir los datos en este equipo.">
    <div class="donde"><Icono nombre="candado" tam={18} /> {sesion.estado?.tienda} · <code>{sesion.estado?.carpeta}</code></div>
    <form onsubmit={desbloquear}>
      <label class="campo">
        Contraseña maestra
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" bind:value={contrasena} autocomplete="current-password" autofocus />
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="acciones">
        <button type="button" class="enlace" onclick={() => (otra = true)}>Usar otra carpeta</button>
        <button class="btn btn-primario" disabled={ocupado || !contrasena}>{ocupado ? 'Abriendo…' : 'Desbloquear'}</button>
      </div>
    </form>
  </MarcoAcceso>
{/if}

<style>
  .donde {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 700;
    flex-wrap: wrap;
  }
  code {
    font-size: 12px;
    word-break: break-all;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .acciones {
    align-items: center;
    justify-content: space-between !important;
  }
</style>
