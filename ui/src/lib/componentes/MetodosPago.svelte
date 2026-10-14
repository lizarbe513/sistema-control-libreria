<script lang="ts">
  // Ajustes (solo la Dueña): el QR de Yape del negocio, que se muestra al cobrar con Yape/Plin.
  import { api } from '../api';
  import { avisar } from '../estado.svelte';
  import IconoMetodo from './IconoMetodo.svelte';

  let qr = $state<string | null | undefined>(undefined);
  api.qrPago().then((q) => (qr = q)).catch(() => (qr = null));

  async function elegir() {
    try {
      const origen = await api.elegirImagen();
      if (!origen) return;
      qr = await api.guardarQrPago(origen);
      avisar('QR de Yape guardado 💜');
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function quitar() {
    try {
      await api.quitarQrPago();
      qr = null;
      avisar('Se quitó el QR de Yape');
    } catch (e) {
      avisar((e as Error).message);
    }
  }
</script>

<div class="metodos">
  <div class="cab"><IconoMetodo metodo="yape_plin" tam={34} /><div><strong>QR de Yape del negocio</strong><span class="atenuado">Se muestra al cobrar con Yape/Plin para que el cliente lo escanee.</span></div></div>
  <div class="cuerpo">
    {#if qr}
      <img src={qr} alt="QR de Yape del negocio" />
    {:else if qr === null}
      <div class="vacio">Todavía no hay un QR establecido</div>
    {/if}
    <div class="acciones">
      <button class="btn btn-suave" onclick={elegir}>{qr ? 'Cambiar QR…' : 'Elegir imagen del QR…'}</button>
      {#if qr}<button class="enlace" onclick={quitar}>Quitar</button>{/if}
      <small class="atenuado">Usa la captura o la imagen del QR que te da la app de Yape (PNG o JPG).</small>
    </div>
  </div>
</div>

<style>
  .metodos {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cab {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .cab div {
    display: flex;
    flex-direction: column;
  }
  .cuerpo {
    display: flex;
    gap: 18px;
    align-items: center;
    flex-wrap: wrap;
  }
  img {
    width: 150px;
    border-radius: 14px;
    box-shadow: var(--sombra-suave);
  }
  .vacio {
    width: 150px;
    height: 110px;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 10px;
    box-sizing: border-box;
    border: 3px dashed color-mix(in srgb, #742284 50%, transparent);
    border-radius: 14px;
    color: var(--muted);
    font-weight: 700;
    font-size: 13px;
  }
  .acciones {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    max-width: 260px;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
</style>
