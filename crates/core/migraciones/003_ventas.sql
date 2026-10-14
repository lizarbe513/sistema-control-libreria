-- Ventas: tipos de cliente, clientes (mínimo), ventas, ítems y pagos. Montos en céntimos.
CREATE TABLE tipos_cliente (
    id            INTEGER PRIMARY KEY,
    nombre        TEXT    NOT NULL,
    descuento_pct INTEGER NOT NULL CHECK (descuento_pct BETWEEN 0 AND 100),
    orden         INTEGER NOT NULL DEFAULT 0,
    activo        INTEGER NOT NULL DEFAULT 1
);
INSERT INTO tipos_cliente (nombre, descuento_pct, orden) VALUES ('Público', 0, 1), ('Profesor', 15, 2), ('Mayorista', 25, 3);

-- Ficha mínima; el hito de encargos la amplía (correo, historial…).
CREATE TABLE clientes (
    id              INTEGER PRIMARY KEY,
    nombre          TEXT    NOT NULL,
    telefono        TEXT    NOT NULL DEFAULT '',
    tipo_cliente_id INTEGER REFERENCES tipos_cliente (id),
    notas           TEXT    NOT NULL DEFAULT '',
    creado          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ventas (
    id               INTEGER PRIMARY KEY,
    fecha            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    usuario_id       INTEGER NOT NULL REFERENCES usuarios (id),
    cliente_id       INTEGER REFERENCES clientes (id),
    -- el tipo se copia: si la Dueña cambia los porcentajes, el historial no se altera
    tipo_cliente_id  INTEGER REFERENCES tipos_cliente (id),
    tipo_nombre      TEXT    NOT NULL,
    tipo_pct         INTEGER NOT NULL,
    subtotal_cent    INTEGER NOT NULL,
    descuento_cent   INTEGER NOT NULL,
    redondeo_cent    INTEGER NOT NULL DEFAULT 0,
    total_cent       INTEGER NOT NULL,
    anulada          INTEGER NOT NULL DEFAULT 0,
    anulada_por      INTEGER REFERENCES usuarios (id),
    anulada_fecha    TEXT,
    motivo_anulacion TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX ventas_fecha ON ventas (fecha);

CREATE TABLE venta_items (
    id               INTEGER PRIMARY KEY,
    venta_id         INTEGER NOT NULL REFERENCES ventas (id),
    libro_id         INTEGER NOT NULL REFERENCES libros (id),
    titulo           TEXT    NOT NULL,
    cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unit_cent INTEGER NOT NULL,
    descuento_cent   INTEGER NOT NULL,
    total_cent       INTEGER NOT NULL
);
CREATE INDEX venta_items_venta ON venta_items (venta_id);
CREATE INDEX venta_items_libro ON venta_items (libro_id);

CREATE TABLE pagos (
    id           INTEGER PRIMARY KEY,
    venta_id     INTEGER NOT NULL REFERENCES ventas (id),
    metodo       TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'yape_plin', 'transferencia')),
    monto_cent   INTEGER NOT NULL CHECK (monto_cent > 0),
    recibido_cent INTEGER,
    vuelto_cent  INTEGER
);
CREATE INDEX pagos_venta ON pagos (venta_id);

INSERT INTO config (clave, valor) VALUES ('tope_descuento_vendedora', '10');
