-- Usuarias y configuración general.
CREATE TABLE usuarios (
    id           INTEGER PRIMARY KEY,
    nombre       TEXT    NOT NULL,
    rol          TEXT    NOT NULL CHECK (rol IN ('duena', 'vendedor')),
    pin_hash     TEXT    NOT NULL,
    avatar       TEXT    NOT NULL DEFAULT '',
    preferencias TEXT    NOT NULL DEFAULT '{}',
    activo       INTEGER NOT NULL DEFAULT 1,
    creado       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
