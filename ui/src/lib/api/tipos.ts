// Tipos compartidos con el backend (Rust → JSON).

export type Rol = 'duena' | 'vendedor';

export interface Usuaria {
  id: number;
  nombre: string;
  rol: Rol;
  avatar: string;
  preferencias: Record<string, unknown>;
}

export type Fase = 'configurar' | 'desbloquear' | 'entrar' | 'sesion' | 'vincular' | 'sinConexion';

export interface EstadoInicial {
  fase: Fase;
  carpeta: string | null;
  carpetaSugerida: string;
  tienda: string | null;
  usuaria: Usuaria | null;
  /** false si el equipo no tiene llavero: pedirá la contraseña maestra al abrir. */
  llavero: boolean;
  /** Solo en el celular: por qué no se pudo conectar con el PC. */
  error?: string;
}

export interface DatosConfiguracion {
  carpeta: string;
  contrasena: string;
  tienda: string;
  nombre: string;
  pin: string;
}

// ───── Hito 2: inventario, búsqueda y tienda ─────
import type { Tienda } from '../tienda/modelo';

export type Formato = 'normal' | 'grueso' | 'infantil' | 'delgado';

export interface UbicacionApi {
  estante: string;
  tramo: number;
  repisa: number;
}

/** Libro tal como lo entrega el backend (montos en céntimos). */
export interface LibroApi {
  id: number;
  isbn: string | null;
  codigo: string;
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  sinopsis: string;
  /** Archivo en portadas/ (Tauri) o URL (demo). */
  portada: string | null;
  colorTapa: string;
  formato: Formato;
  categoria: string;
  precioCent: number;
  /** null si quien consulta no ve costos. */
  costoCent: number | null;
  stock: number;
  stockMinimo: number;
  ubicacion: UbicacionApi | null;
  etiquetas: string[];
  actualizado: string;
}

export interface LibroEntrada {
  id?: number | null;
  isbn?: string | null;
  titulo: string;
  autor: string;
  editorial: string;
  anio?: number | null;
  sinopsis: string;
  categoria: string;
  precioCent: number;
  costoCent?: number | null;
  stock?: number;
  stockMinimo?: number;
  ubicacion?: UbicacionApi | null;
  etiquetas?: string[];
  colorTapa?: string | null;
  formato?: Formato | null;
}

export interface CategoriaApi {
  clave: string;
  nombre: string;
  color: string;
  patron: string;
}

export interface Filtros {
  categoria?: string | null;
  soloConStock?: boolean;
  stockBajo?: boolean;
  sinUbicacion?: boolean;
  precioMin?: number | null;
  precioMax?: number | null;
  limite?: number;
}

export interface Sugerencia {
  isbn: string;
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  sinopsis: string;
  portadaUrl: string | null;
  fuente: string;
}

/** Un libro encontrado en internet por título o autor. */
export interface ResultadoLinea {
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  isbn: string | null;
  portadaUrl: string | null;
  espanol: boolean;
  fuente: string;
}

export interface Contadores {
  libros: number;
  unidades: number;
  sinStock: number;
  stockBajo: number;
  sinUbicacion: number;
}

export interface ResumenInventario {
  contadores: Contadores;
  stockBajo: LibroApi[];
}

export interface PlantillaApi {
  id: string;
  nombre: string;
  tienda: Tienda;
}

export interface PlantillasApi {
  lista: PlantillaApi[];
  /** null = la incluida «SIGLO XXI (croquis)». */
  defecto: string | null;
}

// ── ventas ──
export type Descuento = { tipo: 'pct' | 'monto'; valor: number };
export type Metodo = 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia';

export interface ItemEntrada {
  libroId: number;
  cantidad: number;
  descuento?: Descuento | null;
}
export interface PagoEntrada {
  metodo: Metodo;
  /** Lo que aporta al total (en efectivo, sin contar el vuelto). */
  montoCent: number;
  /** Solo efectivo: lo que entregó el cliente. */
  recibidoCent?: number | null;
}
export interface VentaEntrada {
  items: ItemEntrada[];
  tipoClienteId: number;
  clienteId?: number | null;
  /** Lo que dio el cliente; vacío: el de la ficha registrada o «Cliente». */
  clienteNombre?: string | null;
  descuento?: Descuento | null;
  /** Entrega de un encargo: su adelanto se descuenta. */
  encargoId?: number | null;
  pagos: PagoEntrada[];
}
export interface ItemVenta {
  libroId: number;
  titulo: string;
  cantidad: number;
  precioUnitCent: number;
  descuentoCent: number;
  totalCent: number;
}
export interface PagoVenta {
  metodo: Metodo;
  montoCent: number;
  recibidoCent: number | null;
  vueltoCent: number | null;
}
export interface Venta {
  id: number;
  /** Instante ISO en UTC. */
  fecha: string;
  usuarioId: number;
  vendedora: string;
  clienteId: number | null;
  /** Siempre tiene valor: el nombre dado, el del cliente registrado o «Cliente». */
  cliente: string;
  tipoNombre: string;
  tipoPct: number;
  subtotalCent: number;
  descuentoCent: number;
  redondeoCent: number;
  totalCent: number;
  anulada: boolean;
  anuladaFecha: string | null;
  motivoAnulacion: string;
  encargoId: number | null;
  adelantoCent: number;
  items: ItemVenta[];
  pagos: PagoVenta[];
}
export interface TipoCliente {
  id: number;
  nombre: string;
  descuentoPct: number;
  activo: boolean;
}
export interface TipoEntrada {
  id?: number | null;
  nombre: string;
  descuentoPct: number;
  activo: boolean;
}
export interface ResumenVentas {
  ventas: number;
  anuladas: number;
  unidades: number;
  totalCent: number;
  /** Caja real: pagos de ventas más adelantos (y devoluciones) de encargos del período. */
  porMetodo: { metodo: Metodo; montoCent: number }[];
  adelantosCent: number;
}
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  correo: string;
  tipoClienteId: number | null;
  notas: string;
}
export interface ClienteEntrada {
  id?: number | null;
  nombre: string;
  telefono?: string;
  correo?: string;
  tipoClienteId?: number | null;
  notas?: string;
}
export interface FichaCliente {
  cliente: Cliente;
  compras: { ventaId: number; fecha: string; totalCent: number; libros: string }[];
  encargos: { id: number; titulo: string; estado: EstadoEncargo; creado: string }[];
  totalCompradoCent: number;
}

// ── encargos ──
export type EstadoEncargo = 'pendiente' | 'pedido' | 'llego' | 'avisado' | 'entregado' | 'cancelado';
export interface Encargo {
  id: number;
  clienteId: number;
  cliente: string;
  telefono: string;
  libroId: number | null;
  titulo: string;
  autor: string;
  cantidad: number;
  estado: EstadoEncargo;
  notas: string;
  creado: string;
  actualizado: string;
  fechaPedido: string | null;
  fechaLlego: string | null;
  fechaAviso: string | null;
  fechaCierre: string | null;
  ventaId: number | null;
  /** Adelanto neto (adelantos menos devoluciones). */
  adelantoCent: number;
  precioCent: number | null;
  stock: number | null;
  portada: string | null;
  colorTapa: string | null;
  formato: Formato | null;
  categoria: string | null;
  /** Costo del proveedor, si se anotó. */
  costoCent: number | null;
  /** Precio que se le dijo al cliente (costo + margen, o el que se escribió). */
  precioAcordadoCent: number | null;
  /** Portada de referencia (búsqueda en internet) mientras el libro no está en el inventario. */
  portadaUrl: string | null;
}
export interface EncargoEntrada {
  clienteId?: number | null;
  /** Cliente nuevo, que se registra junto con el encargo. */
  cliente?: ClienteEntrada | null;
  libroId?: number | null;
  titulo: string;
  autor?: string;
  cantidad?: number;
  notas?: string;
  adelanto?: { metodo: Metodo; montoCent: number } | null;
  costoCent?: number | null;
  /** Sin precio y con costo, el backend calcula costo + margen. */
  precioAcordadoCent?: number | null;
  portadaUrl?: string | null;
}

// ── reportes (solo la Dueña) ──
export type Agrupar = 'dia' | 'mes';
export type TipoCsv = 'ventas' | 'mas_vendidos' | 'sin_movimiento' | 'caja';
export interface ConsultaReporte {
  /** Instantes UTC (ISO): el período es [desde, hasta). */
  desde: string;
  hasta: string;
  /** Minutos que se suman a UTC para obtener la hora local (Perú: −300). */
  tzMin: number;
  agrupar: Agrupar;
  diasSinMov: number;
  ahora: string;
}
export interface PuntoReporte {
  /** `2026-10-14` (día) o `2026-10` (mes), hora local. */
  etiqueta: string;
  ventas: number;
  unidades: number;
  totalCent: number;
  gananciaCent: number;
}
export interface TotalesReporte {
  ventas: number;
  anuladas: number;
  unidades: number;
  totalCent: number;
  gananciaCent: number;
  descuentosCent: number;
  redondeoCent: number;
  ticketPromedioCent: number;
  adelantosCent: number;
}
export interface Reporte {
  totales: TotalesReporte;
  serie: PuntoReporte[];
  caja: { metodo: Metodo; montoCent: number }[];
  masVendidos: { libroId: number; titulo: string; unidades: number; totalCent: number; gananciaCent: number }[];
  categorias: { clave: string; nombre: string; color: string; unidades: number; totalCent: number }[];
  porTipo: { nombre: string; ventas: number; totalCent: number }[];
  porVendedora: { nombre: string; ventas: number; totalCent: number }[];
  sinMovimiento: { libroId: number; titulo: string; autor: string; categoria: string; stock: number; costoCent: number; precioCent: number; dias: number }[];
  sinMovimientoTotal: number;
  inmovilizadoCent: number;
}

// ── respaldos (solo la Dueña) ──
export type TipoRespaldo = 'auto' | 'manual' | 'seguridad';
export interface Respaldo {
  archivo: string;
  ruta: string;
  bytes: number;
  /** Instante UTC (ISO). */
  fecha: string;
  tipo: TipoRespaldo;
}
export interface ConfigRespaldos {
  externo: string | null;
  conservar: number;
  ultimoAuto: string | null;
}
export interface EstadoRespaldos {
  configuracion: ConfigRespaldos;
  externoDisponible: boolean;
  carpetaInterna: string;
  interno: Respaldo[];
  externo: Respaldo[];
}
export interface ResultadoRespaldo {
  respaldo: Respaldo;
  /** Algo que la Dueña debe saber (p. ej. la carpeta externa no estaba conectada). El interno sí se hizo. */
  aviso: string | null;
}

// ── celulares vinculados (solo la Dueña) ──
export interface DispositivoCelular {
  id: number;
  nombre: string;
  creado: string;
  ultimoUso: string | null;
  revocado: boolean;
}
export interface EstadoCelulares {
  /** La Dueña lo encendió (se recuerda). */
  activo: boolean;
  /** El servidor está escuchando ahora. */
  corriendo: boolean;
  puerto: number | null;
  direcciones: string[];
  dispositivos: DispositivoCelular[];
}
export interface CodigoVinculo {
  codigo: string;
  segundos: number;
  /** Lo que lleva el QR. */
  texto: string;
  /** El QR como SVG. */
  svg: string;
}

// ── asistente de IA (hito 8) ──
export interface MensajeChat {
  rol: 'usuaria' | 'asistente';
  texto: string;
}

export interface RespuestaAsistente {
  texto: string;
  /** Quién respondió: «Gemini» o «Groq» (o «Demostración»). */
  proveedor: string;
  /** Los libros citados como [[libro:ID]], para mostrarlos como fichas. */
  libros: LibroApi[];
  /** Libros de internet citados como [[web:REF]] (no están en la tienda). */
  externos: { referencia: string; resultado: ResultadoLinea }[];
  /** Propuestas de cambio: tarjetas para confirmar. */
  acciones: AccionAsistente[];
}

export interface PropuestaAsistente {
  accion: { tipo: 'encargo' | 'estado_encargo' | 'stock' | 'editar_libro' | 'libro_nuevo'; [k: string]: unknown };
  titulo: string;
  explicacion: string[];
  libroId: number | null;
  encargoId: number | null;
  pideCliente: boolean;
  clienteSugerido: string;
  pidePrecio: boolean;
  portadaUrl: string | null;
}

export interface AccionAsistente {
  id: string;
  propuesta: PropuestaAsistente;
  libro: LibroApi | null;
}

export interface ExtraConfirmacion {
  clienteId?: number | null;
  clienteNuevo?: { nombre: string; telefono: string } | null;
  precioSoles?: number | null;
  stock?: number | null;
}

export interface Confirmado {
  mensaje: string;
  /** Adónde llevar para revisarlo: «encargo:12», «libro:7». */
  ir: string | null;
}

export interface ProveedorIa {
  id: 'gemini' | 'groq';
  nombre: string;
  configurada: boolean;
  /** Las últimas 4 letras de la clave (la clave entera nunca vuelve a la interfaz). */
  finalClave: string;
  modelo: string;
}
