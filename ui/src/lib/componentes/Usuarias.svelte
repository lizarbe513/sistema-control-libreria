<script lang="ts">
  // Ajustes → Usuarias (solo la Dueña): crear cuentas de vendedoras/es y cambiar PIN.
  import { onMount } from 'svelte';
  import { api, type Rol, type Usuaria } from '../api';
  import { avisar } from '../estado.svelte';

  let personas = $state<Usuaria[]>([]);
  let nombre = $state('');
  let rol = $state<Rol>('vendedor');
  let pin = $state('');
  let ocupado = $state(false);
  let error = $state('');
  let cambiando = $state<number | null>(null);
  let nuevoPin = $state('');

  async function cargar() {
    personas = await api.usuarias();
  }
  onMount(cargar);

  async function crear(e: SubmitEvent) {
    e.preventDefault();
    ocupado = true;
    error = '';
    try {
      const u = await api.crearUsuaria(nombre, rol, pin);
      avisar(`Cuenta creada para ${u.nombre} 🌸`);
      nombre = '';
      pin = '';
      rol = 'vendedor';
      await cargar();
    } catch (x) {
      error = (x as Error).message;
    } finally {
      ocupado = false;
    }
  }

  async function guardarPin(id: number) {
    try {
      await api.cambiarPin(id, nuevoPin);
      avisar('PIN actualizado');
      cambiando = null;
      nuevoPin = '';
    } catch (x) {
      avisar((x as Error).message);
    }
  }
</script>

<ul class="lista">
  {#each personas as p (p.id)}
    <li>
      <span class="avatar">{p.nombre[0]}</span>
      <div class="quien">
        <strong>{p.nombre}</strong>
        <small>{p.rol === 'duena' ? 'Dueña' : 'Vendedor/a'}</small>
      </div>
      {#if cambiando === p.id}
        <input class="pin" type="password" inputmode="numeric" maxlength="6" placeholder="Nuevo PIN" bind:value={nuevoPin} aria-label="Nuevo PIN" />
        <button class="btn btn-primario chico" onclick={() => guardarPin(p.id)} disabled={!/^\d{4,6}$/.test(nuevoPin)}>Guardar</button>
        <button class="btn btn-blanco chico" onclick={() => (cambiando = null)}>Cancelar</button>
      {:else}
        <button class="btn btn-blanco chico" onclick={() => ((cambiando = p.id), (nuevoPin = ''))}>Cambiar PIN</button>
      {/if}
    </li>
  {/each}
</ul>

<form class="nueva" onsubmit={crear}>
  <strong>Nueva cuenta</strong>
  <input placeholder="Nombre" bind:value={nombre} maxlength="40" aria-label="Nombre" />
  <select bind:value={rol} aria-label="Rol">
    <option value="vendedor">Vendedor/a</option>
    <option value="duena">Dueña</option>
  </select>
  <input type="password" inputmode="numeric" maxlength="6" placeholder="PIN (4 a 6 números)" bind:value={pin} aria-label="PIN" />
  <button class="btn btn-primario" disabled={ocupado || !nombre.trim() || !/^\d{4,6}$/.test(pin)}>Crear</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>

<style>
  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--surface);
    flex-wrap: wrap;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .quien {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 120px;
  }
  .quien small {
    color: var(--muted);
  }
  .chico {
    font-size: 13px;
    padding: 6px 14px;
  }
  .pin,
  .nueva input,
  .nueva select {
    font: inherit;
    padding: 8px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  .pin {
    width: 120px;
  }
  .nueva {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: var(--surface-2);
  }
  .nueva strong {
    width: 100%;
  }
  .nueva input {
    flex: 1;
    min-width: 140px;
  }
  .error {
    width: 100%;
    margin: 0;
    color: #b0243f;
    font-weight: 700;
    font-size: 13px;
  }
</style>
