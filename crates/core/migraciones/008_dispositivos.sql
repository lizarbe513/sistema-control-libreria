-- Celulares vinculados al PC. De cada uno solo se guarda el hash de su token: el token en sí vive en el teléfono.
CREATE TABLE dispositivos (
    id          INTEGER PRIMARY KEY,
    nombre      TEXT    NOT NULL,
    token_hash  TEXT    NOT NULL UNIQUE,
    creado      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ultimo_uso  TEXT,
    revocado    INTEGER NOT NULL DEFAULT 0,
    revocado_en TEXT
);
