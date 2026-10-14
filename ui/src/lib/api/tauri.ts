import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Api } from './contrato';
import type { Tienda } from '../tienda/modelo';
import type {
  CategoriaApi,
  Cliente,
  ClienteEntrada,
  DatosConfiguracion,
  EstadoInicial,
  Filtros,
  LibroApi,
  LibroEntrada,
  PlantillaApi,
  PlantillasApi,
  ResultadoLinea,
  ResumenInventario,
  ResumenVentas,
  Rol,
  Sugerencia,
  TipoCliente,
  TipoEntrada,
  Usuaria,
  Venta,
  VentaEntrada,
} from './tipos';

/** Backend real: comandos de Rust por IPC. Los errores llegan como texto en español. */
export class ApiTauri implements Api {
  readonly esDemo = false;
  private rutaPortadas = '';

  private llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(cmd, args).catch((e: unknown) => {
      throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Ocurrió un error inesperado');
    });
  }

  estadoInicial() {
    return this.llamar<EstadoInicial>('estado_inicial');
  }
  configurar(d: DatosConfiguracion) {
    return this.llamar<EstadoInicial>('configurar', { ...d });
  }
  abrirCarpeta(carpeta: string, contrasena: string) {
    return this.llamar<EstadoInicial>('abrir_carpeta', { carpeta, contrasena });
  }
  desbloquear(contrasena: string) {
    return this.llamar<EstadoInicial>('desbloquear', { contrasena });
  }
  async elegirCarpeta(inicial?: string) {
    const r = await open({ directory: true, multiple: false, defaultPath: inicial, title: 'Carpeta de datos de la librería' });
    return typeof r === 'string' ? r : null;
  }
  usuarias() {
    return this.llamar<Usuaria[]>('usuarias');
  }
  iniciarSesion(id: number, pin: string) {
    return this.llamar<Usuaria>('iniciar_sesion', { id, pin });
  }
  cerrarSesion() {
    return this.llamar<void>('cerrar_sesion');
  }
  guardarPreferencias(cambios: Record<string, unknown>) {
    return this.llamar<Record<string, unknown>>('preferencias_guardar', { cambios });
  }
  crearUsuaria(nombre: string, rol: Rol, pin: string) {
    return this.llamar<Usuaria>('usuaria_crear', { nombre, rol, pin });
  }
  cambiarPin(id: number, pin: string) {
    return this.llamar<void>('usuaria_cambiar_pin', { id, pin });
  }

  // ── inventario ──
  categorias() {
    return this.llamar<CategoriaApi[]>('categorias');
  }
  buscarLibros(consulta: string, filtros?: Filtros) {
    return this.llamar<LibroApi[]>('libros_buscar', { consulta, filtros: filtros ?? null });
  }
  libro(id: number) {
    return this.llamar<LibroApi>('libro_obtener', { id });
  }
  guardarLibro(entrada: LibroEntrada) {
    return this.llamar<LibroApi>('libro_guardar', { entrada });
  }
  desactivarLibro(id: number) {
    return this.llamar<void>('libro_desactivar', { id });
  }
  ajustarStock(id: number, delta: number, motivo: 'ingreso' | 'ajuste', nota?: string) {
    return this.llamar<LibroApi>('stock_ajustar', { id, delta, motivo, nota: nota ?? null });
  }
  resumenInventario() {
    return this.llamar<ResumenInventario>('inventario_resumen');
  }
  consultarIsbn(isbn: string) {
    return this.llamar<Sugerencia>('isbn_consultar', { isbn });
  }
  buscarEnLinea(titulo: string, autor: string) {
    return this.llamar<ResultadoLinea[]>('libros_buscar_en_linea', { titulo, autor });
  }
  portadaDesdeUrl(id: number, url: string) {
    return this.llamar<LibroApi>('portada_desde_url', { id, url });
  }
  portadaDesdeArchivo(id: number, origen: string) {
    return this.llamar<LibroApi>('portada_desde_archivo', { id, ruta: origen });
  }
  quitarPortada(id: number) {
    return this.llamar<LibroApi>('portada_quitar', { id });
  }
  async elegirImagen() {
    const r = await open({
      multiple: false,
      directory: false,
      title: 'Elegir la portada',
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    });
    return typeof r === 'string' ? r : null;
  }
  urlPortada(archivo: string) {
    const sep = this.rutaPortadas.includes('\\') ? '\\' : '/';
    return convertFileSrc(`${this.rutaPortadas}${sep}${archivo}`);
  }
  async prepararPortadas() {
    this.rutaPortadas = await this.llamar<string>('ruta_portadas');
  }
  permisoVendedoresEditan(valor?: boolean) {
    return this.llamar<boolean>('permiso_vendedores_editan', { valor: valor ?? null });
  }

  // ── tienda ──
  cargarTienda() {
    return this.llamar<Tienda | null>('tienda_cargar');
  }
  guardarTienda(tienda: Tienda) {
    return this.llamar<void>('tienda_guardar', { tienda });
  }
  plantillas() {
    return this.llamar<PlantillasApi>('plantillas_listar');
  }
  guardarPlantilla(nombre: string, tienda: Tienda) {
    return this.llamar<PlantillaApi>('plantilla_guardar', { nombre, tienda });
  }
  borrarPlantilla(id: string) {
    return this.llamar<void>('plantilla_borrar', { id });
  }
  fijarPlantillaDefecto(id: string | null) {
    return this.llamar<void>('plantilla_defecto', { id });
  }

  // ── ventas ──
  registrarVenta(entrada: VentaEntrada) {
    return this.llamar<Venta>('venta_registrar', { entrada });
  }
  anularVenta(id: number, motivo: string) {
    return this.llamar<Venta>('venta_anular', { id, motivo });
  }
  ventas(desde: string, hasta: string) {
    return this.llamar<Venta[]>('ventas_listar', { desde, hasta });
  }
  resumenVentas(desde: string, hasta: string) {
    return this.llamar<ResumenVentas>('ventas_resumen', { desde, hasta });
  }
  tiposCliente(todos?: boolean) {
    return this.llamar<TipoCliente[]>('tipos_cliente_listar', { todos: todos ?? false });
  }
  guardarTipoCliente(entrada: TipoEntrada) {
    return this.llamar<TipoCliente[]>('tipo_cliente_guardar', { entrada });
  }
  topeDescuento(valor?: number) {
    return valor === undefined ? this.llamar<number>('tope_descuento') : this.llamar<number>('tope_descuento_fijar', { pct: valor });
  }
  buscarClientes(texto: string) {
    return this.llamar<Cliente[]>('clientes_buscar', { texto });
  }
  crearCliente(entrada: ClienteEntrada) {
    return this.llamar<Cliente>('cliente_crear_rapido', { entrada });
  }
}
