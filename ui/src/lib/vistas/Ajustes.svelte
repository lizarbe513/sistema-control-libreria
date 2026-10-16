<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ajustesUI } from '../ajustes.svelte';
  import { alAtras } from '../atras.svelte';
  import SelectorFondo from '../componentes/SelectorFondo.svelte';
  import { app, avisar, guardar, type AnimLibro } from '../estado.svelte';
  import { api } from '../api';
  import { cerrarSesion, esDuena, sesion } from '../sesion.svelte';
  import Celulares from '../componentes/Celulares.svelte';
  import CambiarContrasena from '../componentes/CambiarContrasena.svelte';
  import Icono, { type NombreIcono } from '../componentes/Icono.svelte';
  import Interruptor from '../componentes/Interruptor.svelte';
  import Respaldos from '../componentes/Respaldos.svelte';
  import MargenEncargos from '../componentes/MargenEncargos.svelte';
  import MensajeWhatsapp from '../componentes/MensajeWhatsapp.svelte';
  import MetodosPago from '../componentes/MetodosPago.svelte';
  import TiposCliente from '../componentes/TiposCliente.svelte';
  import Usuarias from '../componentes/Usuarias.svelte';
  import Categorias from '../componentes/Categorias.svelte';
  import AsistenteConfig from '../componentes/AsistenteConfig.svelte';
  import { inventario } from '../inventario.svelte';
  import { avisoActivo, avisarLectura, fijarAviso } from '../escaner';
  import { actualizacion, esCelular, hayActualizador, revisar, versionActual } from '../actualizacion.svelte';

  /** En el celular (o ventana angosta) se ve la lista y, al tocar una fila, su página con «atrás». */
  let { movil = false }: { movil?: boolean } = $props();

  onMount(() => void versionActual());
  onDestroy(() => (ajustesUI.seccion = ''));

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
    { clave: 'rendimiento', nombre: 'Modo rendimiento', detalle: 'Quita animaciones y efectos: solo lo básico para trabajar, ideal para PCs modestos' },
  ] as const;

  function alternar(clave: (typeof OPCIONES)[number]['clave']) {
    app.calma[clave] = !app.calma[clave];
    guardar('calma', app.calma);
  }

  // ── Lista de secciones (estilo Ajustes de Android) ──
  const GRUPOS = ['Cuenta', 'Tienda', 'Equipo'];
  type Seccion = { id: string; grupo: string; nombre: string; detalle: string; icono: NombreIcono; color: string; claves: string; visible: boolean };

  const duena = $derived(esDuena());
  const secciones = $derived<Seccion[]>(
    (
      [
        { id: 'perfil', grupo: 'Cuenta', nombre: 'Mi perfil', detalle: 'Tu PIN y cerrar sesión', icono: 'usuario', color: 'var(--primary-soft)', claves: 'pin clave contraseña salir', visible: true },
        { id: 'usuarios', grupo: 'Tienda', nombre: 'Usuarias y usuarios', detalle: 'Quién entra y qué puede hacer', icono: 'usuario', color: 'var(--lilac)', claves: 'vendedores permisos pin', visible: duena },
        { id: 'categorias', grupo: 'Tienda', nombre: 'Categorías', detalle: 'Cómo se agrupan los libros', icono: 'etiqueta', color: 'var(--mint)', claves: 'etiquetas colores', visible: duena },
        { id: 'ventas', grupo: 'Tienda', nombre: 'Ventas y cobros', detalle: api.esCelular ? 'Tipos de cliente y descuentos' : 'Descuentos, Yape y métodos de pago', icono: 'tarjeta', color: 'var(--yellow)', claves: 'tipos cliente descuento yape plin efectivo pago qr', visible: duena },
        { id: 'encargos', grupo: 'Tienda', nombre: 'Encargos', detalle: 'Mensaje de WhatsApp y margen', icono: 'encargos', color: 'var(--sky)', claves: 'whatsapp mensaje ganancia', visible: duena },
        { id: 'apariencia', grupo: 'Equipo', nombre: 'Apariencia', detalle: 'Fondo, animaciones y rendimiento', icono: 'paleta', color: 'var(--primary-soft)', claves: 'fondo noche oscuro tema calma rendimiento animacion petalos', visible: true },
        { id: 'escaneo', grupo: 'Equipo', nombre: 'Este celular', detalle: 'Sonido y vibración al escanear', icono: 'camara', color: 'var(--sky)', claves: 'escaner camara vibracion sonido', visible: api.esCelular },
        { id: 'celulares', grupo: 'Equipo', nombre: 'Celulares', detalle: 'Conectar y vincular celulares', icono: 'celular', color: 'var(--mint)', claves: 'wifi qr vincular red lan', visible: duena && !api.esCelular },
        { id: 'respaldos', grupo: 'Equipo', nombre: 'Respaldos', detalle: 'Copias de seguridad', icono: 'respaldos', color: 'var(--lilac)', claves: 'copia restaurar', visible: duena && !api.esCelular },
        { id: 'seguridad', grupo: 'Equipo', nombre: 'Seguridad', detalle: 'Contraseña maestra', icono: 'candado', color: 'var(--yellow)', claves: 'clave contraseña', visible: duena && !api.esCelular },
        { id: 'asistente', grupo: 'Equipo', nombre: 'Asistente IA', detalle: 'Claves y proveedores', icono: 'asistente', color: 'var(--primary-soft)', claves: 'gemini groq inteligencia', visible: duena && !api.esCelular },
        { id: 'acerca', grupo: 'Equipo', nombre: 'Acerca de', detalle: 'Versión y actualizaciones', icono: 'info', color: 'var(--sand)', claves: 'version actualizar', visible: hayActualizador },
      ] satisfies Seccion[]
    ).filter((s) => s.visible),
  );

  const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let consulta = $state('');
  const visibles = $derived.by(() => {
    const q = sinTildes(consulta.trim());
    return q ? secciones.filter((s) => sinTildes(`${s.nombre} ${s.detalle} ${s.claves}`).includes(q)) : secciones;
  });

  // En pantalla ancha siempre hay una página abierta (por defecto, el perfil); en el celular solo tras tocar una fila.
  const actual = $derived(secciones.some((s) => s.id === ajustesUI.seccion) ? ajustesUI.seccion : movil ? '' : 'perfil');
  const seccion = $derived(secciones.find((s) => s.id === actual));

  // «Atrás» del teléfono vuelve a la lista.
  $effect(() => {
    if (movil && actual) return alAtras(() => (ajustesUI.seccion = ''));
  });
</script>

<div class="ajustes" class:movil data-vacio>
  {#if !(movil && seccion)}
    <aside class="lista" data-vacio>
      <h1>Ajustes</h1>
      <label class="buscador">
        <Icono nombre="buscar" tam={18} />
        <input bind:value={consulta} placeholder="Buscar ajuste" aria-label="Buscar ajuste" />
      </label>
      {#each GRUPOS as g}
        {@const items = visibles.filter((s) => s.grupo === g)}
        {#if items.length}
          <h2 class="grupo-titulo">{g}</h2>
          <div class="grupo vidrio">
            {#each items as s (s.id)}
              <button class="fila" class:activa={actual === s.id} onclick={() => (ajustesUI.seccion = s.id)} aria-current={actual === s.id ? 'page' : undefined}>
                <span class="burbuja" style:background={s.color}><Icono nombre={s.icono} tam={20} /></span>
                <span class="textos">
                  <strong>{s.nombre}</strong>
                  <small>{s.detalle}</small>
                </span>
                {#if movil}<span class="mas"><Icono nombre="derecha" tam={18} /></span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !visibles.length}<p class="atenuado">Ningún ajuste coincide con «{consulta}».</p>{/if}
    </aside>
  {/if}

  {#if seccion}
    <section class="detalle vidrio">
      {#if movil}
        <button class="volver" onclick={() => (ajustesUI.seccion = '')}><Icono nombre="izquierda" tam={20} /> Ajustes</button>
      {/if}
      <header class="cabecera">
        <span class="burbuja grande" style:background={seccion.color}><Icono nombre={seccion.icono} tam={26} /></span>
        <div>
          <h2>{seccion.nombre}</h2>
          <span class="atenuado">{seccion.detalle}</span>
        </div>
      </header>

      {#if actual === 'perfil'}
        <div class="perfil">
          <span class="avatar-grande">{app.usuario[0] ?? '🌸'}</span>
          <div class="quien">
            <strong>{app.usuario}</strong>
            <span class="atenuado">{duena ? 'Dueña' : 'Vendedor/a'} · {sesion.estado?.tienda}</span>
          </div>
        </div>
        <div class="acciones">
          {#if cambiandoPin}
            <input class="pin" type="password" inputmode="numeric" maxlength="6" placeholder="Nuevo PIN" bind:value={miPin} aria-label="Nuevo PIN" />
            <button class="btn btn-primario" onclick={guardarMiPin} disabled={!/^\d{4,6}$/.test(miPin)}>Guardar</button>
            <button class="btn btn-blanco" onclick={() => ((cambiandoPin = false), (miPin = ''))}>Cancelar</button>
          {:else}
            <button class="btn btn-blanco" onclick={() => (cambiandoPin = true)}>Cambiar mi PIN</button>
          {/if}
          <button class="btn btn-blanco" onclick={cerrarSesion}>Cerrar sesión</button>
        </div>
      {:else if actual === 'usuarios'}
        <p class="nota">Cada persona entra con su PIN. Los vendedores no ven costos ni reportes.</p>
        <Usuarias />
        <Interruptor
          titulo="Los vendedores pueden agregar y editar libros"
          detalle="Útil para la carga inicial del inventario. Nunca ven los costos."
          marcado={inventario.vendedoresEditan}
          alCambiar={cambiarPermiso}
        />
      {:else if actual === 'categorias'}
        <Categorias />
      {:else if actual === 'ventas'}
        <h3 class="sub">Tipos de cliente y descuentos</h3>
        <TiposCliente />
        {#if !api.esCelular}
          <h3 class="sub">Métodos de pago</h3>
          <MetodosPago />
        {/if}
      {:else if actual === 'encargos'}
        <h3 class="sub">Mensaje de WhatsApp para encargos</h3>
        <MensajeWhatsapp />
        <h3 class="sub">Margen de ganancia en encargos</h3>
        <MargenEncargos />
      {:else if actual === 'apariencia'}
        <h3 class="sub">Fondo</h3>
        <p class="nota">Elige el ambiente. Interactúa con los espacios vacíos del fondo: ¡cada uno esconde algo!</p>
        <SelectorFondo grande />
        <h3 class="sub">Calma</h3>
        {#each OPCIONES as o (o.clave)}
          <Interruptor titulo={o.nombre} detalle={o.detalle} marcado={app.calma[o.clave]} alCambiar={() => alternar(o.clave)} />
        {/each}
        <h3 class="sub">Cómo aparece el libro</h3>
        <p class="nota">Elige una entrada, o deja «Sorpresa» para que cambie cada vez.</p>
        <div class="anims">
          {#each ANIMACIONES as a}
            <button class="chip" class:activo={app.calma.animLibro === a.id} onclick={() => elegirAnimacion(a.id)}>{a.emoji} {a.nombre}</button>
          {/each}
        </div>
      {:else if actual === 'escaneo'}
        <Interruptor
          titulo="Sonido y vibración al escanear"
          detalle="Un «bip» y una vibración corta cada vez que la cámara lee un código."
          marcado={avisoEscaneo}
          alCambiar={(v) => {
            avisoEscaneo = v;
            fijarAviso(v);
            avisarLectura();
          }}
        />
      {:else if actual === 'celulares'}
        <Celulares />
      {:else if actual === 'respaldos'}
        <Respaldos />
      {:else if actual === 'seguridad'}
        <CambiarContrasena />
      {:else if actual === 'asistente'}
        <AsistenteConfig />
      {:else if actual === 'acerca'}
        <p class="nota">Versión instalada: <b>{actualizacion.version || '—'}</b>. Al abrir la app se busca sola.{esCelular ? ' Android te pide tocar «Instalar».' : ' Antes de instalar una nueva se guarda un respaldo.'}</p>
        <div class="anims">
          <button class="btn btn-blanco" onclick={() => revisar(true)} disabled={actualizacion.revisando}>{actualizacion.revisando ? 'Buscando…' : 'Buscar actualizaciones'}</button>
          {#if actualizacion.ultima === 'al-dia'}<span class="atenuado">✓ Ya tienes la última versión.</span>{/if}
          {#if actualizacion.ultima === 'error'}<span class="atenuado">No se pudo buscar (¿hay internet?).</span>{/if}
          {#if actualizacion.nueva}<span><b>Hay una versión nueva ({actualizacion.nueva}):</b> mira el aviso de arriba.</span>{/if}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .ajustes {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
    padding: 4px 4px 24px;
  }
  .ajustes.movil {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  /* ── lista ── */
  .lista {
    position: sticky;
    top: 0;
    max-height: calc(100vh - 44px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
  }
  .movil .lista {
    position: static;
    max-height: none;
    overflow: visible;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 28px;
  }
  .buscador {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
  }
  .buscador input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    color: var(--text);
  }
  .grupo-titulo {
    margin: 10px 8px 0;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .grupo {
    padding: 6px;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-tarjeta);
  }
  .fila {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 16px;
    text-align: left;
    transition: background 0.2s;
  }
  .fila:hover {
    background: var(--surface-2);
  }
  .fila.activa {
    background: var(--primary-soft);
  }
  .fila + .fila {
    margin-top: 2px;
  }
  .burbuja {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    color: var(--text);
  }
  .burbuja.grande {
    width: 52px;
    height: 52px;
  }
  .textos {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .textos small {
    color: var(--muted);
    font-size: 12.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mas {
    color: var(--muted);
    display: grid;
  }

  /* ── detalle ── */
  .detalle {
    padding: 22px 24px 26px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .volver {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
    color: var(--primary-strong);
    padding: 4px 8px 4px 0;
  }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--linea);
  }
  .cabecera h2 {
    margin: 0;
    font-size: 22px;
  }
  .sub {
    margin: 12px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--linea);
    font-size: 15px;
  }
  .cabecera + .sub,
  .nota + .sub {
    border-top: 0;
  }
  .nota {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
  .perfil {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .avatar-grande {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-size: 26px;
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .perfil .quien {
    display: flex;
    flex-direction: column;
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .pin {
    width: 120px;
    font: inherit;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  .anims {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
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
</style>
