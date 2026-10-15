<script lang="ts">
  // Aviso discreto de «hay una versión nueva» (PC). Se revisa una vez al entrar.
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { actualizacion, hayActualizador, instalar, revisar } from '../actualizacion.svelte';

  let oculto = $state(false);
  onMount(() => {
    if (hayActualizador) setTimeout(() => void revisar(), 4000);
  });
</script>

{#if actualizacion.nueva && !oculto}
  <div class="aviso tarjeta" role="status" transition:fly={{ y: -20, duration: 300 }} data-testid="aviso-actualizacion">
    <span class="ico">⬆️</span>
    <div class="texto">
      <strong>Hay una versión nueva ({actualizacion.nueva})</strong>
      <small>
        {#if actualizacion.instalando}
          Actualizando{actualizacion.progreso === null ? '…' : ` ${actualizacion.progreso} %`}. La app se reiniciará sola.
        {:else}
          Antes de instalar se guarda un respaldo de tus datos.
        {/if}
      </small>
      {#if actualizacion.instalando}
        <div class="barra"><span style:width="{actualizacion.progreso ?? 8}%"></span></div>
      {/if}
    </div>
    {#if !actualizacion.instalando}
      <button class="btn btn-blanco" onclick={() => (oculto = true)}>Después</button>
      <button class="btn btn-primario" onclick={instalar}>Actualizar</button>
    {/if}
  </div>
{/if}

<style>
  .aviso {
    position: fixed;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 18px;
    width: min(560px, 92vw);
  }
  .ico {
    font-size: 22px;
  }
  .texto {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  small {
    color: var(--muted);
  }
  .barra {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    margin-top: 6px;
    overflow: hidden;
  }
  .barra span {
    display: block;
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }
</style>
