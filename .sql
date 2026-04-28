SELECT 
  e.id,
  e.condominio_id,
  e.apartamento_id,
  e.transportadora,
  a.numero,
  a.bloco,
  a.condominio_id as apto_condo_id
FROM entregas e
LEFT JOIN apartamentos a ON a.id = e.apartamento_id
WHERE e.id = 'bc9ceca1-cfe3-44c3-878b-d098585abf0b';