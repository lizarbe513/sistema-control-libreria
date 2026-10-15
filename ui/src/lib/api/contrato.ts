import type { Tienda } from '../tienda/modelo';
import type {
  CategoriaApi,
  MensajeChat,
  ProveedorIa,
  RespuestaAsistente,
  Cliente,
  ClienteEntrada,
  CodigoVinculo,
  EstadoCelulares,
  EstadoRespaldos,
  ResultadoRespaldo,
  ConsultaReporte,
  Reporte,
  TipoCsv,
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
  /** Es la app del celular: habla con el PC por el WiFi (no tiene base de datos propia). */
  readonly esCelular: boolean;
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
  editarUsuaria(id: number, nombre: string, rol: Rol): Promise<Usuaria>;
  quitarUsuaria(id: number): Promise<void>;

  // ── inventario ──
  categorias(): Promise<CategoriaApi[]>;
  crearCategoria(nombre: string): Promise<CategoriaApi>;
  editarCategoria(clave: string, nombre: string, color: string): Promise<CategoriaApi>;
  eliminarCategoria(clave: string): Promise<void>;
  conteoCategorias(): Promise<{ clave: string; libros: number }[]>;
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
  /** Margen de ganancia (%) sobre el costo de un libro encargado. Con `valor` lo cambia (solo la Dueña). */
  margenEncargos(valor?: number): Promise<number>;

  // ── reportes (solo la Dueña) ──
  reporte(c: ConsultaReporte): Promise<Reporte>;

  // asistente de IA
  asistentePreguntar(historial: MensajeChat[]): Promise<RespuestaAsistente>;
  /** Solo la Dueña, solo en el PC. */
  asistenteConfig(): Promise<ProveedorIa[]>;
  /** `clave`: null la deja como está, '' la borra. */
  asistenteGuardarConfig(proveedor: string, clave: string | null, modelo: string | null): Promise<ProveedorIa[]>;
  /** Prueba la clave (la guardada, o una nueva sin guardarla) y devuelve los modelos disponibles. */
  asistenteProbar(proveedor: string, clave: string | null): Promise<string[]>;
  /** Pide dónde guardar y escribe el CSV. Devuelve la ruta (o null si se cancela). */
  exportarReporte(tipo: TipoCsv, c: ConsultaReporte, nombreSugerido: string): Promise<string | null>;

  // ── respaldos y seguridad ──
  estadoRespaldos(): Promise<EstadoRespaldos>;
  /** Carpeta externa (null para quitarla) y cuántos respaldos automáticos se conservan. */
  configurarRespaldos(externo: string | null, conservar: number): Promise<EstadoRespaldos>;
  /** Respaldo manual; con `destino` además se guarda una copia en esa carpeta. */
  crearRespaldo(destino?: string | null): Promise<ResultadoRespaldo>;
  mostrarRespaldos(): Promise<void>;
  /** Diálogo para elegir un respaldo (.zip). */
  elegirRespaldo(): Promise<string | null>;
  /** Reemplaza los datos actuales (tras un respaldo de seguridad). Termina sin sesión. */
  restaurarRespaldo(zip: string, contrasena: string): Promise<EstadoInicial>;
  /** PC nuevo: restaura en una carpeta nueva y la abre. */
  restaurarNuevo(zip: string, carpeta: string, contrasena: string): Promise<EstadoInicial>;
  /** Devuelve si el llavero del equipo se actualizó. */
  cambiarContrasena(actual: string, nueva: string): Promise<boolean>;
  /** «Olvidé mi PIN» de la Dueña: con la contraseña maestra. */
  recuperarPin(id: number, contrasena: string, pinNuevo: string): Promise<void>;

  // ── celulares (el servidor local del PC) ──
  estadoCelulares(): Promise<EstadoCelulares>;
  activarCelulares(activo: boolean): Promise<EstadoCelulares>;
  /** Un código de un solo uso (5 minutos) con su QR, para vincular un celular. */
  codigoCelular(): Promise<CodigoVinculo>;
  desconectarCelular(id: number): Promise<EstadoCelulares>;

  // ── solo en la app del celular ──
  /** Vincula este celular con el PC: `texto` es lo que lleva el QR (`siglo://vincular?…`). */
  vincularConQr(texto: string, nombreCelular: string): Promise<EstadoInicial>;
  /** A mano: dirección del PC (con o sin puerto) y el código de 8 letras. */
  vincularManual(direccion: string, codigo: string, nombreCelular: string): Promise<EstadoInicial>;
  /** Olvida el vínculo (para vincular con otro PC). */
  desvincular(): void;
}
