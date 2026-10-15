<script lang="ts">
  import SelectorFondo from '../componentes/SelectorFondo.svelte';
  import { app, avisar, guardar, type AnimLibro } from '../estado.svelte';
  import { api } from '../api';
  import { cerrarSesion, esDuena, sesion } from '../sesion.svelte';
  import Celulares from '../componentes/Celulares.svelte';
  import CambiarContrasena from '../componentes/CambiarContrasena.svelte';
  import Respaldos from '../componentes/Respaldos.svelte';
  import MargenEncargos from '../componentes/MargenEncargos.svelte';
  import MensajeWhatsapp from '../componentes/MensajeWhatsapp.svelte';
  import MetodosPago from '../componentes/MetodosPago.svelte';
  import TiposCliente from '../componentes/TiposCliente.svelte';
  import Usuarias from '../componentes/Usuarias.svelte';
  import { inventario } from '../inventario.svelte';
  import { avisoActivo, avisarLectura, fijarAviso } from '../escaner';

  let avisoEscaneo = $state(avisoActivo());

  async function cambiarPermiso(valor: boolean) {
    try {
      inventario.vendedoresEditan = await api.permisoVendedoresEditan(valor);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  let miPin = $state('');
  let cambiandoPin = $state(false);
  async function guardarMiPin() {
    if (!sesion.usuaria) return;
    try {
      await api.cambiarPin(sesion.usuaria.id, miPin);
      avisar('Tu PIN se cambió 🔒');
      cambiandoPin = false;
      miPin = '';
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  const ANIMACIONES: { id: AnimLibro; nombre: string; emoji: string }[] = [
    { id: 'aleatoria', nombre: 'Sorpresa', emoji: '🎲' },
    { id: 'caida', nombre: 'Caída con rebote', emoji: '⬇️' },
    { id: 'estante', nombre: 'Sale del estante', emoji: '📚' },
    { id: 'pluma', nombre: 'Pluma', emoji: '🪶' },
    { id: 'trompo', nombre: 'Trompo', emoji: '🌀' },
    { id: 'pop', nombre: 'Pop elástico', emoji: '🫧' },
    { id: 'volteo', nombre: 'Vuelta de campana', emoji: '🤸' },
  ];

  function elegirAnimacion(id: AnimLibro) {
    app.calma.animLibro = id;
    guardar('calma', app.calma);
    avisar('Se verá la próxima vez que busques un libro');
  }

  const OPCIONES = [
    { clave: 'petalosRadio', nombre: 'Pétalos de la radio', detalle: 'Caen pétalos (o chispitas de noche) mientras suena la música' },
    { clave: 'animaciones', nombre: 'Animaciones', detalle: 'Rebote del libro, transiciones y pequeños detalles' },
    { clave: 'rendimiento', nombre: 'Modo rendimiento', detalle: 'Menos partículas y 30 cuadros por segundo, para PCs modestos' },
  ] as const;

  function alternar(clave: (typeof OPCIONES)[number]['clave']) {
    app.calma[clave] = !app.calma[clave];
    guardar('calma', app.calma);
  }
</script>

<div class="ajustes" data-vacio>
  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Mi perfil</h2>
    <div class="perfil">
      <span class="avatar-grande">{app.usuario[0] ?? '🌸'}</span>
      <div class="quien">
        <strong>{app.usuario}</strong>
        <span class="atenuado">{esDuena() ? 'Dueña' : 'Vendedor/a'} · {sesion.estado?.tienda}</span>
      </div>
      {#if cambiandoPin}
        <input class="pin" type="password" inputmode="numeric" maxlength="6" placeholder="Nuevo PIN" bind:value={miPin} aria-label="Nuevo PIN" />
        <button class="btn btn-primario" onclick={guardarMiPin} disabled={!/^\d{4,6}$/.test(miPin)}>Guardar</button>
      {:else}
        <button class="btn btn-blanco" onclick={() => (cambiandoPin = true)}>Cambiar mi PIN</button>
      {/if}
      <button class="btn btn-blanco" onclick={cerrarSesion}>Cerrar sesión</button>
    </div>
  </section>

  {#if esDuena()}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Usuarias y usuarios</h2>
      <p class="atenuado">Cada persona entra con su PIN. Los vendedores no ven costos ni reportes.</p>
      <Usuarias />
      <label class="interruptor">
        <div>
          <strong>Los vendedores pueden agregar y editar libros</strong>
          <span class="atenuado">Útil para la carga inicial del inventario. Nunca ven los costos.</span>
        </div>
        <input type="checkbox" checked={inventario.vendedoresEditan} onchange={(e) => cambiarPermiso(e.currentTarget.checked)} />
        <span class="pastilla" aria-hidden="true"></span>
      </label>
    </section>

    {#if !api.esCelular}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Respaldos</h2>
      <Respaldos />
    </section>
    {/if}

    {#if !api.esCelular}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Celulares</h2>
      <Celulares />
    </section>
    {/if}

    {#if !api.esCelular}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Seguridad: contraseña maestra</h2>
      <CambiarContrasena />
    </section>
    {/if}

    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Tipos de cliente y descuentos</h2>
      <TiposCliente />
    </section>

    {#if !api.esCelular}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Métodos de pago</h2>
      <MetodosPago />
    </section>
    {/if}

    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Mensaje de WhatsApp para encargos</h2>
      <MensajeWhatsapp />
    </section>

    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Margen de ganancia en encargos</h2>
      <MargenEncargos />
    </section>
  {/if}

  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Fondo animado</h2>
    <p class="atenuado">Elige el ambiente. Interactúa con los espacios vacíos del fondo: ¡cada uno esconde algo!</p>
    <SelectorFondo grande />
  </section>

  {#if api.esCelular}
    <section class="vidrio bloque">
      <h2 class="titulo-seccion">Este celular</h2>
      <label class="interruptor">
        <div>
          <strong>Sonido y vibración al escanear</strong>
          <span class="atenuado">Un «bip» y una vibración corta cada vez que la cámara lee un código.</span>
        </div>
        <input
          type="checkbox"
          checked={avisoEscaneo}
          onchange={(e) => {
            avisoEscaneo = e.currentTarget.checked;
            fijarAviso(avisoEscaneo);
            avisarLectura();
          }}
        />
        <span class="pastilla" aria-hidden="true"></span>
      </label>
    </section>
  {/if}

  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Calma</h2>
    {#each OPCIONES as o}
      <label class="interruptor">
        <div>
          <strong>{o.nombre}</strong>
          <span class="atenuado">{o.detalle}</span>
        </div>
        <input type="checkbox" checked={app.calma[o.clave]} onchange={() => alternar(o.clave)} />
        <span class="pastilla" aria-hidden="true"></span>
      </label>
    {/each}
  </section>

  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Cómo aparece el libro</h2>
    <p class="atenuado">Elige una entrada, o deja «Sorpresa» para que cambie cada vez.</p>
    <div class="anims">
      {#each ANIMACIONES as a}
        <button class="chip" class:activo={app.calma.animLibro === a.id} onclick={() => elegirAnimacion(a.id)}>{a.emoji} {a.nombre}</button>
      {/each}
    </div>
  </section>
</div>

<style>
  .perfil {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .avatar-grande {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-size: 24px;
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .perfil .quien {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 160px;
  }
  .perfil .pin {
    width: 120px;
    font: inherit;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  .anims .chip {
    padding: 9px 14px;
    font-size: 14px;
    background: var(--surface);
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.2s;
  }
  .anims .chip:hover {
    transform: translateY(-1px);
  }
  .anims .chip.activo {
    border-color: var(--primary);
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .anims {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ajustes {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 4px 4px 24px;
    max-width: 900px;
  }
  .bloque {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bloque p {
    margin: -6px 0 4px;
    font-size: 14px;
  }
  .interruptor {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--surface);
    cursor: pointer;
  }
  .interruptor div {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .interruptor span.atenuado {
    font-size: 13px;
  }
  .interruptor input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .pastilla {
    width: 48px;
    height: 28px;
    border-radius: 14px;
    background: var(--linea);
    position: relative;
    transition: background 0.2s;
    flex: none;
  }
  .pastilla::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  input:checked + .pastilla {
    background: var(--primary);
  }
  input:checked + .pastilla::after {
    transform: translateX(20px);
  }
  input:focus-visible + .pastilla {
    outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
    outline-offset: 2px;
  }
</style>
