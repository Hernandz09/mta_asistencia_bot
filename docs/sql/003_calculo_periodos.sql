-- ESPEC-ASIS-003 · Ventana efectiva de evaluación y fecha de inicio
SET NAMES utf8mb4;
SET time_zone = '+00:00';

INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('asistencia.fecha_inicio', '2026-08-17', 'Primera fecha con registro de asistencias. Nada anterior se evalúa'),
  ('asistencia.contar_dia_en_curso', '0', '1 = el día de hoy entra al denominador antes de cerrar su ventana'),
  ('nota.periodo_base', 'MES', 'Periodo sobre el que se calcula la nota oficial')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- Si la fecha de alta es posterior a la primera jornada, se alinea al histórico real.
UPDATE practicantes p
INNER JOIN (
  SELECT practicante_id, MIN(fecha) AS primera
  FROM jornadas
  WHERE contexto = 'REGULAR'
  GROUP BY practicante_id
) j ON j.practicante_id = p.id
SET p.fecha_inicio = j.primera
WHERE p.fecha_inicio IS NULL OR p.fecha_inicio > j.primera;

INSERT INTO schema_migrations (version) VALUES ('003_calculo_periodos')
ON DUPLICATE KEY UPDATE version = version;
