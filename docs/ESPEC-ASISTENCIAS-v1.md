# Sistema de Control de Asistencias — Especificación de Migración
**Código:** ESPEC-ASIS-001 · **Versión:** 1.0 · **Empresa:** MTA SOFTWARE
**Objetivo:** migrar el bot de asistencias actual a una base de datos relacional, exponer su información vía API REST y agregar un motor de reglas de tolerancias, recuperaciones, justificaciones y calificación.

---

## 1. Resumen del alcance

| # | Módulo | Qué resuelve |
|---|--------|--------------|
| 1 | Migración a base de datos | Persistencia real, histórico, integridad |
| 2 | API REST | Consumo de los datos desde otro ERP |
| 3 | Motor de tolerancias | Entrada temprana / puntual / tardanza / fuera de horario |
| 4 | Salidas y cierre de jornada | Tolerancia de salida, "sin salida", horas por justificar |
| 5 | Horarios | Registro de horarios y asignación a practicantes |
| 6 | Recuperaciones | Habilitar días/horas de recuperación con doble marcación |
| 7 | Excepciones por día | Editar entrada o salida de un solo día puntual |
| 8 | Límite de horas | Tope semanal (ej. 30 h) y control de exceso |
| 9 | Justificaciones | El encargado justifica y asigna horas manualmente |
| 10 | Indicadores y nota | % asistencia, % puntualidad y nota de 0 a 20 |
| 11 | Reportes | Diario, semanal, mensual, por practicante y consolidado |

---

## 2. Fases sugeridas de implementación

**Fase 1 — Fundación (bloqueante).** Modelo de datos, migración del histórico del bot, tabla de marcaciones inmutable, zona horaria y auditoría.
**Fase 2 — Motor de reglas.** Tolerancias de entrada y salida, cálculo de jornada y de horas.
**Fase 3 — API REST.** Autenticación, endpoints de lectura para el ERP, endpoints de escritura para el bot.
**Fase 4 — Gestión.** Horarios, asignaciones, excepciones por día, límite de horas.
**Fase 5 — Recuperaciones y justificaciones.**
**Fase 6 — Indicadores, nota y reportes.**

> El bot sigue funcionando en Fase 1 y 2; recién en Fase 3 deja de escribir en su almacenamiento propio y pasa a consumir la API.

---

## 3. Modelo de datos propuesto

### 3.1 Tablas principales

**`practicantes`**
`id`, `codigo`, `nombres`, `apellidos`, `dni`, `correo`, `telefono`, `area` (software, video, admin, marketing, fotografía, diseño), `encargado_id`, `fecha_inicio`, `fecha_fin`, `estado` (activo / cesado / suspendido), `id_externo_bot`.

**`horarios`** — plantilla reutilizable
`id`, `nombre` (ej. "Turno Mañana 8–15"), `limite_horas_semana` (ej. 30), `tolerancia_entrada_min` (5), `adelanto_max_min` (60), `tolerancia_salida_min` (30), `limite_sin_salida_min` (180), `activo`.

**`horario_dias`** — un horario puede variar por día
`id`, `horario_id`, `dia_semana` (1–7), `hora_entrada`, `hora_salida`, `es_laborable`.

**`asignaciones_horario`** — vincula practicante ↔ horario con vigencia
`id`, `practicante_id`, `horario_id`, `vigente_desde`, `vigente_hasta`, `creado_por`.

**`excepciones_dia`** — cambio puntual de un solo día
`id`, `practicante_id`, `fecha`, `hora_entrada_override`, `hora_salida_override`, `motivo`, `creado_por`.

**`recuperaciones`** — bloques habilitados por el encargado
`id`, `practicante_id`, `fecha`, `hora_inicio`, `hora_fin`, `motivo`, `estado` (programada / en_curso / cumplida / no_cumplida / anulada), `habilitada_por`, `horas_objetivo`.

**`marcaciones`** — registro crudo, **append-only, nunca se edita ni se borra**
`id`, `practicante_id`, `tipo` (ENTRADA / SALIDA), `contexto` (REGULAR / RECUPERACION), `recuperacion_id` (nullable), `marcado_en` (timestamp UTC), `origen` (bot / web / admin), `ip`, `dispositivo`, `latitud`, `longitud`, `idempotency_key`.

**`jornadas`** — resultado **calculado** por el motor de reglas (una por practicante/fecha/contexto)
`id`, `practicante_id`, `fecha`, `contexto`, `hora_entrada_programada`, `hora_salida_programada`, `entrada_real`, `salida_real`, `estado_entrada`, `estado_salida`, `estado_jornada`, `horas_computadas`, `horas_por_justificar`, `horas_justificadas`, `minutos_tardanza`, `recalculado_en`.

**`justificaciones`**
`id`, `jornada_id`, `tipo` (tardanza / salida_anticipada / sin_salida / falta / fuera_horario), `motivo`, `horas_otorgadas`, `encargado_id`, `evidencia_url`, `creado_en`.

**`feriados`** — `fecha`, `descripcion`, `aplica_a` (todos / área / practicante).

**`auditoria`** — `entidad`, `entidad_id`, `accion`, `valor_anterior`, `valor_nuevo`, `usuario_id`, `fecha`. Obligatoria para justificaciones, excepciones y recuperaciones.

### 3.2 Regla de oro
La marcación es un **hecho** y la jornada es una **interpretación**. Si mañana cambian las tolerancias, se recalculan las jornadas sin tocar el histórico real. Esto también permite reprocesar cuando el encargado corrige algo.

---

## 4. Reglas de tolerancia (entrada)

Sea **H** = hora de entrada programada. Parámetros configurables por horario.

| Momento de la marcación | Estado | Cómputo de horas |
|---|---|---|
| Antes de **H − 60 min** | `FUERA_DE_HORARIO` | Se computa desde H (el exceso no cuenta salvo justificación) |
| Entre **H − 60 min** y **H** | `PUNTUAL_ANTICIPADO` | Se computa desde H; salida a la hora normal |
| Entre **H** y **H + 5 min** | `PUNTUAL` | Se computa desde H |
| Después de **H + 5 min** | `TARDANZA` | Se computa desde la marcación real |

**Ejemplo (entrada 8:00 am):**
- 6:45 am → fuera de horario
- 7:20 am → puntual anticipado, sale a su hora normal
- 8:03 am → puntual
- 8:06 am → tardanza (6 min)

---

## 5. Reglas de tolerancia (salida y cierre)

Sea **S** = hora de salida programada.

| Momento de la marcación | Estado | Efecto |
|---|---|---|
| Antes de **S** | `SALIDA_ANTICIPADA` | Requiere justificación; horas hasta la marcación real |
| Entre **S** y **S + 30 min** | `PUNTUAL` | Horas completas hasta S |
| Después de **S + 30 min** y antes de **S + 180 min** | `FUERA_DE_HORA_SALIDA` | Horas hasta S (el exceso solo cuenta con excepción de día autorizada) |
| No marca hasta **S + 180 min** | `SIN_SALIDA` | Jornada se cierra automáticamente. Las horas del día pasan a `POR_JUSTIFICAR` |

**Fórmula de horas computadas:**
```
inicio_efectivo = max(entrada_real, H)
fin_efectivo    = min(salida_real, S + tolerancia_salida)
horas           = fin_efectivo − inicio_efectivo − refrigerio
```
Si `estado_salida = SIN_SALIDA` → `horas_computadas = 0` y `horas_por_justificar = horas_programadas del día`.

**Cierre automático:** un job (cron cada 15 min) recorre jornadas abiertas y aplica el cierre por `SIN_SALIDA`, además de marcar `FALTA` a quien no registró entrada en un día laborable.

---

## 6. Recuperaciones

**Flujo:**
1. El encargado crea una recuperación: practicante, fecha, hora inicio, hora fin, motivo y horas objetivo.
2. El sistema habilita una **segunda ventana de marcación** para ese practicante ese día, independiente de su jornada regular.
3. El practicante marca entrada y salida en `contexto = RECUPERACION`. El bot responde con un mensaje diferenciado: *"Entrada de recuperación registrada — recuperando horas"*.
4. Se aplican **las mismas tolerancias** que en la jornada regular (5 min de entrada, 60 min de adelanto, 30 min de salida, 180 min de cierre).
5. La jornada de recuperación se guarda como registro aparte y sus horas se suman al acumulado, marcadas como `RECUPERADO`.

**Ejemplo:** turno regular 8:00 am–3:00 pm ya marcado. Recuperación asignada de 5:00 pm a 8:00 pm.
- Ventana de entrada válida: **4:00 pm – 5:05 pm**
- 4:00 pm–5:00 pm → puntual anticipado, cómputo desde las 5:00 pm
- 5:06 pm → tardanza de recuperación
- Salida válida: **8:00 pm – 8:30 pm**
- Sin marcar hasta las 11:00 pm → `SIN_SALIDA`, horas por justificar

**Restricciones:** una recuperación no puede solaparse con el horario regular del mismo día ni con otra recuperación. El sistema debe validarlo al crearla.

---

## 7. Horarios, asignaciones y límite de horas

- Alta de horarios con hora de entrada/salida **por día de la semana** (no todos los días son iguales).
- Un horario define su propio `limite_horas_semana` (ej. 30 h).
- Asignación de horario a practicante con **vigencia** (`desde` / `hasta`). Al cambiar de horario **no se edita el anterior**: se cierra su vigencia y se crea uno nuevo. Así el histórico se mantiene coherente.
- **Control del tope semanal:** al llegar al 90 % del límite se avisa al encargado; al superarlo, las horas se marcan como `EXCEDENTE` y quedan visibles en el reporte, pero no se bloquea la marcación.
- **Excepción por día:** el encargado puede editar la entrada o la salida **de una sola fecha** (`excepciones_dia`) cuando el practicante se queda más tarde. La excepción tiene prioridad sobre el horario base y queda auditada.

---

## 8. Justificaciones

Aplican sobre una jornada ya cerrada. Solo el encargado (o rol superior) puede crearlas.

**Casos justificables:** tardanza, salida anticipada, sin salida, falta, fuera de horario.

**Campos obligatorios:** tipo, motivo (texto libre), **horas otorgadas** (las define el encargado), encargado responsable, evidencia opcional.

**Efecto:** las `horas_por_justificar` se convierten en `horas_justificadas` hasta el monto otorgado. El estado original de la jornada **no se borra** — se mantiene visible como "Tardanza (justificada)". Esto es clave para que el indicador de puntualidad no se falsee.

---

## 9. Indicadores y nota de 0 a 20

**Indicadores base (por periodo):**
```
% Asistencia   = jornadas_asistidas / jornadas_programadas × 100
% Puntualidad  = entradas_puntuales / jornadas_asistidas × 100
% Horas        = horas_validas / horas_programadas × 100
```

**Fórmula de nota propuesta (pesos configurables):**
```
Nota = ((0.40 × %Asistencia) + (0.30 × %Puntualidad) + (0.30 × %Horas)) / 100 × 20
```
Redondeo a un decimal.

**Alternativa más simple** (si prefieren algo directo):
```
Nota = (%Asistencia / 100 × 20) − (0.25 × tardanzas) − (0.5 × faltas_injustificadas)
```
con piso en 0 y techo en 20.

**Escala sugerida:**

| Nota | Calificación |
|---|---|
| 18 – 20 | Excelente |
| 15 – 17.9 | Bueno |
| 12 – 14.9 | Regular |
| 0 – 11.9 | Deficiente |

Las jornadas justificadas cuentan como asistidas, pero **no** como puntuales. Recomiendo mostrar siempre la nota junto con los tres porcentajes para que sea auditable.

---

## 10. Reportes

| Reporte | Contenido | Filtros |
|---|---|---|
| Diario | Quién marcó, a qué hora, estado, quién no marcó | fecha, área, encargado |
| Semanal | Horas por día, acumulado vs. límite, tardanzas | semana ISO, practicante |
| Mensual | Consolidado de horas, % y nota del mes | mes, área |
| Por practicante | Detalle completo del periodo con justificaciones | rango de fechas |
| Recuperaciones | Programadas vs. cumplidas | rango, estado |
| Pendientes | Horas por justificar sin resolver | encargado |
| Constancia de horas | Documento final con total acumulado (útil para el certificado de prácticas, Ley N.° 28518) | practicante |

Todos exportables a Excel y PDF.

---

## 11. API REST — endpoints propuestos

Base: `/api/v1` · Autenticación: **Bearer JWT** para usuarios, **API Key** para el ERP.

### Autenticación
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/auth/token` | Obtener token |
| POST | `/auth/refresh` | Renovar token |

### Marcaciones (escritura del bot)
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/marcaciones` | Registrar marcación (requiere `Idempotency-Key`) |
| GET | `/marcaciones` | Listar con filtros `?practicante_id&desde&hasta&tipo&contexto` |
| GET | `/practicantes/{id}/estado-actual` | Qué debe marcar ahora y en qué ventana |

### Practicantes
| Método | Endpoint |
|---|---|
| GET / POST | `/practicantes` |
| GET / PATCH | `/practicantes/{id}` |
| GET | `/practicantes/{id}/resumen?desde&hasta` |
| GET | `/practicantes/{id}/nota?periodo=2026-08` |

### Horarios
| Método | Endpoint |
|---|---|
| GET / POST | `/horarios` |
| GET / PATCH / DELETE | `/horarios/{id}` |
| POST | `/horarios/{id}/dias` |
| POST | `/practicantes/{id}/asignaciones` |
| GET | `/practicantes/{id}/horario-vigente?fecha=` |

### Excepciones y recuperaciones
| Método | Endpoint |
|---|---|
| POST | `/excepciones-dia` |
| GET / POST | `/recuperaciones` |
| PATCH | `/recuperaciones/{id}` (anular / reprogramar) |
| GET | `/recuperaciones/pendientes` |

### Jornadas y justificaciones
| Método | Endpoint |
|---|---|
| GET | `/jornadas?practicante_id&desde&hasta&estado` |
| GET | `/jornadas/{id}` |
| POST | `/jornadas/{id}/justificaciones` |
| POST | `/jornadas/{id}/recalcular` |

### Reportes
| Método | Endpoint |
|---|---|
| GET | `/reportes/diario?fecha=` |
| GET | `/reportes/semanal?semana=&anio=` |
| GET | `/reportes/mensual?periodo=` |
| GET | `/reportes/limite-horas?semana=` |
| GET | `/reportes/exportar?tipo=&formato=xlsx\|pdf` |

### Utilidad
| Método | Endpoint |
|---|---|
| GET | `/health` |
| GET | `/config/tolerancias` |
| POST | `/webhooks` | notificar al ERP eventos (`marcacion.creada`, `jornada.cerrada`, `justificacion.creada`) |

**Convenciones:** respuestas JSON con `data` / `meta` / `error`; paginación `?page&per_page`; fechas en ISO-8601 con zona horaria; códigos 200/201/400/401/403/404/409/422/429.

---

## 12. Recomendaciones profesionales

Estas no las pediste, pero en control de asistencias marcan la diferencia entre un sistema que sirve y uno que se cae en auditoría:

1. **Guardar todo en UTC y mostrar en `America/Lima`.** Un solo campo mal guardado y todo el cálculo de tolerancias se rompe.
2. **Idempotencia en la marcación.** Si el practicante toca dos veces el botón o el bot reintenta, no debe generar dos registros. Un `Idempotency-Key` más un bloqueo de 60 segundos lo resuelve.
3. **Antifraude.** Geocerca (radio de X metros desde la oficina), lista blanca de IPs, o código QR rotativo. Sin esto, cualquiera marca desde su casa.
4. **Calendario de feriados.** Sin él, todos los 28 de julio aparecen como falta.
5. **Estados adicionales de jornada:** `LICENCIA`, `VACACIONES`, `NO_LABORABLE`, `FALTA_JUSTIFICADA`. Hoy solo estás contemplando presente/ausente.
6. **Refrigerio / turno partido.** Si hay una hora de almuerzo, defínela en el horario; si no, las horas computadas van a salir infladas.
7. **Nunca editar marcaciones.** Si el encargado corrige algo, se crea una excepción o una justificación, y el original queda. Es lo que te salva ante un reclamo.
8. **Auditoría obligatoria** de quién justificó qué y cuántas horas otorgó. Es el punto más sensible del sistema, porque ahí se pueden regalar horas.
9. **Notificaciones automáticas:** aviso al practicante 15 min antes del cierre de su ventana de salida, y aviso diario al encargado con quién no marcó. Reduce muchísimo los "sin salida".
10. **Panel de alertas del día:** quién no marcó, quién tiene jornada abierta, quién superó el tope semanal, qué recuperaciones vencen hoy.
11. **Semana ISO** para los cortes semanales, y definir desde ya qué pasa con la semana que cruza dos meses.
12. **Redondeo al minuto**, nunca a bloques de 15 o 30. Y define si las horas extra se acumulan o se descartan.
13. **Versionado de la API desde el día uno** (`/v1`). El ERP que la consuma no debería romperse cuando cambies algo.
14. **Protección de datos personales (Ley N.° 29733).** Estás guardando DNI, ubicación y posiblemente fotos. Necesitas consentimiento informado, política de retención y cifrado en reposo.
15. **Pruebas con casos límite** antes de salir a producción: marcación exactamente en el minuto 5, en el minuto 30, cambio de día a medianoche, turnos que cruzan las 00:00, practicante sin horario asignado, recuperación el mismo día que un feriado.
16. **Migración con periodo de doble escritura.** Una o dos semanas donde el bot escribe en el sistema viejo y en el nuevo, comparando resultados antes de apagar el anterior.
17. **Backups diarios** con prueba de restauración. Un backup que nunca se restauró no es un backup.

---

## 13. Decisiones que faltan definir

Para cerrar la especificación necesito que confirmes:

1. ¿En qué está hecho el bot actualmente y sobre qué plataforma corre (WhatsApp, Telegram, Discord, web)? ¿Dónde guarda hoy los datos?
2. ¿Qué motor de base de datos prefieres? (Recomiendo PostgreSQL o MySQL 8.)
3. ¿Hay refrigerio o turno partido?
4. ¿Existen turnos que crucen la medianoche?
5. ¿La tardanza descuenta horas del acumulado o solo afecta el indicador de puntualidad?
6. ¿Quién puede justificar: solo el encargado directo, o también RR.HH. y gerencia?
7. ¿El ERP que consumirá la API solo lee, o también escribe?
8. ¿La nota se calcula por mes, por periodo de prácticas completo, o ambos?
9. ¿El límite de 30 h semanales es duro (bloquea) o blando (solo alerta)?

---

*Documento preparado para MTA SOFTWARE — MULTISERVICIOS TECNOINDUSTRIAL ACOSTA S.A.C.*
