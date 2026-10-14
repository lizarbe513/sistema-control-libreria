-- Precio del encargo: costo del proveedor (opcional), precio acordado con el cliente y portada de referencia (URL).
ALTER TABLE encargos ADD COLUMN costo_cent INTEGER;
ALTER TABLE encargos ADD COLUMN precio_acordado_cent INTEGER;
ALTER TABLE encargos ADD COLUMN portada_url TEXT;
