-- Encargos de clientes (libros que no hay o están agotados) y la ficha completa del cliente.
ALTER TABLE clientes ADD COLUMN correo TEXT NOT NULL DEFAULT '';
CREATE INDEX clientes_telefono ON clientes (telefono);

CREATE TABLE encargos (
    id           INTEGER PRIMARY KEY,
    cliente_id   INTEGER NOT NULL REFERENCES clientes (id),
    -- el libro del inventario, si ya existe; si no, solo título y autor escritos
    libro_id     INTEGER REFERENCES libros (id),
    titulo       TEXT    NOT NULL,
    autor        TEXT    NOT NULL DEFAULT '',
    cantidad     INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    estado       TEXT    NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'pedido', 'llego', 'avisado', 'entregado', 'cancelado')),
    notas        TEXT    NOT NULL DEFAULT '',
    usuario_id   INTEGER REFERENCES usuarios (id),
    venta_id     INTEGER REFERENCES ventas (id),
    creado       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    actualizado  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    fecha_pedido TEXT,
    fecha_llego  TEXT,
    fecha_aviso  TEXT,
    fecha_cierre TEXT
);
CREATE INDEX encargos_estado ON encargos (estado);
CREATE INDEX encargos_libro ON encargos (libro_id);
CREATE INDEX encargos_cliente ON encargos (cliente_id);

-- Adelantos (positivos) y devoluciones (negativos). Cuentan en la caja del día en que ocurren.
CREATE TABLE encargo_pagos (
    id         INTEGER PRIMARY KEY,
    encargo_id INTEGER NOT NULL REFERENCES encargos (id),
    metodo     TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'yape_plin', 'transferencia')),
    monto_cent INTEGER NOT NULL CHECK (monto_cent <> 0),
    fecha      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    usuario_id INTEGER REFERENCES usuarios (id)
);
CREATE INDEX encargo_pagos_encargo ON encargo_pagos (encargo_id);
CREATE INDEX encargo_pagos_fecha ON encargo_pagos (fecha);

ALTER TABLE ventas ADD COLUMN encargo_id INTEGER REFERENCES encargos (id);
ALTER TABLE ventas ADD COLUMN adelanto_cent INTEGER NOT NULL DEFAULT 0;
