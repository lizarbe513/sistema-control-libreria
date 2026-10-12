// Datos de ejemplo del prototipo (en la app real vienen de la base de datos).

export type CategoriaId =
  | 'literarias'
  | 'diccionarios'
  | 'biblias'
  | 'autoayuda'
  | 'ninos'
  | 'regionales'
  | 'preu'
  | 'universitarios'
  | 'otros';

export type Patron = 'marco' | 'rayos' | 'confeti' | 'dorado' | 'cuadricula' | 'andino' | 'ondas';
export type Formato = 'normal' | 'grueso' | 'infantil' | 'delgado';

export interface Categoria {
  id: CategoriaId;
  nombre: string;
  color: string; // acento pastel para etiquetas
  patron: Patron; // decoración de portadas generadas
}

export interface Estante {
  id: string;
  nombre: string;
  color: string; // pastel
  fuerte: string; // tono intenso para resaltar
  x: number;
  y: number;
  w: number;
  h: number;
  repisas: number;
}

export interface ElementoMapa {
  tipo: 'caja' | 'entrada' | 'mesa' | 'ventana';
  etiqueta: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Libro {
  id: number;
  titulo: string;
  autor: string;
  editorial: string;
  anio: number;
  categoria: CategoriaId;
  precio: number; // céntimos
  stock: number;
  estante: string;
  repisa: number;
  tapa: string; // color de la portada generada
  formato: Formato;
  sinopsis: string;
}

export const CATEGORIAS: Record<CategoriaId, Categoria> = {
  literarias: { id: 'literarias', nombre: 'Obras literarias', color: '#E9E3FB', patron: 'marco' },
  diccionarios: { id: 'diccionarios', nombre: 'Diccionarios', color: '#DDEFFB', patron: 'dorado' },
  biblias: { id: 'biblias', nombre: 'Biblias', color: '#DDEFFB', patron: 'dorado' },
  autoayuda: { id: 'autoayuda', nombre: 'Autoayuda', color: '#FCEFC7', patron: 'rayos' },
  ninos: { id: 'ninos', nombre: 'Cuentos para niños', color: '#FBD3DE', patron: 'confeti' },
  regionales: { id: 'regionales', nombre: 'Cuentos regionales', color: '#FDE2D0', patron: 'andino' },
  preu: { id: 'preu', nombre: 'Pre-universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  universitarios: { id: 'universitarios', nombre: 'Universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  otros: { id: 'otros', nombre: 'Otros', color: '#F1ECEE', patron: 'ondas' },
};

// Plano de la tienda: unidades de una cuadrícula de 20 × 13.
export const MAPA = { ancho: 20, alto: 13 };

export const ESTANTES: Estante[] = [
  { id: 'A', nombre: 'Obras literarias', color: '#E9E3FB', fuerte: '#9B87E0', x: 1, y: 0.8, w: 7, h: 1.4, repisas: 5 },
  { id: 'B', nombre: 'Autoayuda y negocios', color: '#FCEFC7', fuerte: '#E9B949', x: 9.5, y: 0.8, w: 6.5, h: 1.4, repisas: 5 },
  { id: 'C', nombre: 'Cuentos para niños', color: '#FBD3DE', fuerte: '#F27A9B', x: 0.8, y: 3.4, w: 1.4, h: 6.6, repisas: 4 },
  { id: 'D', nombre: 'Biblias y diccionarios', color: '#DDEFFB', fuerte: '#6FA8DC', x: 17.8, y: 3.4, w: 1.4, h: 4.2, repisas: 5 },
  { id: 'E', nombre: 'Pre-U y universitarios', color: '#DDF3E4', fuerte: '#5DBB8A', x: 5.5, y: 4.6, w: 8, h: 1.4, repisas: 4 },
  { id: 'F', nombre: 'Cuentos regionales', color: '#FDE2D0', fuerte: '#F0A070', x: 17.8, y: 8.3, w: 1.4, h: 2.6, repisas: 3 },
];

export const ELEMENTOS_MAPA: ElementoMapa[] = [
  { tipo: 'mesa', etiqueta: 'Novedades', x: 6.5, y: 7.6, w: 6, h: 1.6 },
  { tipo: 'caja', etiqueta: 'Caja', x: 13.4, y: 10.4, w: 3.4, h: 1.5 },
  { tipo: 'entrada', etiqueta: 'Entrada', x: 7.5, y: 12.4, w: 4, h: 0.6 },
  { tipo: 'ventana', etiqueta: 'Vitrina', x: 1.2, y: 12.6, w: 4.5, h: 0.4 },
];

const L = (
  id: number,
  titulo: string,
  autor: string,
  editorial: string,
  anio: number,
  categoria: CategoriaId,
  precio: number,
  stock: number,
  ubic: string,
  tapa: string,
  formato: Formato,
  sinopsis: string,
): Libro => ({
  id,
  titulo,
  autor,
  editorial,
  anio,
  categoria,
  precio,
  stock,
  estante: ubic[0],
  repisa: Number(ubic.slice(1)),
  tapa,
  formato,
  sinopsis,
});

export const LIBROS: Libro[] = [
  L(1, 'El Principito', 'Antoine de Saint-Exupéry', 'Salamandra', 2008, 'literarias', 3500, 4, 'A2', '#6FA8DC', 'normal',
    'Un piloto perdido en el desierto conoce a un pequeño príncipe venido de otro planeta. Una fábula tierna sobre la amistad, el amor y lo esencial, que es invisible a los ojos.'),
  L(2, 'Cien años de soledad', 'Gabriel García Márquez', 'Debolsillo', 2015, 'literarias', 6900, 2, 'A1', '#E9B949', 'grueso',
    'Siete generaciones de la familia Buendía en el mítico pueblo de Macondo, donde lo real y lo maravilloso conviven.'),
  L(3, 'La ciudad y los perros', 'Mario Vargas Llosa', 'Alfaguara', 2012, 'literarias', 5900, 3, 'A1', '#4A4E69', 'grueso',
    'En el Colegio Militar Leoncio Prado, un grupo de cadetes enfrenta la violencia, el honor y la culpa tras el robo de un examen.'),
  L(4, 'Los ríos profundos', 'José María Arguedas', 'Losada', 2011, 'literarias', 3900, 1, 'A3', '#5DBB8A', 'normal',
    'Ernesto, un adolescente entre dos mundos, recorre los Andes y descubre la fuerza del quechua, la música y la memoria.'),
  L(5, 'Momentos estelares de la humanidad', 'Stefan Zweig', 'Acantilado', 2002, 'literarias', 7500, 2, 'A4', '#2E2A4F', 'normal',
    'Catorce miniaturas históricas: instantes decisivos en que el destino de la humanidad cambió para siempre.'),
  L(6, 'Padre Rico, Padre Pobre', 'Robert T. Kiyosaki', 'Debolsillo', 2016, 'autoayuda', 4900, 6, 'B1', '#7E57C2', 'normal',
    'Lo que los ricos enseñan a sus hijos sobre el dinero y que las clases media y pobre no aprenden.'),
  L(7, 'El poder del ahora', 'Eckhart Tolle', 'Gaia', 2007, 'autoayuda', 5500, 3, 'B2', '#3E8E7E', 'normal',
    'Una guía espiritual para dejar de vivir atrapados en la mente y habitar plenamente el momento presente.'),
  L(8, 'El monje que vendió su Ferrari', 'Robin Sharma', 'Debolsillo', 2010, 'autoayuda', 4500, 5, 'B2', '#C0392B', 'normal',
    'Julian Mantle, un abogado exitoso, lo deja todo tras un infarto y viaja a la India en busca de una vida con sentido.'),
  L(9, 'Cómo ganar amigos e influir sobre las personas', 'Dale Carnegie', 'Edhasa', 2010, 'autoayuda', 4200, 4, 'B3', '#F2B24C', 'normal',
    'Principios clásicos para relacionarse mejor, ganar confianza y comunicarse con calidez.'),
  L(10, 'Las leyes del éxito', 'Napoleon Hill', 'Obelisco', 2012, 'autoayuda', 6500, 2, 'B3', '#E67E22', 'grueso',
    'Dieciséis lecciones sobre propósito, hábitos y perseverancia del autor de "Piense y hágase rico".'),
  L(11, 'Tus zonas erróneas', 'Wayne W. Dyer', 'Debolsillo', 2011, 'autoayuda', 3900, 1, 'B4', '#F4D03F', 'normal',
    'Cómo identificar y superar los pensamientos que nos impiden ser felices y dueños de nuestras decisiones.'),
  L(12, 'Los secretos de la mente millonaria', 'T. Harv Eker', 'Sirio', 2011, 'autoayuda', 4900, 3, 'B1', '#D4A017', 'normal',
    'Un recorrido por los "archivos mentales" que determinan nuestra relación con el dinero.'),
  L(13, 'Los 7 hábitos de la gente altamente efectiva', 'Stephen R. Covey', 'Paidós', 2015, 'autoayuda', 6200, 2, 'B4', '#2C3E50', 'normal',
    'Un enfoque integral para resolver problemas personales y profesionales a partir de principios.'),
  L(14, 'Shoe Dog', 'Phil Knight', 'Conecta', 2016, 'otros', 7900, 1, 'B5', '#1F1F1F', 'normal',
    'Las memorias del creador de Nike: una apuesta arriesgada, muchos tropiezos y la construcción de una marca.'),
  L(15, 'Empieza con el porqué', 'Simon Sinek', 'Empresa Activa', 2018, 'otros', 6900, 0, 'B5', '#D64541', 'normal',
    'Por qué algunas personas y organizaciones inspiran más que otras: todo empieza con un propósito claro.'),
  L(16, 'El gato con botas', 'Charles Perrault', 'Edelvives', 2019, 'ninos', 2500, 5, 'C1', '#F27A9B', 'infantil',
    'Un gato muy astuto, con botas y sombrero, convierte a su humilde amo en el Marqués de Carabás.'),
  L(17, 'El patito feo', 'Hans Christian Andersen', 'Edelvives', 2019, 'ninos', 2500, 4, 'C1', '#8FD3E8', 'infantil',
    'Un patito distinto a sus hermanos sufre rechazos hasta descubrir quién es en realidad.'),
  L(18, 'Hansel y Gretel', 'Hermanos Grimm', 'Edelvives', 2019, 'ninos', 2500, 3, 'C2', '#A3D9A5', 'infantil',
    'Dos hermanos perdidos en el bosque encuentran una casita de dulces… y una bruja muy hambrienta.'),
  L(19, 'El mago de Oz', 'L. Frank Baum', 'Anaya', 2017, 'ninos', 3200, 2, 'C2', '#5DBB8A', 'normal',
    'Dorothy viaja por el camino de baldosas amarillas junto a un espantapájaros, un hombre de hojalata y un león.'),
  L(20, 'Pulgarcito', 'Charles Perrault', 'Edelvives', 2019, 'ninos', 2500, 6, 'C1', '#F7C59F', 'infantil',
    'El más pequeño de siete hermanos usa su ingenio para salvarlos a todos del ogro.'),
  L(21, 'La gallina de los huevos de oro', 'Esopo', 'Edelvives', 2019, 'ninos', 2500, 2, 'C3', '#F4D03F', 'infantil',
    'Una fábula sobre la codicia: quien todo lo quiere, todo lo pierde.'),
  L(22, 'El soldadito de plomo', 'Hans Christian Andersen', 'Edelvives', 2019, 'ninos', 2500, 3, 'C3', '#6FA8DC', 'infantil',
    'Un soldadito de una sola pierna se enamora de una bailarina de papel y vive una gran aventura.'),
  L(23, 'La princesa y los trasgos', 'George MacDonald', 'Siruela', 2016, 'ninos', 4800, 1, 'C4', '#B39DDB', 'normal',
    'La princesa Irene y el joven minero Curdie se enfrentan a los trasgos que viven bajo la montaña.'),
  L(24, 'Santa Biblia Reina-Valera 1960', 'Sociedades Bíblicas Unidas', 'SBU', 2018, 'biblias', 4500, 8, 'D1', '#3B2F5C', 'grueso',
    'Edición clásica con letra legible, mapas y concordancia breve.'),
  L(25, 'Diccionario escolar de la lengua española', 'Real Academia Española', 'Santillana', 2019, 'diccionarios', 3800, 6, 'D3', '#C0392B', 'grueso',
    'Más de 30 000 definiciones adaptadas a estudiantes, con ejemplos y apéndices gramaticales.'),
  L(26, 'Compendio académico de Matemática', 'Asociación Fondo de Investigadores y Editores', 'Lumbreras', 2020, 'preu', 8500, 4, 'E1', '#2E86C1', 'grueso',
    'Teoría y problemas resueltos de aritmética, álgebra, geometría y trigonometría para el examen de admisión.'),
  L(27, 'Cálculo de una variable', 'James Stewart', 'Cengage', 2018, 'universitarios', 18900, 1, 'E3', '#117A65', 'grueso',
    'El texto de referencia de cálculo diferencial e integral, con miles de ejercicios.'),
  L(28, 'Tradiciones peruanas', 'Ricardo Palma', 'Peisa', 2014, 'regionales', 3500, 3, 'F1', '#B9770E', 'normal',
    'Relatos breves, pícaros y llenos de humor sobre la Lima colonial y republicana.'),
  L(29, 'Paco Yunque', 'César Vallejo', 'Bruño', 2018, 'regionales', 1500, 10, 'F2', '#F0A070', 'delgado',
    'El primer día de escuela de un niño del campo, frente a la injusticia y el abuso de poder.'),
  L(30, 'Warma kuyay y otros relatos', 'José María Arguedas', 'Peisa', 2013, 'regionales', 2800, 2, 'F2', '#8E6C8A', 'delgado',
    'Relatos de infancia en los Andes, donde el amor, la naturaleza y la injusticia se entrelazan.'),
];

export const estantePorId = (id: string) => ESTANTES.find((e) => e.id === id)!;

export const soles = (cent: number) =>
  'S/ ' + (cent / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Datos del inicio (ejemplo)
export const RESUMEN_HOY = { total: 48650, ventas: 9, libros: 14 };

export const ENCARGOS = [
  { titulo: 'Harry Potter y la piedra filosofal', cliente: 'Lucía M.', estado: 'Pendiente', color: '#FCEFC7' },
  { titulo: 'El arte de la guerra', cliente: 'Prof. Carlos R.', estado: 'Pedido al proveedor', color: '#E9E3FB' },
  { titulo: 'Aritmética Lumbreras', cliente: 'Diego S.', estado: '¡Llegó! Avisar', color: '#DDF3E4' },
];
