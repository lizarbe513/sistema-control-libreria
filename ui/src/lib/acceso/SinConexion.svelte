<script lang="ts">
  // El celular está vinculado pero no encuentra al PC (apagado, sin la app abierta, o en otro WiFi).
  import { api } from '../api';
  import { arrancar, sesion } from '../sesion.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';

  let ocupado = $state(false);

  async function reintentar() {
    ocupado = true;
    await arrancar();
    ocupado = false;
  }

  async function otra() {
    if (!confirm('¿Vincular este celular con otro PC? Tendrás que escanear su código QR.')) return;
    api.desvincular();
    await arrancar();
  }
</script>

<MarcoAcceso titulo="No encuentro el PC 📡" subtitulo={sesion.estado?.tienda ? `Librería ${sesion.estado.tienda}` : ''}>
  <div class="cuerpo">
    <p class="motivo">{sesion.estado?.error ?? 'No se pudo conectar.'}</p>
    <ul>
      <li>El PC debe estar <b>encendido</b>, con la app de la librería abierta.</li>
      <li>El celular debe estar en el <b>mismo WiFi</b> que el PC.</li>
      <li>En el PC, Ajustes → Celulares debe estar encendido.</li>
    </ul>
    <button class="btn btn-primario" onclick={reintentar} disabled={ocupado}>{ocupado ? 'Buscando…' : 'Reintentar'}</button>
    <button class="enlace" onclick={otra}>Vincular con otro PC</button>
  </div>
</MarcoAcceso>

<style>
  .cuerpo {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .motivo {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 55%, var(--surface));
    font-weight: 700;
    font-size: 14px;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
</style>
