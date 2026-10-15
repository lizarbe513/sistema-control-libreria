<script lang="ts">
  // Celular nuevo: se vincula con el PC de la tienda escaneando el QR que muestra en Ajustes → Celulares.
  import { api } from '../api';
  import { hayCamara, leer, permisoCamara } from '../escaner';
  import { aplicarEstado } from '../sesion.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';

  let nombre = $state('Celular');
  let direccion = $state('');
  let codigo = $state('');
  let pegado = $state('');
  let manual = $state(!hayCamara);
  let ocupado = $state(false);
  let error = $state('');

  async function hacer(f: () => Promise<unknown>) {
    ocupado = true;
    error = '';
    try {
      aplicarEstado((await f()) as Awaited<ReturnType<typeof api.vincularConQr>>);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      ocupado = false;
    }
  }

  async function escanear() {
    error = '';
    if (!(await permisoCamara())) return void (error = 'Sin permiso de la cámara no se puede escanear. Puedes escribir el código a mano.');
    try {
      const texto = await leer('qr');
      if (texto) await hacer(() => api.vincularConQr(texto, nombre));
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<MarcoAcceso titulo="Vincular con el PC" subtitulo="En el PC de la tienda: Ajustes → Celulares → «Vincular un celular nuevo». Luego escanea el código." ancho={480}>
  <div class="form">
    <label class="campo">
      Nombre de este celular
      <input bind:value={nombre} maxlength="40" aria-label="Nombre de este celular" />
    </label>

    {#if hayCamara}
      <button class="btn btn-primario grande" onclick={escanear} disabled={ocupado || !nombre.trim()}>{ocupado ? 'Vinculando…' : '📷 Escanear el código QR'}</button>
      <button class="enlace" onclick={() => (manual = !manual)}>{manual ? 'Ocultar' : 'No puedo escanear: escribir el código'}</button>
    {/if}

    {#if manual}
      <div class="manual">
        <label class="campo">Dirección del PC<input bind:value={direccion} placeholder="192.168.1.34:47321" inputmode="url" aria-label="Dirección del PC" /></label>
        <label class="campo">Código de 8 letras<input bind:value={codigo} placeholder="ABCD2345" maxlength="8" autocapitalize="characters" aria-label="Código de vinculación" /></label>
        <button class="btn btn-primario" onclick={() => hacer(() => api.vincularManual(direccion, codigo, nombre))} disabled={ocupado || !direccion.trim() || codigo.trim().length < 8 || !nombre.trim()}>Vincular</button>
        <details>
          <summary>Pegar el texto del QR</summary>
          <textarea bind:value={pegado} rows="3" placeholder="siglo://vincular?…" aria-label="Texto del QR"></textarea>
          <button class="btn btn-suave" onclick={() => hacer(() => api.vincularConQr(pegado, nombre))} disabled={ocupado || !pegado.trim()}>Vincular con este texto</button>
        </details>
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="ayuda">El celular y el PC deben estar en el <b>mismo WiFi</b>. La conexión va cifrada.</p>
  </div>
</MarcoAcceso>

<style>
  .form,
  .manual {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .grande {
    height: 52px;
    font-size: 17px;
  }
  .ayuda {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    padding: 8px 10px;
    font: inherit;
    background: var(--surface);
    color: var(--text);
    margin: 8px 0;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
</style>
