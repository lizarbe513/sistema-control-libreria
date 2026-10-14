import type { Tienda } from '../tienda/modelo';
import type {
  CategoriaApi,
  Cliente,
  ClienteEntrada,
  Encargo,
  EncargoEntrada,
  EstadoEncargo,
  FichaCliente,
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

/** Lo que la interfaz puede pedirle al backend. Dos implementaciones: Tauri (real) y Demo (navegador). */
export interface Api {
  readonly esDemo: boolean;
  estadoInicial(): Promise<EstadoInicial>;
  configurar(d: DatosConfiguracion): Promise<EstadoInicial>;
  abrirCarpeta(carpeta: string, contrasena: string): Promise<EstadoInicial>;
  desbloquear(contrasena: string): Promise<EstadoInicial>;
  /** Diálogo del sistema para elegir una carpeta (null si se cancela). */
  elegirCarpeta(inicial?: string): Promise<string | null>;
  usuarias(): Promise<Usuaria[]>;
  iniciarSesion(id: number, pin: string): Promise<Usuaria>;
  cerrarSesion(): Promise<void>;
  guardarPreferencias(cambios: Record<string, unknown>): Promise<Record<string, unknown>>;
  crearUsuaria(nombre: string, rol: Rol, pin: string): Promise<Usuaria>;
  cambiarPin(id: number, pin: string): Promise<void>;

  // ── inventario ──
  categorias(): Promise<CategoriaApi[]>;
  buscarLibros(consulta: string, filtros?: Filtros): Promise<LibroApi[]>;
  libro(id: number): Promise<LibroApi>;
  guardarLibro(e: LibroEntrada): Promise<LibroApi>;
  desactivarLibro(id: number): Promise<void>;
  ajustarStock(id: number, delta: number, motivo: 'ingreso' | 'ajuste', nota?: string): Promise<LibroApi>;
  resumenInventario(): Promise<ResumenInventario>;
  consultarIsbn(isbn: string): Promise<Sugerencia>;
  /** Libros conocidos por título y/o autor, con su portada (para libros sin ISBN). */
  buscarEnLinea(titulo: string, autor: string): Promise<ResultadoLinea[]>;
  portadaDesdeUrl(id: number, url: string): Promise<LibroApi>;
  /** `origen`: ruta (Tauri) o dataURL (demo), como la devuelve `elegirImagen`. */
  portadaDesdeArchivo(id: number, origen: string): Promise<LibroApi>;
  quitarPortada(id: number): Promise<LibroApi>;
  elegirImagen(): Promise<string | null>;
  /** URL para mostrar una portada guardada (requiere `prepararPortadas` tras entrar). */
  urlPortada(archivo: string): string;
  prepararPortadas(): Promise<void>;
  permisoVendedoresEditan(valor?: boolean): Promise<boolean>;

  // ── tienda en bloques ──
  cargarTienda(): Promise<Tienda | null>;
  guardarTienda(t: Tienda): Promise<void>;
  plantillas(): Promise<PlantillasApi>;
  guardarPlantilla(nombre: string, t: Tienda): Promise<PlantillaApi>;
  borrarPlantilla(id: string): Promise<void>;
  fijarPlantillaDefecto(id: string | null): Promise<void>;

  // ── ventas ──
  /** El backend recalcula todo: precios, descuentos, redondeo y total. */
  registrarVenta(e: VentaEntrada): Promise<Venta>;
  /** Solo la Dueña. */
  anularVenta(id: number, motivo: string): Promise<Venta>;
  /** Ventas con fecha en [desde, hasta): instantes ISO en UTC (la interfaz convierte el día local). */
  ventas(desde: string, hasta: string): Promise<Venta[]>;
  resumenVentas(desde: string, hasta: string): Promise<ResumenVentas>;
  tiposCliente(todos?: boolean): Promise<TipoCliente[]>;
  guardarTipoCliente(e: TipoEntrada): Promise<TipoCliente[]>;
  /** Tope (%) de descuento a mano para vendedoras. Con `valor` lo cambia (solo la Dueña). */
  topeDescuento(valor?: number): Promise<number>;
  buscarClientes(texto: string): Promise<Cliente[]>;
  crearCliente(e: ClienteEntrada): Promise<Cliente>;
  /** QR de cobro del negocio (data-URL), o null si aún no se estableció. */
  qrPago(): Promise<string | null>;
  /** Solo la Dueña. `origen`: ruta (Tauri) o dataURL (demo), como la devuelve `elegirImagen`. */
  guardarQrPago(origen: string): Promise<string | null>;
  quitarQrPago(): Promise<void>;

  // ── encargos y clientes ──
  /** Activos (tablero) o cerrados (entregados/cancelados recientes). */
  encargos(activos: boolean): Promise<Encargo[]>;
  crearEncargo(e: EncargoEntrada): Promise<Encargo>;
  /** «entregado» no: eso ocurre al vender. Al cancelar, `devolverAdelanto` anota la devolución en la caja. */
  estadoEncargo(id: number, nuevo: EstadoEncargo, devolverAdelanto?: boolean): Promise<Encargo>;
  enlazarLibroEncargo(id: number, libroId: number): Promise<Encargo>;
  /** Encargos que esperan este libro (pendiente/pedido). */
  encargosEsperando(libroId: number): Promise<Encargo[]>;
  /** Encargos que ya tienen este libro apartado (llegó/avisado). */
  encargosApartados(libroId: number): Promise<Encargo[]>;
  /** Encargos activos sin libro cuyo título se parece. */
  encargosCoincidencias(titulo: string): Promise<Encargo[]>;
  guardarCliente(e: ClienteEntrada): Promise<Cliente>;
  fichaCliente(id: number): Promise<FichaCliente>;
  /** Plantilla del aviso. Con `texto` la cambia (solo la Dueña; vacío = la de fábrica). */
  plantillaWhatsapp(texto?: string): Promise<string>;
  /** Abre WhatsApp con el aviso redactado; si estaba «llegó», pasa a «avisado». */
  avisarWhatsapp(id: number): Promise<{ encargo: Encargo; url: string }>;
}
