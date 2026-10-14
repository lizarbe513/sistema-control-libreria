-- Costo del libro al momento de la venta, para calcular la ganancia aunque el costo cambie después.
ALTER TABLE venta_items ADD COLUMN costo_unit_cent INTEGER NOT NULL DEFAULT 0;
UPDATE venta_items SET costo_unit_cent = COALESCE((SELECT costo_cent FROM libros WHERE libros.id = venta_items.libro_id), 0);
CREATE INDEX movimientos_motivo ON movimientos_stock (libro_id, motivo, fecha);
