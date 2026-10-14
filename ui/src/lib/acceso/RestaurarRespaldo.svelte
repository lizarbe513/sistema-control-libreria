<script lang="ts">
  // PC nuevo: restaurar un respaldo (.zip) en una carpeta nueva, con la contraseña maestra con que se hizo.
  import { api } from '../api';
  import { aplicarEstado, sesion } from '../sesion.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';

  let { onVolver }: { onVolver: () => void } = $props();

  let zip = $state('');
  // svelte-ignore state_referenced_locally
  let carpeta = $state(sesion.estado?.carpetaSugerida ?? '');
  let contrasena = $state('');
  let ocupado = $state(false);
  let error = $state('');

  async function elegirZip() {
    const z = await api.elegirRespaldo();
    if (z) zip = z;
  }
  async function elegirCarpeta() {
    const c = await api.elegirCarpeta(carpeta || undefined);
    if (c) carpeta = c;
  }

  async function restaurar(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      aplicarEstado(await api.restaurarNuevo(zip, carpeta, contrasena));
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }

  const nombre = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;
</script>

<MarcoAcceso titulo="Restaurar un respaldo" subtitulo="Para un PC nuevo: elige el respaldo, la carpeta donde quedarán los datos y la contraseña maestra con la que se hizo.">
  <form onsubmit={restaurar}>
    <div class="campo">
      Respaldo (.zip)
      <div class="fila">
        <input value={zip ? nombre(zip) : ''} placeholder="Ningún archivo elegido" readonly aria-label="Respaldo elegido" />
        <button type="button" class="btn btn-blanco" onclick={elegirZip}>Elegir…</button>
      </div>
    </div>
    <div class="campo">
      Carpeta de datos nueva
      <div class="fila">
        <input value={carpeta} readonly aria-label="Carpeta de datos" />
        <button type="button" class="btn btn-blanco" onclick={elegirCarpeta}>Cambiar…</button>
      </div>
    </div>
    <label class="campo">
      Contraseña maestra del respaldo
      <input type="password" bind:value={contrasena} autocomplete="current-password" />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="acciones">
      <button type="button" class="enlace" onclick={onVolver} disabled={ocupado}>← Volver</button>
      <button class="btn btn-primario" disabled={ocupado || !zip || !carpeta || !contrasena}>{ocupado ? 'Restaurando…' : 'Restaurar'}</button>
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
