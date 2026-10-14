<script lang="ts">
  // «¿Olvidaste tu PIN?»: la Dueña elige uno nuevo con la contraseña maestra.
  import { api, type Usuaria } from '../api';
  import { avisar } from '../estado.svelte';

  let { duena, onListo, onVolver }: { duena: Usuaria; onListo: () => void; onVolver: () => void } = $props();

  let contrasena = $state('');
  let pin = $state('');
  let pin2 = $state('');
  let ocupado = $state(false);
  let error = $state('');

  const pinOk = $derived(/^\d{4,6}$/.test(pin));
  const pista = $derived(pin && !pinOk ? 'El PIN debe tener de 4 a 6 números' : pin2 && pin2 !== pin ? 'Los dos PIN no coinciden' : '');

  async function cambiar(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      await api.recuperarPin(duena.id, contrasena, pin);
      avisar('Listo: ya puedes entrar con tu PIN nuevo 🔑');
      onListo();
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }
</script>

<form onsubmit={cambiar}>
  <p class="ayuda">Escribe la <strong>contraseña maestra</strong> (la que anotaste al empezar) y elige un PIN nuevo.</p>
  <label class="campo">
    Contraseña maestra
    <!-- svelte-ignore a11y_autofocus -->
    <input type="password" bind:value={contrasena} autocomplete="current-password" autofocus />
  </label>
  <div class="dos">
    <label class="campo">PIN nuevo<input type="password" inputmode="numeric" bind:value={pin} maxlength="6" autocomplete="off" /></label>
    <label class="campo">Repítelo<input type="password" inputmode="numeric" bind:value={pin2} maxlength="6" autocomplete="off" /></label>
  </div>
  {#if pista}<p class="pista">{pista}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="acciones">
    <button type="button" class="enlace" onclick={onVolver} disabled={ocupado}>← Volver</button>
    <button class="btn btn-primario" disabled={ocupado || !contrasena || !pinOk || pin !== pin2}>{ocupado ? 'Comprobando…' : 'Cambiar mi PIN'}</button>
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ayuda {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
  .dos {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .campo input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .pista {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--primary-strong);
  }
  .acciones {
    align-items: center;
    justify-content: space-between !important;
  }
</style>
