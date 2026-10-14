-- Inventario: categorías, libros, etiquetas y movimientos de stock. Tienda en bloques y plantillas.

CREATE TABLE categorias (
    id     INTEGER PRIMARY KEY,
    clave  TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    color  TEXT NOT NULL,
    patron TEXT NOT NULL,
    orden  INTEGER NOT NULL DEFAULT 0
);

-- Las del folleto de la tienda.
INSERT INTO categorias (clave, nombre, color, patron, orden) VALUES
    ('literarias',     'Obras literarias',   '#E9E3FB', 'marco',      1),
    ('diccionarios',   'Diccionarios',       '#DDEFFB', 'dorado',     2),
    ('biblias',        'Biblias',            '#DDEFFB', 'dorado',     3),
    ('autoayuda',      'Autoayuda',          '#FCEFC7', 'rayos',      4),
    ('ninos',          'Cuentos para niños', '#FBD3DE', 'confeti',    5),
    ('regionales',     'Cuentos regionales', '#FDE2D0', 'andino',     6),
    ('preu',           'Pre-universitarios', '#DDF3E4', 'cuadricula', 7),
    ('universitarios', 'Universitarios',     '#DDF3E4', 'cuadricula', 8),
    ('otros',          'Otros',              '#F1ECEE', 'ondas',      9);

CREATE TABLE libros (
    id           INTEGER PRIMARY KEY,
    isbn         TEXT UNIQUE,                 -- ISBN-13 normalizado (sin guiones)
    codigo       TEXT NOT NULL UNIQUE,        -- el ISBN, o un código interno «SXXI-000123»
    titulo       TEXT NOT NULL,
    autor        TEXT NOT NULL DEFAULT '',
    editorial    TEXT NOT NULL DEFAULT '',
    anio         INTEGER,
    sinopsis     TEXT NOT NULL DEFAULT '',
    portada      TEXT,                        -- archivo dentro de portadas/
    color_tapa   TEXT NOT NULL DEFAULT '#F27A9B',
    formato      TEXT NOT NULL DEFAULT 'normal' CHECK (formato IN ('normal', 'grueso', 'infantil', 'delgado')),
    categoria_id INTEGER NOT NULL REFERENCES categorias (id),
    precio_cent  INTEGER NOT NULL DEFAULT 0 CHECK (precio_cent >= 0),
    costo_cent   INTEGER NOT NULL DEFAULT 0 CHECK (costo_cent >= 0),
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 1 CHECK (stock_minimo >= 0),
    estante_id   TEXT,                        -- referencia blanda: el estante puede cambiar en «Mi tienda»
    tramo        INTEGER,
    repisa       INTEGER,
    activo       INTEGER NOT NULL DEFAULT 1,
    creado       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    actualizado  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX libros_categoria ON libros (categoria_id);

CREATE TABLE etiquetas (
    id     INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE libro_etiqueta (
    libro_id    INTEGER NOT NULL REFERENCES libros (id) ON DELETE CASCADE,
    etiqueta_id INTEGER NOT NULL REFERENCES etiquetas (id) ON DELETE CASCADE,
    PRIMARY KEY (libro_id, etiqueta_id)
);

CREATE TABLE movimientos_stock (
    id         INTEGER PRIMARY KEY,
    libro_id   INTEGER NOT NULL REFERENCES libros (id),
    delta      INTEGER NOT NULL,
    motivo     TEXT NOT NULL CHECK (motivo IN ('alta', 'ingreso', 'ajuste', 'venta', 'anulacion')),
    nota       TEXT NOT NULL DEFAULT '',
    usuario_id INTEGER REFERENCES usuarios (id),
    fecha      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX movimientos_libro ON movimientos_stock (libro_id, fecha);

-- La tienda en bloques (editor «Mi tienda»).
CREATE TABLE tienda (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    ancho   INTEGER NOT NULL,
    fondo   INTEGER NOT NULL,
    alto    INTEGER NOT NULL,
    fachada INTEGER NOT NULL
);

CREATE TABLE estantes (
    id           TEXT PRIMARY KEY,
    posicion     INTEGER NOT NULL,
    letra        TEXT,
    titulo       TEXT NOT NULL,
    tema         TEXT NOT NULL DEFAULT '',
    color        TEXT NOT NULL,
    fuerte       TEXT NOT NULL,
    orden        TEXT,          -- json {tramos, repisas}
    inicio_tramo TEXT,          -- json ["x,z", …] o NULL (división por defecto)
    tablas       TEXT           -- json ["x,y,z", …] o NULL
);

CREATE TABLE bloques (
    x          INTEGER NOT NULL,
    y          INTEGER NOT NULL,
    z          INTEGER NOT NULL,
    tipo       TEXT NOT NULL,
    rot        INTEGER NOT NULL DEFAULT 0,
    estante_id TEXT,
    PRIMARY KEY (x, y, z)
) WITHOUT ROWID;

CREATE TABLE plantillas_tienda (
    id     TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    datos  TEXT NOT NULL,
    creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
