import type { Tienda } from '../tienda/modelo';
import type {
  CategoriaApi,
  DatosConfiguracion,
  EstadoInicial,
  Filtros,
  LibroApi,
  LibroEntrada,
  PlantillaApi,
  PlantillasApi,
  ResumenInventario,
  Rol,
  Sugerencia,
  Usuaria,
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
}
