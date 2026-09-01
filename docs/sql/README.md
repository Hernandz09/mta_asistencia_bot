# MySQL — Fase 1 (ESPEC-ASIS-001)

Schema: `001_schema.sql`  
Estado del bot (ESPEC-ASIS-002): `002_bot_estado.sql`  
Datos (se genera con `npm run db:dump`, no se commitea): `002_migracion_datos.sql`

Hostinger bloquea conexiones remotas por defecto. Para que `npm run db:schema` y `npm run db:migrate` funcionen:

1. hPanel → Databases → **Remote MySQL**
2. Añade la IP de esta máquina (o Any Host `%`)
3. Hostname remoto: `srv1069.hstgr.io` · puerto `3306`

Mientras tanto se puede importar en phpMyAdmin: primero `001_schema.sql`, después `002_migracion_datos.sql`.
