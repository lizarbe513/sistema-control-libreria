<script lang="ts">
  // Ajustes (solo la Dueña): respaldos automáticos y manuales, carpeta externa y restauración.
  import { api, type EstadoRespaldos, type Respaldo } from '../api';
  import { avisar } from '../estado.svelte';
  import { aplicarEstado } from '../sesion.svelte';
  import { portal } from '../portal';
  import { fechaAmable, tamano } from '../seguridad';
  import { vaciar } from '../ventas/carrito.svelte';

  let est = $state<EstadoRespaldos | null>(null);
  let ocupado = $state(false);

  async function cargar() {
    try {
      est = await api.estadoRespaldos();
    } catch (e) {
      avisar((e as Error).message);
    }
  }
  cargar();

  const ultimo = $derived(est?.interno[0] ?? null);
  const ultimoAuto = $derived(est?.configuracion.ultimoAuto ?? est?.interno.find((r) => r.tipo === 'auto')?.fecha ?? null);
  const horas = $derived(ultimo ? (Date.now() - new Date(ultimo.fecha).getTime()) / 3_600_000 : null);
  const estado = $derived<{ clase: string; texto: string }>(
    horas === null ? { clase: 'rojo', texto: 'Todavía no hay ningún respaldo' } : horas <= 36 ? { clase: 'verde', texto: 'Al día' } : horas <= 24 * 7 ? { clase: 'amarillo', texto: 'Hace más de un día' } : { clase: 'rojo', texto: 'Hace más de una semana' },
  );

  async function ahora(destino?: string | null) {
    ocupado = true;
    try {
      const r = await api.crearRespaldo(destino);
      avisar(r.aviso ? `Respaldo hecho, pero: ${r.aviso}` : destino ? 'Respaldo hecho y copiado a esa carpeta 💾' : 'Respaldo hecho 💾');
      await cargar();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      ocupado = false;
    }
  }

  async function copiaEn() {
    const c = await api.elegirCarpeta();
    if (c) await ahora(c);
  }

  async function elegirExterno() {
    const c = await api.elegirCarpeta(est?.configuracion.externo ?? undefined);
    if (!c) return;
    try {
      est = await api.configurarRespaldos(c, est?.configuracion.conservar ?? 14);
      avisar('Carpeta externa guardada: desde ahora cada respaldo se copia ahí también');
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function guardarConfig(externo: string | null, conservar: number) {
    try {
      est = await api.configurarRespaldos(externo, conservar);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function mostrar() {
    try {
      await api.mostrarRespaldos();
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  // ── restaurar ──
  let aRestaurar = $state<{ ruta: string; nombre: string; fecha?: string } | null>(null);
  let contrasena = $state('');
  let errorRestaurar = $state('');
  let restaurando = $state(false);

  function pedirRestaurar(r: Respaldo) {
    aRestaurar = { ruta: r.ruta, nombre: r.archivo, fecha: r.fecha };
    contrasena = '';
    errorRestaurar = '';
  }

  async function desdeArchivo() {
    const z = await api.elegirRespaldo();
    if (!z) return;
    aRestaurar = { ruta: z, nombre: z.split(/[\\/]/).pop() ?? z };
    contrasena = '';
    errorRestaurar = '';
  }

  async function restaurar(e: SubmitEvent) {
    e.preventDefault();
    if (!aRestaurar) return;
    restaurando = true;
    errorRestaurar = '';
    try {
      const nuevo = await api.restaurarRespaldo(aRestaurar.ruta, contrasena);
      aRestaurar = null;
      vaciar();
      avisar('Respaldo restaurado. Entra con tu PIN 💾');
      aplicarEstado(nuevo);
    } catch (x) {
      errorRestaurar = (x as Error).message;
    } finally {
      restaurando = false;
    }
  }

  const TIPOS = { auto: 'Automático', manual: 'Manual', seguridad: 'De seguridad' } as const;
</script>

{#if est}
  <div class="respaldos">
    <div class="estado" data-testid="estado-respaldo">
      <span class="punto {estado.clase}" aria-hidden="true"></span>
      <div class="txt">
        <strong>{estado.texto}</strong>
        <span class="atenuado">
          {#if ultimo}Último respaldo: {fechaAmable(ultimo.fecha)} · {tamano(ultimo.bytes)}{#if ultimoAuto} · automático {fechaAmable(ultimoAuto)}{/if}{:else}Se hace uno solo cada día; también puedes hacerlo ahora.{/if}
        </span>
      </div>
      <button class="btn btn-primario" onclick={() => ahora()} disabled={ocupado}>{ocupado ? 'Guardando…' : '💾 Hacer un respaldo ahora'}</button>
    </div>

    <div class="externo" class:falta={!est.externoDisponible && est.configuracion.externo}>
      <div class="txt">
        <strong>Carpeta externa</strong>
        {#if est.configuracion.externo}
          <span class="atenuado ruta">{est.configuracion.externo}</span>
          <span class="chip" class:bien={est.externoDisponible}>{est.externoDisponible ? '✓ disponible' : '⚠ no se encontró: ¿está conectado el pendrive?'}</span>
        {:else}
          <span class="atenuado">Sin carpeta externa: tus respaldos solo están en este PC. Si se daña o lo roban, se pierden con él. <b>Elige una carpeta de tu pendrive o de OneDrive / Google Drive.</b></span>
        {/if}
      </div>
      <div class="acc">
        <button class="btn btn-suave" onclick={elegirExterno}>{est.configuracion.externo ? 'Cambiar…' : 'Elegir carpeta…'}</button>
        {#if est.configuracion.externo}<button class="enlace" onclick={() => guardarConfig(null, est!.configuracion.conservar)}>Quitar</button>{/if}
      </div>
    </div>

    <div class="fila-opts">
      <label class="conservar">
        Conservar los últimos
        <select value={est.configuracion.conservar} onchange={(e) => guardarConfig(est!.configuracion.externo, Number(e.currentTarget.value))} aria-label="Respaldos automáticos que se conservan">
          {#each [...new Set([7, 14, 30, est.configuracion.conservar])].sort((a, b) => a - b) as n}<option value={n}>{n}</option>{/each}
        </select>
        automáticos
      </label>
      <button class="enlace" onclick={copiaEn}>Guardar una copia en otra carpeta…</button>
      <button class="enlace" onclick={mostrar}>Ver la carpeta de respaldos</button>
    </div>

    <h3>Respaldos en este PC</h3>
    {#if est.interno.length}
      <ul class="lista">
        {#each est.interno as r (r.archivo)}
          <li>
            <span class="f">{fechaAmable(r.fecha)}</span>
            <span class="tipo {r.tipo}">{TIPOS[r.tipo]}</span>
            <small>{tamano(r.bytes)}</small>
            <button class="enlace" onclick={() => pedirRestaurar(r)} aria-label={`Restaurar el respaldo de ${fechaAmable(r.fecha)}`}>Restaurar…</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="atenuado">Todavía no hay respaldos. Haz el primero con el botón de arriba.</p>
    {/if}
    <button class="btn btn-blanco" onclick={desdeArchivo}>Restaurar desde un archivo…</button>
    <small class="atenuado">El respaldo es un archivo .zip con la base <b>cifrada</b>, las portadas y el QR: aunque lo guardes en la nube, solo se abre con la contraseña maestra.</small>
  </div>

  {#if aRestaurar}
    <div class="fondo" use:portal role="presentation" onclick={(e) => e.target === e.currentTarget && !restaurando && (aRestaurar = null)}>
      <div class="modal vidrio" role="dialog" aria-label="Restaurar un respaldo">
      <form onsubmit={restaurar}>
        <h2>Restaurar un respaldo</h2>
        <p class="aviso">
          <strong>⚠️ Esto reemplaza TODOS los datos actuales</strong> (libros, ventas, encargos, usuarias…) por los del respaldo{#if aRestaurar.fecha}{' '}del <b>{fechaAmable(aRestaurar.fecha)}</b>{/if}. Antes se hace un respaldo de seguridad de lo actual, por si te arrepientes.
          Al terminar tendrás que entrar de nuevo con tu PIN.
        </p>
        <p class="atenuado arch">{aRestaurar.nombre}</p>
        <label class="campo">
          Contraseña maestra con la que se hizo ese respaldo
          <!-- svelte-ignore a11y_autofocus -->
          <input type="password" bind:value={contrasena} autocomplete="current-password" autofocus />
        </label>
        {#if errorRestaurar}<p class="error" role="alert">{errorRestaurar}</p>{/if}
        <div class="botones">
          <button type="button" class="btn btn-blanco" onclick={() => (aRestaurar = null)} disabled={restaurando}>Cancelar</button>
          <button class="btn btn-primario" disabled={restaurando || !contrasena}>{restaurando ? 'Restaurando…' : 'Restaurar'}</button>
        </div>
      </form>
      </div>
    </div>
  {/if}
{:else}
  <p class="atenuado">Cargando…</p>
{/if}

<style>
  .respaldos {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .estado,
  .externo {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface-2);
    flex-wrap: wrap;
  }
  .externo.falta {
    background: color-mix(in srgb, var(--yellow) 55%, var(--surface));
  }
  .txt {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ruta {
    word-break: break-all;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .punto {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: none;
  }
  .punto.verde {
    background: #4cb782;
    box-shadow: 0 0 0 4px color-mix(in srgb, #4cb782 25%, transparent);
  }
  .punto.amarillo {
    background: #e9b949;
    box-shadow: 0 0 0 4px color-mix(in srgb, #e9b949 25%, transparent);
  }
  .punto.rojo {
    background: #e0405f;
    box-shadow: 0 0 0 4px color-mix(in srgb, #e0405f 25%, transparent);
  }
  .chip {
    align-self: flex-start;
    font-size: 12px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, #e9b949 40%, var(--surface));
  }
  .chip.bien {
    background: color-mix(in srgb, #5dbb8a 30%, var(--surface));
  }
  .acc {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .fila-opts {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  .conservar {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-weight: 700;
    font-size: 14px;
  }
  .conservar select {
    height: 34px;
    border-radius: 10px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 8px;
    font: inherit;
    color: var(--text);
  }
  h3 {
    margin: 6px 0 0;
    font-size: 15px;
  }
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 260px;
    overflow: auto;
  }
  .lista li {
    display: grid;
    grid-template-columns: minmax(130px, 1fr) auto auto auto;
    gap: 12px;
    align-items: center;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 14px;
  }
  .f {
    font-weight: 700;
  }
  .tipo {
    font-size: 12px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--surface);
  }
  .tipo.manual {
    background: color-mix(in srgb, #9b87e0 25%, var(--surface));
  }
  .tipo.seguridad {
    background: color-mix(in srgb, #e9b949 35%, var(--surface));
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--text) 30%, transparent);
    padding: 16px;
  }
  .modal {
    width: min(480px, 100%);
    padding: 20px 22px;
    background: var(--surface);
  }
  .modal form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .modal h2 {
    margin: 0;
  }
  .aviso {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-size: 14px;
    line-height: 1.45;
  }
  .arch {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    word-break: break-all;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
  }
  .campo input {
    height: 40px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    color: var(--text);
    box-sizing: border-box;
  }
  .botones {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .error {
    margin: 0;
    color: #b0243f;
    font-weight: 700;
  }
</style>
