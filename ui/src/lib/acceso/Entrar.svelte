<script lang="ts">
  // ¿Quién atiende hoy? Tarjetas de cada persona y el teclado de PIN.
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { api, type Usuaria } from '../api';
  import { saludo } from '../estado.svelte';
  import { entrarCon, sesion } from '../sesion.svelte';
  import TecladoPin from '../componentes/TecladoPin.svelte';
  import MarcoAcceso from './MarcoAcceso.svelte';
  import OlvidePin from './OlvidePin.svelte';

  let personas = $state<Usuaria[]>([]);
  let elegida = $state<Usuaria | null>(null);
  let ocupado = $state(false);
  let error = $state('');
  let sacudir = $state(0);
  let olvido = $state(false);

  onMount(async () => {
    try {
      personas = await api.usuarias();
      if (personas.length === 1) elegida = personas[0];
    } catch (e) {
      error = (e as Error).message;
    }
  });

  async function enviar(pin: string) {
    if (!elegida) return;
    ocupado = true;
    error = '';
    try {
      entrarCon(await api.iniciarSesion(elegida.id, pin));
    } catch (e) {
      error = (e as Error).message;
      sacudir++;
    } finally {
      ocupado = false;
    }
  }

  const COLORES = ['#F27A9B', '#9B87E0', '#5DBB8A', '#6FA8DC', '#E9B949', '#F0A070'];
</script>

<MarcoAcceso titulo={elegida ? `${saludo()}, ${elegida.nombre}` : `${saludo()} ✨`} subtitulo={olvido ? 'Con la contraseña maestra eliges un PIN nuevo' : elegida ? 'Escribe tu PIN' : `¿Quién atiende hoy en ${sesion.estado?.tienda ?? 'la librería'}?`} ancho={elegida ? 400 : 560}>
  {#if !elegida}
    <div class="personas" in:fly={{ y: 10, duration: 300 }}>
      {#each personas as p, i (p.id)}
        <button class="persona" onclick={() => (elegida = p)}>
          <span class="avatar" style:background={COLORES[i % COLORES.length]}>{p.nombre[0]}</span>
          <strong>{p.nombre}</strong>
          <small>{p.rol === 'duena' ? 'Dueña' : 'Vendedor/a'}</small>
        </button>
      {/each}
    </div>
  {:else if olvido}
    <div in:fly={{ x: 20, duration: 300 }}>
      <OlvidePin duena={elegida} onListo={() => ((olvido = false), (error = ''))} onVolver={() => (olvido = false)} />
    </div>
  {:else}
    <div class="pin" in:fly={{ x: 20, duration: 300 }}>
      <TecladoPin onEnviar={enviar} {ocupado} {sacudir} />
      {#if elegida.rol === 'duena'}
        <button class="enlace" onclick={() => ((olvido = true), (error = ''))}>¿Olvidaste tu PIN?</button>
      {/if}
      {#if personas.length > 1}
        <button class="enlace" onclick={() => ((elegida = null), (error = ''))}>← No soy {elegida.nombre}</button>
      {/if}
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</MarcoAcceso>

<style>
  .personas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .persona {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 10px;
    border-radius: 20px;
    background: var(--surface);
    border: 2px solid transparent;
    box-shadow: var(--sombra-suave);
    transition:
      transform 0.15s,
      border-color 0.2s;
  }
  .persona:hover {
    transform: translateY(-3px);
    border-color: var(--primary);
  }
  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 28px;
    font-weight: 800;
  }
  .persona small {
    color: var(--muted);
    font-weight: 700;
  }
  .pin {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding-top: 6px;
  }
</style>
