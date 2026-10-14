<script lang="ts">
  // Ajustes (solo la Dueña): cambiar la contraseña maestra (re-cifra la base).
  import { api } from '../api';
  import { avisar } from '../estado.svelte';
  import { fuerzaContrasena, NIVELES_FUERZA } from '../seguridad';

  let actual = $state('');
  let nueva = $state('');
  let repetida = $state('');
  let anotada = $state(false);
  let ocupado = $state(false);
  let error = $state('');

  const fuerza = $derived(fuerzaContrasena(nueva));
  const largoOk = $derived([...nueva].length >= 8);
  const listo = $derived(!!actual && largoOk && nueva === repetida && anotada && nueva !== actual);
  const pista = $derived(nueva && !largoOk ? 'Usa al menos 8 caracteres' : repetida && repetida !== nueva ? 'Las dos contraseñas no coinciden' : nueva && nueva === actual ? 'La nueva debe ser distinta de la actual' : '');

  async function cambiar(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      const llavero = await api.cambiarContrasena(actual, nueva);
      avisar(llavero ? 'Contraseña maestra cambiada 🔐' : 'Contraseña cambiada. Este equipo no tiene llavero: la pedirá al abrir');
      actual = nueva = repetida = '';
      anotada = false;
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }
</script>

<form onsubmit={cambiar}>
  <p class="atenuado">La contraseña maestra protege toda la base. En el día a día no se escribe (cada persona entra con su PIN), pero hace falta en otro PC o al restaurar un respaldo.</p>
  <label class="campo">Contraseña maestra actual<input type="password" bind:value={actual} autocomplete="current-password" /></label>
  <div class="dos">
    <label class="campo">Nueva contraseña<input type="password" bind:value={nueva} autocomplete="new-password" /></label>
    <label class="campo">Repítela<input type="password" bind:value={repetida} autocomplete="new-password" /></label>
  </div>
  {#if nueva}
    <div class="fuerza" style:--n={fuerza}><span class="barra"><span></span></span><small>{NIVELES_FUERZA[fuerza]}</small></div>
  {/if}
  <div class="aviso">
    <strong>⚠️ Anótala y guárdala en un lugar seguro.</strong> Nadie puede recuperarla. Los respaldos hechos antes del cambio seguirán pidiendo la contraseña <b>anterior</b>.
  </div>
  <label class="check"><input type="checkbox" bind:checked={anotada} /> Ya la anoté en un lugar seguro</label>
  {#if pista}<p class="pista">{pista}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="acciones"><button class="btn btn-suave" disabled={!listo || ocupado}>{ocupado ? 'Cambiando…' : 'Cambiar contraseña maestra'}</button></div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  p {
    margin: 0;
  }
  .dos {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
    min-width: 0;
  }
  .campo input {
    height: 40px;
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    color: var(--text);
  }
  .fuerza {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .barra {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: var(--linea);
    overflow: hidden;
  }
  .barra span {
    display: block;
    height: 100%;
    width: calc(var(--n) * 20%);
    min-width: 8%;
    background: color-mix(in srgb, #e0405f calc(100% - var(--n) * 20%), #5dbb8a);
    transition: width 0.3s;
  }
  .fuerza small {
    font-weight: 800;
    color: var(--muted);
    min-width: 80px;
  }
  .aviso {
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-size: 13px;
    line-height: 1.45;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
  }
  .pista {
    font-size: 13px;
    font-weight: 700;
    color: var(--primary-strong);
  }
  .error {
    color: #b0243f;
    font-weight: 700;
  }
  .acciones {
    display: flex;
    justify-content: flex-end;
  }
</style>
