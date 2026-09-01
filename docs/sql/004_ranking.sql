-- ESPEC-ASIS-004 · Ranking /top
SET NAMES utf8mb4;
SET time_zone = '+00:00';

INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('ranking.dias_minimos', '3', 'Días evaluados mínimos para calificar en /top'),
  ('ranking.pct_dias_minimos', '0.40', 'Porcentaje del periodo exigido para calificar'),
  ('ranking.limite_default', '10', 'Cantidad de posiciones por defecto en /top'),
  ('ranking.mostrar_menciones', '0', 'Si el top menciona con @ a los practicantes'),
  ('ranking.cache_segundos', '300', 'TTL del ranking en caché')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_periodo ENUM('SEMANA','MES','TOTAL') NOT NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  area VARCHAR(32) NOT NULL DEFAULT 'todas',
  criterio ENUM('ASISTENCIA','PUNTUALIDAD','HORAS','NOTA') NOT NULL DEFAULT 'ASISTENCIA',
  practicante_id BIGINT UNSIGNED NOT NULL,
  posicion SMALLINT UNSIGNED NOT NULL,
  dias_programados SMALLINT UNSIGNED NOT NULL,
  dias_asistidos SMALLINT UNSIGNED NOT NULL,
  dias_puntuales SMALLINT UNSIGNED NOT NULL,
  tardanzas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  faltas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pct_asistencia DECIMAL(5,2) NOT NULL,
  pct_puntualidad DECIMAL(5,2) NOT NULL,
  pct_horas DECIMAL(5,2) NOT NULL,
  horas_acumuladas DECIMAL(7,2) NOT NULL DEFAULT 0,
  nota DECIMAL(4,2) NULL,
  calificado TINYINT(1) NOT NULL DEFAULT 1,
  generado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ranking_snapshot
    (tipo_periodo, periodo_inicio, criterio, area, practicante_id),
  KEY idx_ranking_periodo (tipo_periodo, periodo_inicio, posicion),
  CONSTRAINT fk_ranking_practicante FOREIGN KEY (practicante_id)
    REFERENCES practicantes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('004_ranking')
ON DUPLICATE KEY UPDATE version = version;
