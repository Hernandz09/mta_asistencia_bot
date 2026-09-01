-- =============================================================================
-- ESPEC-ASIS-001 · Fase 1 — Fundación
-- Schema MySQL 8 · utf8mb4 · timestamps en UTC
-- Marcaciones: append-only (triggers bloquean UPDATE/DELETE)
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) NOT NULL,
  aplicado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS config_sistema (
  clave VARCHAR(64) NOT NULL,
  valor VARCHAR(255) NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(190) NULL,
  rol ENUM('encargado', 'rrhh', 'gerencia', 'sistema') NOT NULL DEFAULT 'encargado',
  discord_id VARCHAR(32) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_correo (correo),
  UNIQUE KEY uq_usuarios_discord (discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practicantes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(32) NOT NULL,
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  dni VARCHAR(20) NULL,
  correo VARCHAR(190) NULL,
  telefono VARCHAR(30) NULL,
  area ENUM('software', 'video', 'admin', 'marketing', 'fotografia', 'diseno') NOT NULL DEFAULT 'software',
  encargado_id BIGINT UNSIGNED NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  estado ENUM('activo', 'cesado', 'suspendido') NOT NULL DEFAULT 'activo',
  id_externo_bot VARCHAR(32) NULL COMMENT 'discord_id del bot actual',
  carrera VARCHAR(120) NULL,
  ciclo VARCHAR(20) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_practicantes_codigo (codigo),
  UNIQUE KEY uq_practicantes_dni (dni),
  UNIQUE KEY uq_practicantes_bot (id_externo_bot),
  KEY ix_practicantes_area_estado (area, estado),
  KEY ix_practicantes_encargado (encargado_id),
  CONSTRAINT fk_practicantes_encargado
    FOREIGN KEY (encargado_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS horarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  limite_horas_semana DECIMAL(5, 2) NOT NULL DEFAULT 30.00,
  tolerancia_entrada_min SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  adelanto_max_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  tolerancia_salida_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  limite_sin_salida_min SMALLINT UNSIGNED NOT NULL DEFAULT 180,
  refrigerio_min SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_horarios_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS horario_dias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  horario_id BIGINT UNSIGNED NOT NULL,
  dia_semana TINYINT UNSIGNED NOT NULL COMMENT '1=lunes … 7=domingo',
  hora_entrada TIME NULL,
  hora_salida TIME NULL,
  es_laborable TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_horario_dia (horario_id, dia_semana),
  CONSTRAINT fk_horario_dias_horario
    FOREIGN KEY (horario_id) REFERENCES horarios (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT ck_horario_dias_dia CHECK (dia_semana BETWEEN 1 AND 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asignaciones_horario (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  horario_id BIGINT UNSIGNED NOT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  creado_por BIGINT UNSIGNED NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_asig_practicante_vigencia (practicante_id, vigente_desde, vigente_hasta),
  KEY ix_asig_horario (horario_id),
  CONSTRAINT fk_asig_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_asig_horario
    FOREIGN KEY (horario_id) REFERENCES horarios (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_asig_creado_por
    FOREIGN KEY (creado_por) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS excepciones_dia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  hora_entrada_override TIME NULL,
  hora_salida_override TIME NULL,
  motivo VARCHAR(500) NOT NULL,
  creado_por BIGINT UNSIGNED NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_excepcion_dia (practicante_id, fecha),
  KEY ix_excepciones_fecha (fecha),
  CONSTRAINT fk_exc_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_exc_creado_por
    FOREIGN KEY (creado_por) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recuperaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  estado ENUM('programada', 'en_curso', 'cumplida', 'no_cumplida', 'anulada') NOT NULL DEFAULT 'programada',
  habilitada_por BIGINT UNSIGNED NULL,
  horas_objetivo DECIMAL(5, 2) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_recup_practicante_fecha (practicante_id, fecha),
  KEY ix_recup_estado (estado),
  CONSTRAINT fk_recup_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recup_habilitada_por
    FOREIGN KEY (habilitada_por) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marcaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('ENTRADA', 'SALIDA') NOT NULL,
  contexto ENUM('REGULAR', 'RECUPERACION') NOT NULL DEFAULT 'REGULAR',
  recuperacion_id BIGINT UNSIGNED NULL,
  marcado_en DATETIME(3) NOT NULL COMMENT 'UTC',
  origen ENUM('bot', 'web', 'admin', 'migracion') NOT NULL DEFAULT 'bot',
  ip VARCHAR(45) NULL,
  dispositivo VARCHAR(120) NULL,
  latitud DECIMAL(9, 6) NULL,
  longitud DECIMAL(9, 6) NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_marcaciones_idempotency (idempotency_key),
  KEY ix_marcaciones_practicante_fecha (practicante_id, marcado_en),
  KEY ix_marcaciones_tipo_contexto (tipo, contexto),
  KEY ix_marcaciones_recuperacion (recuperacion_id),
  CONSTRAINT fk_marc_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_marc_recuperacion
    FOREIGN KEY (recuperacion_id) REFERENCES recuperaciones (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jornadas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  contexto ENUM('REGULAR', 'RECUPERACION') NOT NULL DEFAULT 'REGULAR',
  recuperacion_id BIGINT UNSIGNED NULL,
  hora_entrada_programada TIME NULL,
  hora_salida_programada TIME NULL,
  entrada_real DATETIME(3) NULL COMMENT 'UTC',
  salida_real DATETIME(3) NULL COMMENT 'UTC',
  estado_entrada ENUM(
    'PUNTUAL',
    'PUNTUAL_ANTICIPADO',
    'TARDANZA',
    'FUERA_DE_HORARIO',
    'SIN_MARCA'
  ) NULL,
  estado_salida ENUM(
    'PUNTUAL',
    'SALIDA_ANTICIPADA',
    'FUERA_DE_HORA_SALIDA',
    'SIN_SALIDA'
  ) NULL,
  estado_jornada ENUM(
    'ABIERTA',
    'CERRADA',
    'FALTA',
    'LICENCIA',
    'VACACIONES',
    'NO_LABORABLE',
    'FALTA_JUSTIFICADA'
  ) NOT NULL DEFAULT 'ABIERTA',
  horas_computadas DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
  horas_por_justificar DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
  horas_justificadas DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
  horas_excedente DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
  minutos_tardanza SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  recalculado_en DATETIME(3) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_jornada_unica (practicante_id, fecha, contexto),
  KEY ix_jornadas_fecha_estado (fecha, estado_jornada),
  KEY ix_jornadas_recuperacion (recuperacion_id),
  CONSTRAINT fk_jornada_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_jornada_recuperacion
    FOREIGN KEY (recuperacion_id) REFERENCES recuperaciones (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS justificaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jornada_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('tardanza', 'salida_anticipada', 'sin_salida', 'falta', 'fuera_horario') NOT NULL,
  motivo VARCHAR(800) NOT NULL,
  horas_otorgadas DECIMAL(6, 2) NOT NULL,
  encargado_id BIGINT UNSIGNED NULL,
  evidencia_url VARCHAR(500) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_just_jornada (jornada_id),
  KEY ix_just_encargado (encargado_id),
  CONSTRAINT fk_just_jornada
    FOREIGN KEY (jornada_id) REFERENCES jornadas (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_just_encargado
    FOREIGN KEY (encargado_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS horas_extra (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  practicante_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  horas DECIMAL(6, 2) NOT NULL,
  motivo VARCHAR(400) NULL,
  origen VARCHAR(32) NOT NULL DEFAULT 'bot',
  creado_por_discord VARCHAR(32) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_horas_extra_prac_fecha (practicante_id, fecha),
  CONSTRAINT fk_horas_extra_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feriados (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha DATE NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  aplica_a ENUM('todos', 'area', 'practicante') NOT NULL DEFAULT 'todos',
  area ENUM('software', 'video', 'admin', 'marketing', 'fotografia', 'diseno') NULL,
  practicante_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_feriados_fecha (fecha),
  KEY ix_feriados_practicante (practicante_id),
  CONSTRAINT fk_feriado_practicante
    FOREIGN KEY (practicante_id) REFERENCES practicantes (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entidad VARCHAR(64) NOT NULL,
  entidad_id BIGINT UNSIGNED NOT NULL,
  accion VARCHAR(40) NOT NULL,
  valor_anterior JSON NULL,
  valor_nuevo JSON NULL,
  usuario_id BIGINT UNSIGNED NULL,
  fecha DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_aud_entidad (entidad, entidad_id),
  KEY ix_aud_usuario_fecha (usuario_id, fecha),
  CONSTRAINT fk_aud_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_marcaciones_no_update;
DROP TRIGGER IF EXISTS trg_marcaciones_no_delete;

CREATE TRIGGER trg_marcaciones_no_update
BEFORE UPDATE ON marcaciones
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'marcaciones es append-only: no se puede UPDATE';

CREATE TRIGGER trg_marcaciones_no_delete
BEFORE DELETE ON marcaciones
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'marcaciones es append-only: no se puede DELETE';

INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('timezone', 'America/Lima', 'Zona horaria de negocio; la DB guarda UTC'),
  ('nota_peso_asistencia', '0.40', 'Peso % asistencia en nota 0-20'),
  ('nota_peso_puntualidad', '0.30', 'Peso % puntualidad en nota 0-20'),
  ('nota_peso_horas', '0.30', 'Peso % horas en nota 0-20'),
  ('alerta_limite_horas_pct', '90', 'Aviso al encargado al alcanzar este % del tope semanal'),
  ('limite_horas_semana_default', '30', 'Tope semanal por defecto (blando)'),
  ('schema_spec', 'ESPEC-ASIS-001', 'Documento de especificación')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

INSERT INTO usuarios (id, nombre, correo, rol, activo)
VALUES (1, 'Sistema (migración)', 'sistema@mta.local', 'sistema', 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

INSERT INTO schema_migrations (version) VALUES ('001_schema')
ON DUPLICATE KEY UPDATE version = version;
