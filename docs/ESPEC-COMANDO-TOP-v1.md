# Bot de Asistencias — Comando `/top`
**Código:** ESPEC-ASIS-004 · **Versión:** 1.0 · **Empresa:** MTA SOFTWARE
**Alcance:** ranking de practicantes ordenado por desempeño de asistencia, comando de Discord y endpoint que lo alimenta.

---

## 1. Qué hace

Muestra la tabla de posiciones de los practicantes con mejor asistencia en un periodo. Es el mismo motor que ya calcula el campo "Ranking" de `/stats`, expuesto como vista completa en lugar de un número suelto — así ambos comandos nunca se contradicen.

---

## 2. Firma del comando

```
/top [periodo] [area] [limite] [criterio]
```

| Parámetro | Tipo | Obligatorio | Valores | Por defecto |
|---|---|---|---|---|
| `periodo` | String (choices) | No | `semana`, `mes`, `total` | `mes` |
| `area` | String (choices) | No | Software, Video, Administración, Marketing, Fotografía, Diseño, **Todas** | `Todas` |
| `limite` | Integer | No | 3 – 25 | `10` |
| `criterio` | String (choices) | No | `asistencia`, `puntualidad`, `horas`, `nota` | `asistencia` |

---

## 3. Permisos y visibilidad

| Rol | Acceso |
|---|---|
| Practicante | ✅ Puede ejecutarlo. Ve el top y su propia posición |
| Encargado | ✅ Acceso completo, puede filtrar por cualquier área |
| RR.HH. / Admin | ✅ Acceso completo |

**Visibilidad:** respuesta **pública** en el canal por defecto. A diferencia de `/stats`, el `/top` es una herramienta de motivación y tiene sentido que se vea. Se agrega la opción `privado: true` por si alguien quiere consultarlo sin publicar.

**Regla de diseño:** el comando **nunca muestra un "peores" ni una tabla completa descendente**. Solo el top N y la posición propia de quien ejecuta. Exponer públicamente quién está último es una forma de sanción informal que no corresponde a un sistema de asistencias, y además genera fricción innecesaria con los practicantes.

---

## 4. Criterio de ordenamiento

### 4.1 Orden principal

Según el parámetro `criterio`:

| Criterio | Campo de orden |
|---|---|
| `asistencia` (por defecto) | `% Asistencia` descendente |
| `puntualidad` | `% Puntualidad` descendente |
| `horas` | Horas acumuladas del periodo descendente |
| `nota` | Nota del periodo descendente |

### 4.2 Desempates

Cuando dos practicantes empatan, se resuelve en cascada:

1. Mayor **% de puntualidad**
2. Menor cantidad de **tardanzas**
3. Mayor cantidad de **horas acumuladas** en el periodo
4. Menor cantidad de **horas por justificar**
5. Fecha de alta más antigua (`practicantes.fecha_inicio`)

Si aún así persiste el empate, comparten posición y la siguiente se salta. Ejemplo: `1, 2, 2, 4`.

---

## 5. Quién entra al ranking

Un practicante es **elegible** si cumple todo lo siguiente:

1. Estado `activo` (los cesados se excluyen salvo en `periodo:total`, donde sí aparecen marcados con 📤).
2. Tiene horario asignado vigente en el periodo.
3. Tiene al menos **`ranking.dias_minimos` días programados** dentro de la ventana efectiva.

### 5.1 Por qué el mínimo de días

Sin este filtro, alguien que entró ayer y marcó su único día encabeza la tabla con 100% por encima de quien lleva tres semanas con 96%. El umbral evita ese ruido.

**Valor propuesto:** el mayor entre **3 días** y el **40% de los días programados del periodo**.

| Periodo | Días programados | Mínimo exigido |
|---|---|---|
| Semana | 5 | 3 |
| Agosto 2026 (desde el 17) | 11 | 5 |
| Septiembre 2026 | 22 | 9 |

Los no elegibles no se ocultan del todo: al pie aparece `⏳ 3 practicantes aún no califican (menos de 5 días evaluados)`.

### 5.2 Ventana efectiva

El cálculo usa exactamente la misma ventana efectiva definida en **ESPEC-ASIS-003, sección 2**: se recorta por `asistencia.fecha_inicio`, por la fecha de alta de cada practicante y por la fecha de hoy. Cada practicante se evalúa contra **sus propios** días programados, no contra un denominador común — quien entró el 10 de septiembre compite en igualdad de condiciones.

---

## 6. Diseño del embed

```
┌──────────────────────────────────────────────────────────┐
│  🏆  Top Asistencia — Agosto 2026                         │
│  Todas las áreas · 14 de 17 practicantes calificados      │
│                                                           │
│  🥇  1. Taylor Aguirre        100.0%  ·  20.0   ▲2        │
│  🥈  2. Wilson Acosta          97.5%  ·  19.1   ▬         │
│  🥉  3. María Ventura          95.2%  ·  18.4   ▼1        │
│      4. Carlos Ríos            92.8%  ·  17.9   ▲3        │
│      5. Ana Salazar            90.1%  ·  17.2   ▬         │
│      6. Luis Paredes           88.6%  ·  16.8   ▼2        │
│      7. Rosa Medina            86.3%  ·  16.1   ▲1        │
│      8. Jorge Quispe           84.0%  ·  15.7   ▬         │
│      9. Diana Flores           81.7%  ·  15.2   ▼1        │
│     10. Pedro Lazo             79.4%  ·  14.6   ▲4        │
│                                                           │
│  📍 Tu posición: #2 de 14  ·  97.5%                       │
│  ⏳ 3 practicantes aún no califican (menos de 5 días)      │
│                                                           │
│  Criterio: % Asistencia · Periodo: 17/08 – 31/08/2026     │
│  Actualizado: 31/08/2026 22:15 (America/Lima)             │
└──────────────────────────────────────────────────────────┘
```

### 6.1 Elementos

| Elemento | Regla |
|---|---|
| Medallas | 🥇 🥈 🥉 solo en las tres primeras posiciones |
| Nombre | Nombre y primer apellido. Se menciona con `<@discord_id>` solo si el practicante habilitó la mención |
| Valor principal | El del criterio elegido, con un decimal |
| Nota | Siempre se muestra junto al valor principal, como referencia |
| Flechas | Movimiento respecto al periodo anterior: ▲ subió, ▼ bajó, ▬ se mantuvo, 🆕 primer periodo |
| Tu posición | Solo si quien ejecuta es practicante y no está ya en la lista visible |
| No calificados | Conteo, nunca nombres |
| Ventana | Se imprime el rango real evaluado, no el nominal del mes |

### 6.2 Color del embed

Dorado `#F1C40F` fijo. Es una tabla de posiciones, no un indicador de estado.

### 6.3 Filtro por área en el título

```
🏆  Top Asistencia — Agosto 2026
    Área: Software · 5 de 6 practicantes calificados
```

### 6.4 Botones

| Botón | Acción |
|---|---|
| 🔁 Cambiar periodo | Menú: semana / mes / total |
| 🏢 Filtrar por área | Menú con las áreas activas |
| 📊 Cambiar criterio | Menú: asistencia / puntualidad / horas / nota |
| 📈 Ver mi detalle | Ejecuta `/stats` del usuario, en efímero |

Los botones expiran a los 5 minutos y solo responden a quien ejecutó el comando.

---

## 7. Casos borde

| Situación | Comportamiento |
|---|---|
| Ningún practicante califica | "Todavía no hay suficientes días registrados para armar el ranking." |
| Menos practicantes que el `limite` | Muestra los que haya, sin rellenar |
| Empate en el primer puesto | Ambos con 🥇 en posición 1, el siguiente es 3 |
| Área sin practicantes activos | "No hay practicantes activos en el área Video." |
| Periodo anterior a `asistencia.fecha_inicio` | "No hay registros de asistencia en ese periodo." |
| Quien ejecuta no es practicante | Se omite la línea "Tu posición" |
| Practicante cesado en `periodo:total` | Aparece con 📤 al lado del nombre |
| Todos con 100% | Se ordena por los desempates de la sección 4.2 |

---

## 8. Endpoint que lo alimenta

```http
GET /api/v1/reportes/ranking
```

| Query param | Tipo | Por defecto |
|---|---|---|
| `periodo` | `semana` \| `mes` \| `total` | `mes` |
| `fecha_referencia` | date | hoy |
| `area_id` | int | todas |
| `limite` | int (3–100) | 10 |
| `criterio` | `asistencia` \| `puntualidad` \| `horas` \| `nota` | `asistencia` |
| `incluir_cesados` | bool | `false` |
| `practicante_id` | int | — (para devolver la posición de uno específico) |

**Respuesta 200**

```json
{
  "data": {
    "periodo": { "tipo": "mes", "nominal_inicio": "2026-08-01", "nominal_fin": "2026-08-31",
                 "efectivo_inicio": "2026-08-17", "efectivo_fin": "2026-08-31" },
    "criterio": "asistencia",
    "area": null,
    "total_practicantes": 17,
    "total_calificados": 14,
    "no_calificados": 3,
    "dias_minimos_exigidos": 5,
    "ranking": [
      { "posicion": 1, "practicante_id": 7, "nombre": "Taylor Aguirre",
        "discord_id": "3821...", "area": "Diseño",
        "dias_programados": 11, "dias_asistidos": 11, "dias_puntuales": 11,
        "tardanzas": 0, "faltas": 0,
        "pct_asistencia": 100.0, "pct_puntualidad": 100.0, "pct_horas": 100.0,
        "horas_acumuladas": 66.0, "nota": 20.0,
        "posicion_anterior": 3, "movimiento": 2 }
    ],
    "posicion_solicitada": { "practicante_id": 3, "posicion": 2, "de": 14 }
  },
  "meta": { "calculado_en": "2026-08-31T22:15:00-05:00", "cache_ttl_segundos": 300 }
}
```

**Errores:** `400` parámetro inválido · `401` sin credencial · `403` sin scope `reportes:read` · `404` área inexistente.

### 8.1 Snapshots (CRUD completo)

Para poder mostrar las flechas de movimiento hace falta guardar la foto del ranking al cierre de cada periodo:

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/reportes/ranking/snapshots` | Lista `?periodo&desde&hasta&area_id` |
| GET | `/reportes/ranking/snapshots/{id}` | Detalle de una foto |
| POST | `/reportes/ranking/snapshots` | Generar manualmente |
| PATCH | `/reportes/ranking/snapshots/{id}` | Corregir metadatos |
| DELETE | `/reportes/ranking/snapshots/{id}` | Anulación lógica |

Un job programado genera el snapshot cada domingo a las 23:59 (semanal) y el último día del mes a las 23:59 (mensual).

---

## 9. Tabla necesaria

```sql
CREATE TABLE ranking_snapshots (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_periodo        ENUM('SEMANA','MES','TOTAL') NOT NULL,
  periodo_inicio      DATE NOT NULL,
  periodo_fin         DATE NOT NULL,
  area_id             BIGINT UNSIGNED NULL,
  criterio            ENUM('ASISTENCIA','PUNTUALIDAD','HORAS','NOTA')
                      NOT NULL DEFAULT 'ASISTENCIA',
  practicante_id      BIGINT UNSIGNED NOT NULL,
  posicion            SMALLINT UNSIGNED NOT NULL,
  dias_programados    SMALLINT UNSIGNED NOT NULL,
  dias_asistidos      SMALLINT UNSIGNED NOT NULL,
  dias_puntuales      SMALLINT UNSIGNED NOT NULL,
  tardanzas           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  faltas              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pct_asistencia      DECIMAL(5,2) NOT NULL,
  pct_puntualidad     DECIMAL(5,2) NOT NULL,
  pct_horas           DECIMAL(5,2) NOT NULL,
  horas_acumuladas    DECIMAL(7,2) NOT NULL DEFAULT 0,
  nota                DECIMAL(4,2) NULL,
  calificado          TINYINT(1) NOT NULL DEFAULT 1,
  generado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ranking_snapshot
    (tipo_periodo, periodo_inicio, criterio, area_id, practicante_id),
  KEY idx_ranking_periodo (tipo_periodo, periodo_inicio, posicion),
  CONSTRAINT fk_ranking_practicante FOREIGN KEY (practicante_id)
    REFERENCES practicantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_ranking_area FOREIGN KEY (area_id)
    REFERENCES areas (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Configuración asociada:

```sql
INSERT INTO configuraciones (clave, valor, tipo, descripcion) VALUES
  ('ranking.dias_minimos',        '3',    'int',    'Días evaluados mínimos para calificar'),
  ('ranking.pct_dias_minimos',    '0.40', 'decimal','Porcentaje del periodo exigido para calificar'),
  ('ranking.limite_default',      '10',   'int',    'Cantidad de posiciones por defecto'),
  ('ranking.mostrar_menciones',   '0',    'bool',   'Si el top menciona con @ a los practicantes'),
  ('ranking.cache_segundos',      '300',  'int',    'TTL del ranking en caché');
```

---

## 10. Consulta de referencia

```sql
SET @inicio  = '2026-08-17';   -- ventana efectiva (ESPEC-ASIS-003 §2)
SET @fin     = CURDATE();
SET @area_id = NULL;
SET @limite  = 10;

SELECT
    p.id,
    CONCAT(p.nombres, ' ', SUBSTRING_INDEX(p.apellidos, ' ', 1)) AS nombre,
    a.nombre                                                     AS area,
    COUNT(*)                                                     AS dias_programados,
    SUM(j.id IS NOT NULL)                                        AS dias_asistidos,
    SUM(j.estado_entrada IN ('PUNTUAL','PUNTUAL_ANTICIPADO'))    AS dias_puntuales,
    SUM(j.estado_entrada = 'TARDANZA')                           AS tardanzas,
    COUNT(*) - SUM(j.id IS NOT NULL)                             AS faltas,
    ROUND(SUM(j.id IS NOT NULL) / COUNT(*) * 100, 2)             AS pct_asistencia,
    ROUND(IFNULL(SUM(j.estado_entrada IN ('PUNTUAL','PUNTUAL_ANTICIPADO'))
                 / NULLIF(SUM(j.id IS NOT NULL), 0), 0) * 100, 2) AS pct_puntualidad,
    ROUND(IFNULL(SUM(j.horas_computadas + j.horas_justificadas), 0), 2) AS horas
FROM practicantes p
JOIN areas a               ON a.id = p.area_id
JOIN calendario_practicante(p.id, @inicio, @fin) cal   -- días programados por practicante
LEFT JOIN jornadas j       ON j.practicante_id = p.id
                          AND j.fecha = cal.fecha
                          AND j.contexto = 'REGULAR'
WHERE p.estado = 'activo'
  AND p.deleted_at IS NULL
  AND (@area_id IS NULL OR p.area_id = @area_id)
GROUP BY p.id
HAVING dias_programados >= GREATEST(
         (SELECT valor FROM configuraciones WHERE clave = 'ranking.dias_minimos'),
         CEIL(MAX(cal.total_periodo) *
              (SELECT valor FROM configuraciones WHERE clave = 'ranking.pct_dias_minimos')))
ORDER BY pct_asistencia DESC,
         pct_puntualidad DESC,
         tardanzas ASC,
         horas DESC,
         p.fecha_inicio ASC
LIMIT @limite;
```

> `calendario_practicante` representa la expansión de días programados de la sección 9 de ESPEC-ASIS-003, resuelta por practicante (CTE recursiva, vista materializada o tabla calendario, según lo que se decida al implementar).

---

## 11. Rendimiento

- **Caché de 5 minutos** por combinación `periodo + area + criterio + limite`. El ranking no necesita ser exacto al segundo.
- El cálculo recorre todas las jornadas del periodo de todos los practicantes; con 17 personas es trivial, pero si crece se recomienda materializar los indicadores diarios en una tabla resumen (`resumen_diario_practicante`) actualizada por el mismo job que cierra las jornadas.
- **Rate limit:** 1 ejecución cada 30 segundos por usuario, para evitar spam del comando en el canal.

---

## 12. Casos de prueba

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | `/top` en agosto 2026 | Ventana 17–31/08, 11 días base, sin faltas fantasma |
| 2 | `/top periodo:semana` un lunes | Solo el día transcurrido, nadie con 0% por días futuros |
| 3 | Practicante de alta ayer | No califica, aparece en el conteo de no calificados |
| 4 | Dos con 100% | Desempata por puntualidad, luego tardanzas |
| 5 | `/top area:Video` sin activos | Mensaje de área vacía |
| 6 | `/top limite:25` con 17 registrados | Muestra 17, sin filas vacías |
| 7 | Practicante ejecuta el comando y está en el puesto 12 | Aparece la línea "Tu posición: #12 de 14" |
| 8 | Sin snapshot del periodo anterior | Todas las flechas muestran 🆕 |
| 9 | `/top criterio:horas` | Ordena por horas, la nota sigue visible |
| 10 | Ranking de `/top` vs. campo Ranking de `/stats` | Coinciden exactamente |

---

## 13. Recomendaciones

1. **Publicar el top semanal automáticamente** los lunes por la mañana en el canal general. Convierte el comando en un hábito sin que nadie tenga que ejecutarlo.
2. **Reconocimiento mensual.** Al cerrar el mes, mensaje destacado con el primer puesto. Cuesta poco y sostiene la puntualidad mejor que una amonestación.
3. **No usar el ranking como insumo disciplinario.** Si se necesita detectar problemas, el reporte de pendientes y el de faltas sin justificar son el canal correcto, en privado con el encargado.
4. **Permitir que un practicante se excluya del ranking público** (`ranking.mostrar_menciones` y una preferencia por practicante). Sigue contando en sus reportes internos, solo no aparece en el canal.
5. **Congelar el snapshot antes de recalcular jornadas.** Si el encargado justifica algo con fecha atrasada, el histórico del ranking no debería reescribirse solo; que la corrección genere un snapshot nuevo.

---

## 14. Puntos a confirmar

1. ¿El top por defecto debe ser público en el canal o efímero como `/stats`?
2. ¿Se menciona a los practicantes con `@` o solo con su nombre en texto?
3. ¿Los practicantes cesados aparecen en `periodo:total` o se excluyen siempre?
4. ¿El mínimo de días para calificar te parece bien en 3 días o 40% del periodo, o prefieres otro umbral?
5. ¿Quieres el top semanal automático los lunes? Si sí, ¿en qué canal?

---

*Documento preparado para MTA SOFTWARE — MULTISERVICIOS TECNOINDUSTRIAL ACOSTA S.A.C.*
