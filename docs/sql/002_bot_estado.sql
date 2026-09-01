-- ESPEC-ASIS-002 · Estado del bot e historial
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS bot_estado (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  estado ENUM('ACTIVO', 'MANTENIMIENTO', 'DESACTIVADO') NOT NULL DEFAULT 'ACTIVO',
  mensaje VARCHAR(255) NULL,
  programado_hasta DATETIME NULL,
  permitir_admins TINYINT(1) NOT NULL DEFAULT 1,
  version VARCHAR(20) NULL,
  ultima_sincronizacion DATETIME NULL,
  actualizado_por BIGINT UNSIGNED NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bot_estado_usuario
    FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bot_estado_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  estado_anterior ENUM('ACTIVO', 'MANTENIMIENTO', 'DESACTIVADO') NULL,
  estado_nuevo ENUM('ACTIVO', 'MANTENIMIENTO', 'DESACTIVADO') NOT NULL,
  mensaje VARCHAR(255) NULL,
  programado_hasta DATETIME NULL,
  origen ENUM('ERP', 'BOT', 'ADMIN', 'JOB') NOT NULL DEFAULT 'BOT',
  usuario_id BIGINT UNSIGNED NULL,
  api_key_id BIGINT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  notificado_canal TINYINT(1) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bot_hist_fecha (creado_en),
  KEY idx_bot_hist_estado (estado_nuevo),
  CONSTRAINT fk_bot_hist_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bot_estado (id, estado, version)
VALUES (1, 'ACTIVO', '2.1.0')
ON DUPLICATE KEY UPDATE version = VALUES(version);

INSERT INTO schema_migrations (version) VALUES ('002_bot_estado')
ON DUPLICATE KEY UPDATE version = version;
