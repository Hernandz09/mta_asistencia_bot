# Bot de Asistencias — Comandos de Discord y Control de Estado
**Código:** ESPEC-ASIS-002 · **Versión:** 1.0 · **Empresa:** MTA SOFTWARE
**Alcance de este documento:** comando de estadísticas del practicante, comando de estado del bot y endpoint para que el ERP cambie ese estado.

---

## 1. Nombre del comando de estadísticas

`/estadisticas` funciona, pero es largo de tipear y Discord ya ordena los comandos alfabéticamente, así que un nombre corto se encuentra más rápido.

| Opción | Comentario |
|---|---|
| **`/stats`** | **Recomendado.** Corto, universal, es lo que la gente ya escribe por costumbre |
| `/mi` | Muy corto pero ambiguo cuando crezcan los comandos |
| `/perfil` | Bueno si a futuro muestra también datos personales, no solo métricas |
| `/yo` | Cómodo, pero no sirve para consultar a otro practicante |

**Decisión propuesta:** registrar **`/stats`** como comando principal y `/estadisticas` como comando espejo (Discord no tiene alias nativos, así que se registran los dos apuntando al mismo handler). Quien ya se acostumbró al nombre largo lo sigue usando.

---

## 2. Comando `/stats`

### 2.1 Firma

```
/stats [usuario] [periodo]
```

| Parámetro | Tipo | Obligatorio | Valores | Por defecto |
|---|---|---|---|---|
| `usuario` | User | No | Mención de Discord | Quien ejecuta |
| `periodo` | String (choices) | No | `semana`, `mes`, `total` | `mes` |

### 2.2 Permisos

- Sin `usuario`: cualquier practicante registrado consulta lo suyo.
- Con `usuario`: solo roles **Encargado**, **RR.HH.** y **Admin**. Si un practicante intenta ver a otro, responde error efímero.
- Si quien ejecuta no está vinculado a ningún practicante: mensaje indicando que pida su registro al encargado.

### 2.3 Visibilidad

Respuesta **efímera** (`ephemeral: true`) por defecto: solo la ve quien ejecuta el comando. Son datos de desempeño y no deben quedar expuestos en el canal. Se agrega un botón **"Publicar en el canal"** por si el propio practicante quiere compartirla.

### 2.4 Diseño del embed

Sigue el estilo de tarjeta de la referencia: color de acento, thumbnail del avatar, campos en dos columnas y footer con la fecha de registro.

```
┌────────────────────────────────────────────────┐
│  Alejandro (@zkingwolfx)              [avatar] │
│  ⭐  Nivel: 3 (240/300 h)                       │
│  👑  Ranking: #4 de 18                          │
│                                                 │
│  Asistencia            Horas                    │
│  ✅ Puntuales: 32      🪙 Acumuladas: 240.5      │
│  ⏰ Tardanzas: 4       🏦 Esta semana: 26 / 30   │
│  ❌ Faltas: 1          📋 Por justificar: 3.0    │
│                                                 │
│  Rendimiento                                    │
│  📊 Asistencia: 94.6%   🎯 Puntualidad: 88.9%    │
│  📝 Nota del mes: 17.8 / 20  ·  Bueno            │
│                                                 │
│  Recuperaciones                                 │
│  🔁 Cumplidas: 2  ·  Pendientes: 1               │
│                                                 │
│  Periodo: Agosto 2026 · Registrado el 04/03/2026│
└────────────────────────────────────────────────┘
```

### 2.5 Mapeo de cada dato

| Campo del embed | Origen |
|---|---|
| Nivel | Tramos de horas acumuladas (ej. cada 100 h sube un nivel). Configurable en `configuraciones` |
| Ranking | Posición por nota dentro del área, en el periodo consultado |
| Puntuales / Tardanzas / Faltas | Conteo de `jornadas` por `estado_entrada` y `estado_jornada` |
| Horas acumuladas | Suma de `horas_computadas` + `horas_justificadas` |
| Esta semana | Horas de la semana ISO vigente vs. `limite_horas_semana` del horario asignado |
| Por justificar | Suma de `horas_por_justificar` sin justificación vigente |
| Asistencia / Puntualidad | Indicadores de la sección 9 de ESPEC-ASIS-001 |
| Nota | Fórmula ponderada de la misma sección |
| Recuperaciones | `recuperaciones` por estado `cumplida` / `programada` |
| Registrado el | `practicantes.fecha_inicio` |

### 2.6 Color del embed según la nota

| Nota | Color |
|---|---|
| 18 – 20 | Verde `#2ECC71` |
| 15 – 17.9 | Azul `#3498DB` |
| 12 – 14.9 | Ámbar `#F1C40F` |
| 0 – 11.9 | Rojo `#E74C3C` |

### 2.7 Barra de progreso semanal

Debajo de "Esta semana", una barra en bloques para lectura rápida:

```
26 / 30 h  ▰▰▰▰▰▰▰▰▱▱  87%
```

Si supera el tope: `32 / 30 h  ▰▰▰▰▰▰▰▰▰▰  107% ⚠️ Excedente`

### 2.8 Botones adjuntos

| Botón | Acción |
|---|---|
| 📅 Ver detalle | Embed con el desglose día por día del periodo |
| 🔁 Cambiar periodo | Menú desplegable: semana / mes / total |
| 📤 Publicar | Reenvía el embed al canal, ya no efímero |

### 2.9 Consumo interno

El comando no consulta la base directamente: llama a
`GET /api/v1/practicantes/{id}/resumen?periodo=2026-08`
con caché de 60 segundos por practicante y periodo, para no golpear la API si alguien spamea el comando.

### 2.10 Casos de error

| Situación | Respuesta |
|---|---|
| Usuario de Discord no vinculado | "No estás registrado como practicante. Solicita tu registro a tu encargado." |
| Practicante sin jornadas en el periodo | Embed con todo en cero y nota "Sin registros en este periodo" |
| Practicante cesado | Muestra sus datos con la marca "Practicante cesado — datos históricos" |
| API caída | "No pude obtener tus estadísticas ahora. Intenta en unos minutos." |
| Sin permiso para consultar a otro | "Solo tu encargado o RR.HH. pueden consultar estadísticas de otros practicantes." |

---

## 3. Comando `/status`

### 3.1 Firma

```
/status
```

Sin parámetros. Disponible para **todos**, incluso en estado `MANTENIMIENTO` y `DESACTIVADO`; es el único comando que nunca se bloquea.

### 3.2 Estados del bot

| Estado | Marcaciones | Comandos de consulta | Comportamiento |
|---|---|---|---|
| `ACTIVO` | ✅ Habilitadas | ✅ Habilitados | Operación normal |
| `MANTENIMIENTO` | ❌ Bloqueadas | ✅ Habilitados (solo lectura) | Responde con el mensaje de mantenimiento y la hora estimada de retorno. Los roles Admin siguen pudiendo marcar para pruebas |
| `DESACTIVADO` | ❌ Bloqueadas | ❌ Bloqueados | Solo responde `/status`. Se usa fuera de temporada o ante un incidente |

### 3.3 Embed de respuesta

**Estado activo:**

```
┌────────────────────────────────────────────────┐
│  🟢  Bot de Asistencias — ACTIVO                │
│  Todos los servicios operativos                 │
│                                                 │
│  Sistema                  Conexiones            │
│  ⚙️ Versión: 2.1.0        🗄️ Base de datos: OK   │
│  ⏱️ Latencia: 84 ms       🔌 API ERP: OK         │
│  🕐 Uptime: 6d 4h 12m     🔄 Última sinc: 12:40  │
│                                                 │
│  📍 Ventana actual: Entrada 07:00 – 08:05        │
│                                                 │
│  Actualizado: 31/08/2026 13:02 (America/Lima)   │
└────────────────────────────────────────────────┘
```

**Estado mantenimiento:**

```
┌────────────────────────────────────────────────┐
│  🟡  Bot de Asistencias — EN MANTENIMIENTO      │
│  Migración de base de datos                     │
│                                                 │
│  ⛔ Las marcaciones están temporalmente          │
│     deshabilitadas.                             │
│  🕐 Retorno estimado: 31/08/2026 18:00           │
│  👤 Activado por: Wilson Acosta                  │
│                                                 │
│  Si necesitas marcar, avisa a tu encargado      │
│  para registrar la asistencia manualmente.      │
└────────────────────────────────────────────────┘
```

**Estado desactivado:**

```
┌────────────────────────────────────────────────┐
│  🔴  Bot de Asistencias — DESACTIVADO           │
│  Fuera de servicio                              │
│                                                 │
│  El bot no está aceptando comandos.             │
│  Contacta a RR.HH. para más información.        │
└────────────────────────────────────────────────┘
```

### 3.4 Campos según el rol

| Campo | Practicante | Encargado | Admin |
|---|---|---|---|
| Estado y mensaje | ✅ | ✅ | ✅ |
| Latencia y uptime | ✅ | ✅ | ✅ |
| Versión | — | ✅ | ✅ |
| Estado de base de datos y API | — | ✅ | ✅ |
| Última sincronización | — | ✅ | ✅ |
| Quién cambió el estado | — | — | ✅ |
| Botón "Cambiar estado" | — | — | ✅ |

### 3.5 Bloqueo de comandos

Un middleware global se ejecuta antes de cualquier comando:

```
si estado != ACTIVO y comando != /status:
    si estado == MANTENIMIENTO y usuario tiene rol ADMIN:
        continuar
    si no:
        responder embed de estado (efímero) y detener
```

### 3.6 Aviso automático en el canal

Al cambiar el estado desde el ERP, si el payload trae `notificar_canal: true`, el bot publica un aviso en el canal configurado y actualiza su presencia en Discord:

| Estado | Presencia de Discord |
|---|---|
| `ACTIVO` | 🟢 En línea — "Registrando asistencias" |
| `MANTENIMIENTO` | 🟡 Ausente — "En mantenimiento" |
| `DESACTIVADO` | 🔴 No molestar — "Fuera de servicio" |

---

## 4. Endpoint de control de estado desde el ERP

Base: `/api/v1` · Autenticación: **API Key** con scope `bot:write` o **JWT** de rol Admin/RR.HH.

### 4.1 Consultar estado

```http
GET /api/v1/bot/estado
```

**Respuesta 200**

```json
{
  "data": {
    "estado": "ACTIVO",
    "mensaje": null,
    "programado_hasta": null,
    "version": "2.1.0",
    "uptime_segundos": 533520,
    "latencia_ms": 84,
    "conexiones": { "base_datos": "OK", "api_erp": "OK", "discord": "OK" },
    "ultima_sincronizacion": "2026-08-31T12:40:00-05:00",
    "actualizado_en": "2026-08-25T09:12:00-05:00",
    "actualizado_por": { "id": 1, "nombre": "Wilson Acosta" }
  }
}
```

### 4.2 Cambiar estado

```http
PUT /api/v1/bot/estado
Content-Type: application/json
Authorization: Bearer {token}
Idempotency-Key: {uuid}
```

```json
{
  "estado": "MANTENIMIENTO",
  "mensaje": "Migración de base de datos",
  "programado_hasta": "2026-08-31T18:00:00-05:00",
  "notificar_canal": true,
  "permitir_admins": true
}
```

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `estado` | enum | Sí | `ACTIVO`, `MANTENIMIENTO`, `DESACTIVADO` |
| `mensaje` | string(255) | Sí si no es `ACTIVO` | Se muestra en `/status` |
| `programado_hasta` | datetime ISO-8601 | No | Debe ser futuro. Al llegar la hora, un job devuelve el bot a `ACTIVO` |
| `notificar_canal` | boolean | No | Por defecto `true` |
| `permitir_admins` | boolean | No | Por defecto `true`. Solo aplica a `MANTENIMIENTO` |

**Respuesta 200:** mismo objeto de `GET /bot/estado` ya actualizado.

**Errores**

| Código | Caso |
|---|---|
| 400 | `estado` inválido o `mensaje` faltante cuando es obligatorio |
| 401 | Token o API Key ausente/inválida |
| 403 | Credencial sin scope `bot:write` |
| 409 | El bot ya está en ese estado con el mismo mensaje |
| 422 | `programado_hasta` en el pasado |

### 4.3 Atajos

```http
POST /api/v1/bot/estado/mantenimiento   → equivale a PUT con estado MANTENIMIENTO
POST /api/v1/bot/estado/activar         → devuelve el bot a ACTIVO y limpia mensaje
POST /api/v1/bot/estado/desactivar      → estado DESACTIVADO
```

Existen para que el ERP pueda tener botones directos sin armar el body completo.

### 4.4 Historial de cambios (CRUD completo)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/bot/estado/historial` | Lista paginada `?desde&hasta&estado&usuario_id` |
| GET | `/bot/estado/historial/{id}` | Detalle de un cambio |
| POST | `/bot/estado/historial` | Registro manual (uso interno del bot al arrancar) |
| PATCH | `/bot/estado/historial/{id}` | Corregir el motivo registrado |
| DELETE | `/bot/estado/historial/{id}` | Anulación lógica (`deleted_at`), nunca borrado físico |

### 4.5 Salud del servicio

```http
GET /api/v1/bot/health
```

Sin autenticación, para monitoreo externo. Devuelve `200` si el bot está conectado a Discord y a la base, `503` si algo está caído. Independiente del estado lógico: un bot en `MANTENIMIENTO` sigue respondiendo `200` porque el proceso está vivo.

---

## 5. Propagación del cambio al bot

El ERP escribe en la API, pero el bot es un proceso aparte y necesita enterarse. Tres mecanismos en cascada:

1. **Webhook (inmediato).** La API dispara el evento `bot.estado.cambiado` al endpoint interno del bot. Latencia menor a 1 segundo.
2. **Polling de respaldo.** El bot consulta `GET /bot/estado` cada 30 segundos. Cubre el caso de que el webhook falle o el bot se haya reiniciado.
3. **Al arrancar.** El bot lee el estado antes de registrar sus comandos. Si la API no responde, arranca en `MANTENIMIENTO` por seguridad — es preferible bloquear marcaciones a registrarlas con reglas desactualizadas.

Se cachea el estado en memoria con TTL de 30 segundos para que el middleware no consulte la base en cada comando.

---

## 6. Tablas necesarias

```sql
-- Estado vigente del bot (una sola fila, id = 1)
CREATE TABLE bot_estado (
  id                    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  estado                ENUM('ACTIVO','MANTENIMIENTO','DESACTIVADO') NOT NULL DEFAULT 'ACTIVO',
  mensaje               VARCHAR(255) NULL,
  programado_hasta      DATETIME NULL,
  permitir_admins       TINYINT(1) NOT NULL DEFAULT 1,
  version               VARCHAR(20) NULL,
  ultima_sincronizacion DATETIME NULL,
  actualizado_por       BIGINT UNSIGNED NULL,
  actualizado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_bot_estado_fila CHECK (id = 1),
  CONSTRAINT fk_bot_estado_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de cambios de estado
CREATE TABLE bot_estado_historial (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  estado_anterior   ENUM('ACTIVO','MANTENIMIENTO','DESACTIVADO') NULL,
  estado_nuevo      ENUM('ACTIVO','MANTENIMIENTO','DESACTIVADO') NOT NULL,
  mensaje           VARCHAR(255) NULL,
  programado_hasta  DATETIME NULL,
  origen            ENUM('ERP','BOT','ADMIN','JOB') NOT NULL DEFAULT 'ERP',
  usuario_id        BIGINT UNSIGNED NULL,
  api_key_id        BIGINT UNSIGNED NULL,
  ip                VARCHAR(45) NULL,
  notificado_canal  TINYINT(1) NOT NULL DEFAULT 0,
  creado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bot_hist_fecha  (creado_en),
  KEY idx_bot_hist_estado (estado_nuevo),
  CONSTRAINT fk_bot_hist_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bot_estado (id, estado, version) VALUES (1, 'ACTIVO', '2.1.0');
```

Para vincular la cuenta de Discord con el practicante, `practicantes` necesita:

```sql
ALTER TABLE practicantes
  ADD COLUMN discord_id       VARCHAR(30) NULL AFTER telefono,
  ADD COLUMN discord_username VARCHAR(50) NULL AFTER discord_id,
  ADD UNIQUE KEY uk_practicantes_discord (discord_id);
```

---

## 7. Registro de comandos en Discord

```
/stats          → Ver tus estadísticas de asistencia
/estadisticas   → (espejo de /stats)
/status         → Ver el estado del bot
```

Registrarlos como **guild commands** en el servidor de MTA, no globales: la propagación es inmediata en lugar de tardar hasta una hora, y evita que el bot exponga comandos en otros servidores.

---

## 8. Puntos a confirmar

1. ¿El "Nivel" se calcula por horas acumuladas o por nota? Asumí horas.
2. ¿El ranking es dentro del área o entre todos los practicantes? Asumí área.
3. ¿En qué canal se publica el aviso de mantenimiento?
4. ¿Los encargados también pueden cambiar el estado del bot, o solo Admin y RR.HH.?
5. ¿Quieres que `/stats` muestre la nota a los practicantes, o solo a los encargados?

---

*Documento preparado para MTA SOFTWARE — MULTISERVICIOS TECNOINDUSTRIAL ACOSTA S.A.C.*
