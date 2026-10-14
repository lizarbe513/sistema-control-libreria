<script lang="ts">
  // Primer arranque: prepara la carpeta de datos, la contraseña maestra, la tienda y la cuenta de la Dueña.
  import { fly } from 'svelte/transition';
  import { api } from '../api';
  import { aplicarEstado, sesion } from '../sesion.svelte';
  import { fuerzaContrasena, NIVELES_FUERZA } from '../seguridad';
  import AbrirCarpeta from './AbrirCarpeta.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';

  import RestaurarRespaldo from './RestaurarRespaldo.svelte';

  type Paso = 'hola' | 'carpeta' | 'contrasena' | 'tienda' | 'duena';
  const PASOS: Paso[] = ['hola', 'carpeta', 'contrasena', 'tienda', 'duena'];

  let paso = $state<Paso>('hola');
  let existente = $state(false);
  let restaurando = $state(false);
  let carpeta = $state(sesion.estado?.carpetaSugerida ?? '');
  let contrasena = $state('');
  let repetida = $state('');
  let anotada = $state(false);
  let tienda = $state('SIGLO XXI');
  let nombre = $state('');
  let pin = $state('');
  let pin2 = $state('');
  let ocupado = $state(false);
  let error = $state('');

  const indice = $derived(PASOS.indexOf(paso));

  const fuerza = $derived(fuerzaContrasena(contrasena));
  const NIVELES = NIVELES_FUERZA;

  const puedeSeguir = $derived.by(() => {
    switch (paso) {
      case 'carpeta':
        return !!carpeta.trim();
      case 'contrasena':
        return [...contrasena].length >= 8 && contrasena === repetida && anotada;
      case 'tienda':
        return !!tienda.trim();
      case 'duena':
        return !!nombre.trim() && /^\d{4,6}$/.test(pin) && pin === pin2;
      default:
        return true;
    }
  });

  const pista = $derived.by(() => {
    if (paso === 'contrasena') {
      if (contrasena && [...contrasena].length < 8) return 'Usa al menos 8 caracteres';
      if (repetida && repetida !== contrasena) return 'Las dos contraseñas no coinciden';
    }
    if (paso === 'duena') {
      if (pin && !/^\d{4,6}$/.test(pin)) return 'El PIN debe tener de 4 a 6 números';
      if (pin2 && pin2 !== pin) return 'Los dos PIN no coinciden';
    }
    return '';
  });

  function siguiente(e?: SubmitEvent) {
    e?.preventDefault();
    if (!puedeSeguir) return;
    error = '';
    if (paso === 'duena') return terminar();
    paso = PASOS[indice + 1];
  }

  async function elegir() {
    const c = await api.elegirCarpeta(carpeta || undefined);
    if (c) carpeta = c;
  }

  async function terminar() {
    ocupado = true;
    error = '';
    try {
      aplicarEstado(await api.configurar({ carpeta, contrasena, tienda, nombre, pin }));
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }

  const TITULOS: Record<Paso, [string, string]> = {
    hola: ['¡Bienvenida! ✨', 'Vamos a preparar tu librería. Son cinco pasos cortitos.'],
    carpeta: ['¿Dónde guardamos los datos?', 'Todo vive en una sola carpeta: la base de datos cifrada y las portadas. Para mudarte de PC basta copiarla.'],
    contrasena: ['La contraseña maestra', 'Protege toda la información de la tienda. En el día a día no la vas a escribir: cada persona entra con su PIN.'],
    tienda: ['¿Cómo se llama la tienda?', 'Aparecerá en la pantalla de entrada.'],
    duena: ['Tu cuenta de Dueña', 'Con ella administras la tienda, los usuarios y los reportes.'],
  };
</script>

{#if existente}
  <AbrirCarpeta onVolver={() => (existente = false)} />
{:else if restaurando}
  <RestaurarRespaldo onVolver={() => (restaurando = false)} />
{:else}
  <MarcoAcceso titulo={TITULOS[paso][0]} subtitulo={TITULOS[paso][1]} ancho={500}>
    <div class="progreso" aria-label={`Paso ${indice + 1} de ${PASOS.length}`}>
      {#each PASOS as p, i}<span class:hecho={i <= indice}></span>{/each}
    </div>

    {#key paso}
      <form onsubmit={siguiente} in:fly={{ x: 24, duration: 280 }}>
        {#if paso === 'hola'}
          <div class="ilustracion">📚🌸</div>
          <div class="acciones columna">
            <button class="btn btn-primario grande">Empezar</button>
            <button type="button" class="enlace" onclick={() => (existente = true)}>Ya tengo una carpeta de datos (mudanza)</button>
            <button type="button" class="enlace" onclick={() => (restaurando = true)}>Restaurar desde un respaldo (.zip)</button>
          </div>
        {:else if paso === 'carpeta'}
          <div class="campo">
            Carpeta de datos
            <div class="fila">
              <input value={carpeta} readonly aria-label="Carpeta de datos" />
              <button type="button" class="btn btn-blanco" onclick={elegir}>Cambiar…</button>
            </div>
          </div>
        {:else if paso === 'contrasena'}
          <label class="campo">
            Contraseña maestra
            <!-- svelte-ignore a11y_autofocus -->
            <input type="password" bind:value={contrasena} autocomplete="new-password" autofocus />
          </label>
          {#if contrasena}
            <div class="fuerza" style:--n={fuerza}>
              <span class="barra"><span></span></span>
              <small>{NIVELES[fuerza]}</small>
            </div>
          {/if}
          <label class="campo">
            Repítela
            <input type="password" bind:value={repetida} autocomplete="new-password" />
          </label>
          <div class="aviso">
            <strong>⚠️ Anótala y guárdala en un lugar seguro.</strong>
            Sin ella no se pueden abrir los datos en otro PC ni restaurar un respaldo. Nadie puede recuperarla.
          </div>
          <label class="check"><input type="checkbox" bind:checked={anotada} /> Ya la anoté en un lugar seguro</label>
        {:else if paso === 'tienda'}
          <label class="campo">
            Nombre de la tienda
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={tienda} maxlength="60" autofocus />
          </label>
        {:else}
          <label class="campo">
            Tu nombre
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={nombre} maxlength="40" autocomplete="name" autofocus />
          </label>
          <div class="dos">
            <label class="campo">
              PIN (4 a 6 números)
              <input type="password" inputmode="numeric" bind:value={pin} maxlength="6" autocomplete="off" />
            </label>
            <label class="campo">
              Repite el PIN
              <input type="password" inputmode="numeric" bind:value={pin2} maxlength="6" autocomplete="off" />
            </label>
          </div>
        {/if}

        {#if pista}<p class="pista">{pista}</p>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}

        {#if paso !== 'hola'}
          <div class="acciones">
            <button type="button" class="enlace" onclick={() => (paso = PASOS[indice - 1])} disabled={ocupado}>← Atrás</button>
            <button class="btn btn-primario" disabled={!puedeSeguir || ocupado}>
              {paso === 'duena' ? (ocupado ? 'Preparando…' : '¡Listo, abrir la tienda!') : 'Siguiente'}
            </button>
          </div>
        {/if}
      </form>
    {/key}
  </MarcoAcceso>
{/if}

<style>
  .progreso {
    display: flex;
    gap: 6px;
  }
  .progreso span {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--linea);
    transition: background 0.3s;
  }
  .progreso span.hecho {
    background: var(--primary);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ilustracion {
    font-size: 64px;
    text-align: center;
    padding: 12px 0;
    animation: flotar 3s ease-in-out infinite;
  }
  @keyframes flotar {
    50% {
      transform: translateY(-8px);
    }
  }
  .columna {
    flex-direction: column;
    align-items: center !important;
    justify-content: center !important;
  }
  .grande {
    font-size: 17px;
    padding: 12px 34px;
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
  .dos {
    display: grid;
    /* minmax(0, …): el ancho mínimo propio de un <input> no debe ensanchar la columna */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  .fuerza {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: -4px;
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
    padding: 12px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--yellow) 70%, var(--surface));
    font-size: 13px;
    line-height: 1.45;
  }
  .aviso strong {
    display: block;
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
