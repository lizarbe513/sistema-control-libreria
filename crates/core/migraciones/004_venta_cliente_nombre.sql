-- Nombre del cliente tal como lo dio en la venta (opcional; sin nombre queda «Cliente»).
ALTER TABLE ventas ADD COLUMN cliente_nombre TEXT NOT NULL DEFAULT 'Cliente';
UPDATE ventas SET cliente_nombre = COALESCE((SELECT nombre FROM clientes WHERE clientes.id = ventas.cliente_id), 'Cliente');
