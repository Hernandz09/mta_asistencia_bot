# Bot de Asistencias — Corrección del Cálculo de Periodos e Indicadores
**Código:** ESPEC-ASIS-003 · **Versión:** 1.0 · **Empresa:** MTA SOFTWARE
**Alcance:** ventana efectiva de evaluación, conteo de faltas, días en curso y base de la nota. Corrige el comportamiento observado en `/stats`.

---

## 1. Diagnóstico del error actual

### Caso A — Periodo mensual (Agosto 2026)

La tarjeta muestra **11 puntuales y 10 faltas**, con 52.4% de asistencia.

| Cálculo | Valor |
|---|---|
| Días hábiles de agosto completo (01 – 31) | 21 |
| Días asistidos | 11 |
| 11 / 21 | **52.4%** ← lo que muestra la tarjeta |
| 21 − 11 | **10 faltas** ← lo que muestra la tarjeta |

El bot está tomando el mes calendario completo. Como las asistencias recién se registran desde el **17 de agosto**, los 10 días hábiles anteriores (03 al 14 de agosto) se están contando como faltas.

**Valor correcto:** días hábiles del 17 al 31 de agosto = **11**. Asistió 11 → **100% de asistencia, 0 faltas**.

### Caso B — Periodo semanal (31/08 al 05/09)

La tarjeta muestra **1 puntual y 4 faltas**.

Al 31 de agosto solo ha transcurrido **1 día hábil** de esa semana. Los otros 4 (1, 2, 3 y 4 de septiembre) todavía no ocurren y se están contando como faltas.

**Valor correcto:** 1 de 1 día transcurrido → **100% de asistencia, 0 faltas**.

### Causa raíz

El denominador de los indicadores se está construyendo con el rango nominal del periodo, sin recortarlo por dos límites: la fecha desde la que el sistema registra asistencias y la fecha de hoy.

---

## 2. Regla de ventana efectiva

Todo cálculo de indicadores debe operar sobre una **ventana efectiva**, no sobre el rango nominal del periodo:

```
inicio_efectivo = MAX(
    periodo.fecha_inicio,              -- 01/08/2026 para el mes de agosto
    config.fecha_inicio_asistencias,   -- 17/08/2026 (global del sistema)
    practicante.fecha_inicio           -- fecha de alta del practicante
)

fin_efectivo = MIN(
    periodo.fecha_fin,                 -- 31/08/2026
    CURDATE(),                         -- hoy
    IFNULL(practicante.fecha_fin, CURDATE())  -- si está cesado
)
```

Si `inicio_efectivo > fin_efectivo`, el periodo no tiene días evaluables y la tarjeta responde "Sin registros en este periodo" con todo en cero, sin nota.

### Aplicación a los meses

Con esta regla no hace falta configurar mes por mes. Se define **una sola vez** `fecha_inicio_asistencias = 2026-08-17` y el resto sale solo:

| Periodo | Rango nominal | Ventana efectiva | Días hábiles |
|---|---|---|---|
| Agosto 2026 | 01/08 – 31/08 | **17/08 – 31/08** | 11 |
| Septiembre 2026 | 01/09 – 30/09 | 01/09 – 30/09 | 22 |
| Octubre 2026 en adelante | mes completo | mes completo | según calendario |

Un practicante que entre a mitad de octubre arrastra el mismo comportamiento por su `fecha_inicio` propia, sin tocar configuración.

---

## 3. Qué cuenta como día programado

Un día entra al denominador solo si cumple **todas** estas condiciones:

1. Está dentro de la ventana efectiva (sección 2).
2. Es laborable según el `horario_dias` vigente del practicante para ese día de la semana.
3. No es feriado aplicable (tabla `feriados`).
4. No está cubierto por una licencia o vacaciones aprobada.
5. **No es un día en curso sin resolver** (sección 4).

Si un día no cumple alguna, no suma ni como asistencia ni como falta: simplemente no existe para el cálculo.

---

## 4. Tratamiento del día en curso

El día de hoy no puede contarse como falta mientras el practicante todavía esté a tiempo de marcar. Se introduce el estado `PENDIENTE`:

| Situación al momento de consultar | Estado del día | ¿Entra al denominador? |
|---|---|---|
| Ya marcó entrada | `PUNTUAL` / `TARDANZA` / según reglas | ✅ Sí |
| No marcó y la ventana de entrada sigue abierta (antes de `H + 5 min`) | `PENDIENTE` | ❌ No |
| No marcó y la ventana de entrada ya cerró | `FALTA` | ✅ Sí |
| Día futuro dentro del periodo | `PROGRAMADO` | ❌ No |

Así, a las 7:30 am nadie aparece con una falta que todavía puede evitar, y a las 9:00 am sí aparece.

---

## 5. Fórmulas corregidas

```
dias_programados = días que cumplen la sección 3
dias_asistidos   = dias_programados con marcación de entrada válida
dias_puntuales   = dias_asistidos con estado_entrada IN (PUNTUAL, PUNTUAL_ANTICIPADO)
faltas           = dias_programados − dias_asistidos

% Asistencia  = dias_asistidos / dias_programados × 100
% Puntualidad = dias_puntuales / dias_asistidos × 100      (si dias_asistidos = 0 → 0)
% Horas       = horas_validas / horas_programadas × 100    (tope 100 para la nota)

horas_programadas = suma de las horas de cada día programado de la ventana efectiva
```

Los días justificados cuentan como asistidos, pero **no** como puntuales.

### Verificación con los casos reales

| Indicador | Agosto (actual) | Agosto (corregido) |
|---|---|---|
| Días programados | 21 | **11** |
| Puntuales | 11 | 11 |
| Faltas | 10 | **0** |
| % Asistencia | 52.4% | **100%** |
| % Puntualidad | 100% | 100% |
| Horas | 66 | 66 de 66 → **100%** |
| Nota | 13.3 · Regular | **20.0 · Excelente** |

| Indicador | Semana 31/08–05/09 (actual) | Corregido |
|---|---|---|
| Días programados | 5 | **1** |
| Puntuales | 1 | 1 |
| Faltas | 4 | **0** |
| % Asistencia | 20% | **100%** |

---

## 6. Base de la nota

**La nota se calcula únicamente sobre el periodo mensual**, con los días programados de la ventana efectiva del mes como base 20.

- En `/stats periodo:mes` → se muestra **Nota del mes**.
- En `/stats periodo:semana` → **no se calcula una nota semanal**. Se muestra la nota del mes en curso, etiquetada como referencia: `📝 Nota del mes (referencia): 20.0 / 20`.
- En `/stats periodo:total` → nota acumulada del periodo de prácticas completo.

Motivo: una semana con dos o tres días evaluables produce notas que oscilan sin significado real. La captura del caso B lo ilustra: un solo día generó una nota de 8.8 "Deficiente" cuando la practicante no tenía ninguna falta.

Para agosto, la base son los 11 días del 17 al 31; para septiembre, los 22 días del mes. Si asiste 5 días por semana, esos son los días que entran a la base.

---

## 7. Cambios en el embed

### 7.1 Mostrar la ventana efectiva

El pie del embed debe dejar claro sobre qué se está calculando:

```
Periodo: Agosto 2026 (desde el 17) · 11 de 11 días evaluados
```
```
Periodo: Semana del 31/08 al 05/09 · 1 de 5 días transcurridos
```

Sin esta línea, un 100% de asistencia sobre 1 día se lee igual que un 100% sobre 22 días.

### 7.2 Diferenciar acumulado de periodo

En la captura, "Nivel: 1 (66/100 h)" usa el total histórico y "Acumuladas: 6" usa el periodo. Etiquetas propuestas:

```
🪙 Horas del periodo: 6
🏅 Total acumulado: 66 h
```

### 7.3 Días pendientes

Cuando el periodo tenga días futuros, agregar una línea informativa en lugar de contarlos:

```
⏳ Pendientes: 4 días por transcurrir
```

### 7.4 Inconsistencia detectada

Ambas capturas dicen **"Registrado el 01/09/2026"**, fecha posterior al periodo que están evaluando (agosto). Un practicante no puede tener jornadas anteriores a su fecha de alta. Hay que corregir `practicantes.fecha_inicio` — debería ser 17/08/2026 o anterior — y agregar una validación que impida registrar marcaciones previas a esa fecha.

---

## 8. Configuración necesaria

```sql
INSERT INTO configuraciones (clave, valor, tipo, descripcion) VALUES
  ('asistencia.fecha_inicio',        '2026-08-17', 'date',   'Primera fecha con registro de asistencias. Nada anterior se evalúa'),
  ('asistencia.contar_dia_en_curso', '0',          'bool',   'Si el día de hoy entra al denominador antes de cerrar su ventana'),
  ('nota.periodo_base',              'MES',        'string', 'Periodo sobre el que se calcula la nota oficial'),
  ('nota.peso_asistencia',           '0.40',       'decimal','Peso del % de asistencia'),
  ('nota.peso_puntualidad',          '0.30',       'decimal','Peso del % de puntualidad'),
  ('nota.peso_horas',                '0.30',       'decimal','Peso del % de horas cumplidas');
```

Validación a nivel de base de datos para impedir marcaciones anteriores al alta:

```sql
ALTER TABLE marcaciones
  ADD CONSTRAINT chk_marcacion_no_previa
  CHECK (fecha_local >= '2026-08-17');
```

> Nota: si la fecha de inicio va a cambiar en el futuro, es preferible validarlo en la capa de aplicación leyendo `configuraciones` en lugar de fijarlo con un `CHECK`.

---

## 9. Consulta de referencia

Cálculo de días programados de la ventana efectiva, respetando horario, feriados y día en curso:

```sql
SET @practicante_id = 1;
SET @periodo_inicio = '2026-08-01';
SET @periodo_fin    = '2026-08-31';

SET @inicio_efectivo = GREATEST(
      @periodo_inicio,
      (SELECT valor FROM configuraciones WHERE clave = 'asistencia.fecha_inicio'),
      (SELECT fecha_inicio FROM practicantes WHERE id = @practicante_id));

SET @fin_efectivo = LEAST(@periodo_fin, CURDATE());

WITH RECURSIVE cal AS (
    SELECT @inicio_efectivo AS fecha
    UNION ALL
    SELECT fecha + INTERVAL 1 DAY FROM cal WHERE fecha < @fin_efectivo
)
SELECT
    COUNT(*)                                                   AS dias_programados,
    SUM(j.id IS NOT NULL)                                      AS dias_asistidos,
    SUM(j.estado_entrada IN ('PUNTUAL','PUNTUAL_ANTICIPADO'))  AS dias_puntuales,
    COUNT(*) - SUM(j.id IS NOT NULL)                           AS faltas,
    ROUND(SUM(j.id IS NOT NULL) / COUNT(*) * 100, 1)           AS pct_asistencia
FROM cal
JOIN asignaciones_horario ah
      ON ah.practicante_id = @practicante_id
     AND cal.fecha BETWEEN ah.vigente_desde AND IFNULL(ah.vigente_hasta, '9999-12-31')
JOIN horario_dias hd
      ON hd.horario_id = ah.horario_id
     AND hd.dia_semana = WEEKDAY(cal.fecha) + 1
     AND hd.es_laborable = 1
LEFT JOIN feriados f
      ON f.fecha = cal.fecha AND f.es_laborable = 0
LEFT JOIN jornadas j
      ON j.practicante_id = @practicante_id
     AND j.fecha = cal.fecha
     AND j.contexto = 'REGULAR'
WHERE f.id IS NULL
  AND NOT (cal.fecha = CURDATE() AND j.id IS NULL AND CURTIME() <= ADDTIME(hd.hora_entrada, '00:05:00'));
```

La última condición es la que excluye el día en curso mientras la ventana de entrada siga abierta.

---

## 10. Casos de prueba obligatorios

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | `/stats periodo:mes` en agosto 2026 | 11 días programados, 0 faltas, 100% asistencia |
| 2 | `/stats periodo:semana` el lunes 31/08 | 1 día programado, 0 faltas, 4 pendientes |
| 3 | `/stats periodo:mes` en septiembre 2026 | 22 días programados, mes completo |
| 4 | Practicante dado de alta el 10/09 consulta septiembre | Cuenta solo del 10/09 en adelante |
| 5 | Consulta a las 7:30 am sin marcar | El día no cuenta como falta |
| 6 | Consulta a las 10:00 am sin marcar | El día cuenta como falta |
| 7 | Mes con feriado en día laborable | El feriado no entra al denominador |
| 8 | Practicante cesado el 20/09 consulta septiembre | Cuenta hasta el 20/09 |
| 9 | Consulta de un mes anterior a la fecha de inicio | "Sin registros en este periodo", sin nota |
| 10 | Día justificado | Cuenta como asistido, no como puntual |

---

## 11. Puntos a confirmar

1. ¿La fecha `2026-08-17` es global para todos los practicantes, o cada uno tiene la suya según cuándo empezó?
2. En el periodo semanal, ¿prefieres que no aparezca nota alguna, o que aparezca la del mes como referencia? Asumí lo segundo.
3. ¿El "Nivel" y el "Ranking" se calculan sobre el total histórico o sobre el periodo consultado? En las capturas se comportan distinto entre sí.
4. La fecha de registro que muestra la tarjeta (01/09/2026) es posterior a las jornadas de agosto. ¿La corrijo a 17/08/2026?

---

*Documento preparado para MTA SOFTWARE — MULTISERVICIOS TECNOINDUSTRIAL ACOSTA S.A.C.*
