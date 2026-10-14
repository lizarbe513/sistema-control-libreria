<script lang="ts">
  // Mudanza a otro PC o restauración: abrir una carpeta de datos existente con la contraseña maestra.
  import { api } from '../api';
  import { aplicarEstado, sesion } from '../sesion.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';

  let { onVolver }: { onVolver: () => void } = $props();

  let carpeta = $state(sesion.estado?.carpeta ?? sesion.estado?.carpetaSugerida ?? '');
  let contrasena = $state('');
  let ocupado = $state(false);
  let error = $state('');

  async function elegir() {
    const c = await api.elegirCarpeta(carpeta || undefined);
    if (c) carpeta = c;
  }

  async function abrir(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      aplicarEstado(await api.abrirCarpeta(carpeta, contrasena));
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }
</script>

<MarcoAcceso titulo="Abrir una carpeta de datos" subtitulo="Para mudarte de PC o restaurar: elige la carpeta copiada y escribe su contraseña maestra.">
  <form onsubmit={abrir}>
    <div class="campo">
      Carpeta
      <div class="fila">
        <input value={carpeta} readonly aria-label="Carpeta elegida" />
        <button type="button" class="btn btn-blanco" onclick={elegir}>Elegir…</button>
      </div>
    </div>
    <label class="campo">
      Contraseña maestra
      <input type="password" bind:value={contrasena} autocomplete="current-password" />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="acciones">
      <button type="button" class="enlace" onclick={onVolver}>← Volver</button>
      <button class="btn btn-primario" disabled={ocupado || !carpeta || !contrasena}>{ocupado ? 'Abriendo…' : 'Abrir'}</button>
    </div>
  </form>
</MarcoAcceso>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fila {
    display: flex;
    gap: 8px;
  }
  .fila input {
    flex: 1;
    min-width: 0;
    font-size: 13px !important;
  }
  .acciones {
    align-items: center;
    justify-content: space-between !important;
  }
</style>
