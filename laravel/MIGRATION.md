# Migración a Laravel — estado y bitácora

> **Este backend corre solo en local por ahora.** Producción sigue en `backend/` (Express), sin tocar. El plan es: terminar de portar/rediseñar todo acá, probarlo a fondo, y recién después decidir cómo subirlo al servidor. Nada de lo que hay en este documento está desplegado.

> ⚠️ **Ubicación canónica del repo cambió — ver sección 16.** Ya no vive en `/mnt/c/Users/logad/proyectos/padel/bonapinta_padel` (Windows, montado en WSL vía 9P, lento). Ahora vive en `/home/logad/bonapinta_padel` (filesystem nativo de WSL2, ext4). Claude Code también se invoca desde ahí (una terminal de WSL, no PowerShell) — ver sección 16 para el por qué y las instrucciones exactas. La copia vieja en `C:\Users\logad\proyectos\padel\bonapinta_padel` se dejó intacta como respaldo, sin borrar, hasta confirmar que este flujo nuevo funciona bien.

Este archivo documenta qué se construyó, por qué, qué se dejó pendiente a propósito, y cómo levantar todo de nuevo si se pierde el contexto de la sesión.

---

## 1. Entorno local

Ubuntu 26.04 (WSL2) no tiene paquetes de PHP 8.3/Postgres 16 (las versiones que corren en producción) — son una release demasiado nueva. Se instaló lo disponible:

| Herramienta | Versión instalada | Nota |
|---|---|---|
| PHP | 8.5.4 | vía `apt`, con extensiones pgsql/mbstring/gd/bcmath/intl/curl/zip |
| Composer | 2.10.3 | instalado manualmente (instalador oficial + verificación de hash) |
| PostgreSQL | 18.6 | rol/DB `bonapinta`; la contraseña vive solo en `laravel/.env` (`DB_PASSWORD`), nunca en un archivo versionado |
| Node.js | 22.22.1 | para correr el frontend con `npm run dev` |
| Laravel | 13.32.0 | `composer create-project laravel/laravel` tomó la última estable (el plan original apuntaba a Laravel 12, pero no tiene sentido bajar de versión) |
| Claude Code | 2.1.275 | instalado dentro de WSL (`sudo npm install -g @anthropic-ai/claude-code`) — ver sección 16 |

**Versión de PHP en producción: 8.4 o superior, no 8.3.** `composer.lock` resuelve Symfony 8 (`>=8.4.1`), así que `composer install` falla en 8.3; `composer.json` ahora declara `^8.4` y la imagen Docker usa `php:8.4-fpm-alpine` (ver sección 22). Postgres 16 en producción es compatible con el esquema (Postgres 18 local es solo el entorno de desarrollo).

### Cómo levantar todo de nuevo (ubicación nativa, desde una terminal de WSL)

```bash
# 0. Abrir una terminal de WSL (no PowerShell) — ver sección 16
wsl -d Ubuntu

# Desde ahí, todo es bash normal, sin el prefijo `wsl -d Ubuntu -- bash -c "..."`
# que hacía falta cuando el repo vivía en /mnt/c:

# 1. Arrancar Postgres (si no está corriendo)
sudo systemctl start postgresql

# 2. Backend Laravel (puerto 8000)
cd ~/bonapinta_padel/laravel
setsid nohup php artisan serve --host=127.0.0.1 --port=8000 > /tmp/laravel-serve.log 2>&1 < /dev/null &
disown

# 3. Frontend Vite (puerto 5173), con proxy a Laravel — ver frontend/vite.config.js
cd ~/bonapinta_padel/frontend
setsid nohup npm run dev -- --host > /tmp/vite-dev.log 2>&1 < /dev/null &
disown
```

**Importante sobre backgrounding**: `comando &` simple puede no sobrevivir según cómo se invoque la shell — usar `setsid nohup ... < /dev/null & disown` siempre para procesos de larga duración.

**Cuidado con `pkill -f <patrón>`**: si el patrón aparece en la línea de comando de la invocación misma, se mata a sí mismo. Preferir matar por PID puntual.

**Sobre la lentitud de ~1-2s por request que hubo antes**: era la combinación de vivir en `/mnt/c` (filesystem 9P) + `opcache.enable_cli=Off`. Con el repo ya en filesystem nativo (sección 16), esa lentitud **desapareció** (health check: ~10ms, antes 1.3-1.7s) — el fix de OPcache de la sección 15 sigue aplicado y sigue siendo correcto, pero ya no es lo que más pesa.

Credenciales de prueba ya creadas en la BD local:
- Las cuentas de prueba de la BD local (`super@test.local`, `admin@test.local`, `uploadtest@bonapinta.local`) **ya no se documentan con contraseña**. Para una BD local nueva: `php artisan bonapinta:create-admin tu@email.com` y, para admins de club/jugadores, crearlos desde la app.
- Super admin del usuario: `loga.dani@gmail.com` — la contraseña **ya no se documenta acá** (estaba en texto plano en un archivo versionado). Si se olvidó, resetearla con el flujo "olvidé mi contraseña" o con `php artisan bonapinta:create-admin loga.dani@gmail.com` (promueve la cuenta sin tocar la clave) + reset.

> La BD local (`bonapinta`, no `bonapinta_test`) acumuló además varias cuentas sueltas de verificación manual (`integ1-4@bonapinta.local`, `tapi2-*@bonapinta.local`, `fixplayer@test.local`, `fixclubadmin@test.local`, etc.) de sesiones anteriores que no se limpiaron. No tienen contraseña documentada — no usarlas como cuentas de prueba curadas, son ruido a limpiar en algún momento (`DELETE FROM "User" WHERE email LIKE '%@test.local' OR email LIKE '%@bonapinta.local'` filtrando las de arriba, con cuidado de no tocar las 4 de esta lista).

---

## 2. Base de datos

5 migraciones base + 2 de la infraestructura del motor de torneos, todas en `database/migrations/`. Recrean las 19 tablas de `prisma/schema.prisma` **exactamente** (mismos nombres de tabla PascalCase, mismas columnas camelCase con comillas dobles — nada de convención snake_case de Laravel para estas, porque son datos legacy de Prisma). Incluyen los 2 índices únicos parciales de `Valoration` y los tipos ENUM nativos de Postgres (`Role`, `ClubRole`).

Tablas **nuevas** (sin equivalente en Prisma, por eso sí usan convención snake_case normal de Laravel):
- `tournament_types` — registro de tipos de torneo (ver sección 5).
- `tournament_round_roles` — historial de roles asignados por fecha (quién cocinó, quién jugó, etc.), para que las restricciones de rotación puedan consultarlo.
- `TournamentInstance.responsableId` (columna nueva en tabla existente) — ver sección 5.

**Advertencia que quedó documentada en el código**: varias tablas (`TournamentInstance`, `TournamentMatch`, etc.) no tienen `CREATE TABLE` en las migraciones ORIGINALES de Prisma — se crearon directo contra la BD. Las migraciones de Laravel las reconstruyen a partir de `schema.prisma`, pero **antes de apuntar esto a la base de producción real, hay que verificar con un `pg_dump --schema-only` contra el servidor** — no confiar en que esta reconstrucción es 100% fiel sin comparar.

---

## 3. Módulos portados 1:1 desde Express (probados end-to-end con requests HTTP reales)

| Módulo | Endpoints | Archivos clave |
|---|---|---|
| Auth | 20 | `AuthService.php`, `AuthController.php`, `TokenService.php` |
| Players + Clubs + Dashboard | 32 | `PlayerService.php`, `ClubService.php`, `CourtService.php`, `DashboardService.php` |
| Uploads | 2 + estático | `UploadController.php` |
| Availability | 3 | `AvailabilityService.php` |

**Total: 57 endpoints portados y verificados con curl real** (no solo código escrito — cada uno se probó contra el servidor corriendo).

### Bugs reales encontrados y corregidos (no solo teóricos — rompían al ejecutar)

1. **JWT `role: null`** — el default de BD (`DEFAULT 'PLAYER'`) no se reflejaba en el modelo Eloquent en memoria tras `User::create()` sin pasar `role` explícitamente. Fix: pasar `role` siempre explícito en los `create()`.
2. **`isActivated` descartado silenciosamente** — no estaba en `$fillable` de `User`, así que `User::create(['isActivated' => true, ...])` lo ignoraba sin error. Fix: ampliar `$fillable`.
3. **API de `intervention/image` v4** — cambió respecto a v3 (no existe `ImageManager::gd()` estático; ahora es `new ImageManager(GdDriver::class)` + `decodePath()` + `encode(new JpegEncoder(...))`).
4. **`arbitroId` apuntaba mal** — mi primer intento buscaba `Player::find($arbitroId)`, pero es un `User.id` (confirmado contra `dashboard.routes.js`). Corregido en `TournamentInstance::arbitro()`.
5. **`Team`/`Player` "teams"/"players"** — mi primer modelo usaba `belongsToMany` (relación aplanada), pero Prisma expone la fila de la tabla intermedia (`TeamPlayer`) directamente como la relación (`Team.players TeamPlayer[]`). El frontend espera `match.team1.players[].player`, no `match.team1.players[]` plano. Corregido a `hasMany(TeamPlayer::class)`.

### Fixes silenciosos aplicados a propósito (aprobados de antemano)

- `POST /api/matches/:id/request-result` (roto en Express — nunca importaba `prisma`/`EmailService`) → implementado de verdad en el diseño (no se llegó a portar `/api/matches` — ver sección 6).
- `GET /api/dashboard/player` filtraba el `User` completo con password hash incluido → resuelto de raíz con `$hidden` en el modelo `User` (blindaje permanente, no solo en este endpoint).
- `GET /api/players/club-members` devolvía a veces `[]` pelado, a veces `{club, players}` → siempre `{club, players}`.

---

## 4. Fixes adicionales encontrados **revisando el frontend** (no relacionados con el port)

Encontrados al analizar Profile.jsx / Clubs.jsx / Dashboard.jsx / Players.jsx a pedido del usuario, y corregidos en la misma sesión:

### Backend (`laravel/`)
- **`PlayerService::getClubMembers()`** unificado con `getClubPlayers()` — ambos ahora filtran por `ClubMembership` (antes uno usaba `ClubMembership` y el otro `Player.clubId`, dos criterios distintos bajo el mismo nombre "socios del club", causando que un jugador creado por el admin no apareciera en el panel "Socios" del Dashboard). `Player.clubId` sigue existiendo, pero ahora es solo la preferencia de "qué club muestro en mi perfil público" — ya no lo usa ningún panel de administración.
- **`AuthService::updateEmail()`** ahora exige `currentPassword` y lo verifica — cambiar el email de login no tenía ninguna confirmación, a diferencia del cambio de contraseña.
- **`PlayerService::search()`** acepta `clubId` opcional — antes un SUPER_ADMIN siempre veía la lista completa de jugadores de toda la plataforma sin poder acotarla a un club.

### Frontend (`frontend/`)
- **`Clubs.jsx` — panel "Tipos de torneo disponibles"** reescrito para leer `GET /api/tournament-types` en vez de una lista hardcodeada de los viejos structure/pairingSystem de Express (que ya no existen en el backend nuevo). Se colapsaron las dos listas (estructura + emparejamiento) en una sola, porque un tipo de torneo ahora incluye su modo de emparejamiento como parte de su config, no como una elección separada del club.
- **`Profile.jsx` — `handleSaveDatos`**: pasó de `Promise.all` (todo o nada, un campo que falla oculta que los demás sí se guardaron) a `Promise.allSettled` con reporte detallado de qué campo falló y cuáles sí se guardaron.
- **`Profile.jsx`**: cambiar el propio email (admin) ahora pide confirmar con la contraseña actual.
- **`Dashboard.jsx`**: texto "Resultados **legacy** pendientes" → "Partidos pendientes" (una nota de implementación se filtraba al copy visible).
- **`Players.jsx`**: filtro de club para SUPER_ADMIN en el panel de jugadores (antes veía todos los jugadores de la plataforma sin poder acotar).
- **Componentes nuevos compartidos** (`frontend/src/components/ui/`):
  - `Switch.jsx` — extraído del toggle que ya existía en `Profile.jsx`, reusado también en `Clubs.jsx` (pistas activas/inactivas, que antes usaba un carácter `●`/`○` inconsistente).
  - `ConfirmModal.jsx` — reemplaza los `confirm()`/`alert()` nativos del navegador (usados en Clubs.jsx para sacar un admin o borrar una pista, y en Players.jsx para eliminar un jugador) por un modal consistente con el resto de la app.
- **Manejo de errores**: se agregó estado de error visible (con botón "Reintentar") en los `load()` de `Clubs.jsx`, `ClubDetail`, `CourtsPanel`, `Dashboard.jsx`'s `ClubMembersPanel` y `Players.jsx`'s `ClubPlayersPanel` — antes todos hacían `catch { /* ignore */ }` y la pantalla se quedaba vacía sin ningún aviso si el backend fallaba.

### Encontrado pero **NO corregido** (fuera de alcance esta sesión, documentado para más adelante)
- **N+1 de valoraciones en el directorio de `Players.jsx`** — hace una request de `getByPlayer` por cada jugador mostrado. Arreglarlo bien requiere un endpoint batch en `/api/valorations`, módulo que todavía no se portó a Laravel (ver sección 6). Bloqueado hasta que exista ese módulo.
- **Panel "Sesión activa" en `Profile.jsx`** es un placeholder (solo repite email/rol) — agregar algo real (dispositivos, cerrar otras sesiones) necesitaría un almacén de sesiones, que no existe porque la auth es JWT sin estado. No se inventó nada falso en la UI.
- **CLAUDE.md dice que `Profile.jsx` tiene 4-5 tabs** (Datos, Contacto, Clave, Seguridad + Disponibilidad para jugador) — el código real tiene 2 (Datos, Seguridad; Contacto se fusionó dentro de Datos). Vale la pena actualizar esa documentación, no se tocó en esta sesión.

---

## 5. Motor de torneos — arquitectura nueva (NO es un port)

Decisión explícita del usuario: el viejo sistema de torneos de Express (12 clases de estrategia hardcodeadas, un tipo = una clase) **no se porta**. Se reemplaza por un motor configurable donde un club admin puede armar la lógica de un torneo combinando piezas, sin código, salvo para tipos genuinamente especiales (CimaPadel) que quedan con implementación propia más adelante.

### Piezas del motor (todas en `app/Services/Tournament/`)

| Pieza | Qué resuelve | Clase |
|---|---|---|
| Recursos | Cupos por fecha (pistas = partidos simultáneos) | — (config, no hay clase propia todavía) |
| Roles | Asignaciones no-jugador por fecha ("cocina", "descansa") + el rol default "jugador" | `RoleAssigner` |
| Restricciones de rotación | Reglas sobre cómo se repiten los roles entre fechas | `RotationConstraints/{MaxRoleCountPerCycle,NoConsecutiveRole}` |
| Generador de partidos | Empareja a quienes juegan esa fecha | `MatchGenerators/{RoundRobinGenerator,EliminationGenerator}` |
| Fórmula de puntos | Puntaje y orden de tabla | config (`scoring`), interpretado en `GenericEngine::calculateStandings()` |
| Bajas/sustitución | Qué pasa si alguien no puede jugar | `AbsenceResolver` (junto con los campos ya existentes `status`/`substituteId`/`absenceReason` en `TournamentParticipant`) |

Todo esto se combina en `GenericEngine`, que implementa el contrato común `TournamentEngineContract` (`generateRound`, `calculateStandings`, `validate`). **CimaPadel usará una clase propia que implemente el mismo contrato** (`TournamentType.engine = 'custom'`), sin pasar por el intérprete genérico — queda pendiente de escribir.

### Registro de tipos (`tournament_types`, tabla nueva)

Reemplaza los strings hardcodeados de Express. `TournamentEngineFactory` resuelve, por tipo, si usar `GenericEngine` (interpretando la config JSON del torneo) o instanciar la clase custom que indique `tournament_types.custom_class`.

Semillas ya cargadas (`database/seeders/TournamentTypeSeeder.php`, correr con `php artisan db:seed`):
- `round_robin_generic` — todos contra todos, sin roles especiales.
- `elimination_generic` — bracket de eliminación directa con byes automáticos.
- `rotation_with_roles_generic` — el caso "6 parejas, 2 cocinan, restricciones de rotación" (equivalente genérico de CimaPadel), con `avoidRepeatsWithinRounds: 3` para no repetir rival dentro del ciclo.

### `TournamentInstance.responsableId` (concepto nuevo, no existía en Express)

Permiso de **gestión** del torneo (generar fechas, aprobar bajas, editar config) — distinto del `arbitroId` existente (que es específicamente "quién registra resultados"). Por defecto el creador, reasignable, puede ser cualquier `User` incluso sin ser admin de club. Ver `TournamentInstance::canManage()`.

### API (`routes/api/tournaments.php`, 15 endpoints)

Ciclo completo probado con curl real: crear torneo eligiendo tipo → inscribir jugadores → emparejar → generar fecha → generar fecha 2 → registrar resultado → ver tabla → verificar 403 si no tiene permiso de gestión.

### Tests (Pest, `tests/Feature/Tournament/`, 6 archivos, 93 assertions)

- `GenericEngineCimaPadelLikeTest.php` — simula el caso de 6 parejas/2 cocinan/no-repetir; verifica cobertura exacta (cada pareja cocina exactamente 1 vez cada 3 fechas) y que nunca cocina 2 fechas seguidas.
- `EliminationGeneratorTest.php` — bracket con y sin bye, avance de ronda por resultado.
- `RepeatAvoidanceAndAbsenceTest.php` — no repetir rival dentro de la ventana configurada; baja sin sustituto excluye a la pareja completa, baja con sustituto no la excluye.

**2 bugs reales encontrados escribiendo estos tests** (no en el papel):
1. El primer algoritmo de "no repetir rival" (greedy simple, primer candidato válido) podía forzar una repetición evitable por mal orden de procesamiento, aunque existiera una combinación perfecta. Se cambió a probar varias combinaciones al azar y quedarse con la que no repite ninguna.
2. Mi primer test de bajas tenía mal la aritmética esperada (3 parejas sueltas dan 1 partido, no 3 — el partido es pareja-contra-pareja).

Para correr los tests: `wsl -d Ubuntu -- bash -c "cd /mnt/c/.../laravel && ./vendor/bin/pest"` (usa la BD `bonapinta_test`, separada de la de desarrollo — ver `phpunit.xml`).

---

## 6. Explícitamente NO construido (a la fecha de esta sección — ver 8-14 para lo que se agregó después)

- **`/api/matches`** (partidos de liga clásica, sistema `Match`/`Team`/`League`) — nunca se pidió portarlo, y **sigue sin portarse**: se decidió activamente lo contrario para valoraciones (sección 11) — `Valoration.matchId` se eliminó en vez de esperar un port futuro.
- **`/api/tournaments`** (presets viejos) — pendiente, y probablemente ya no tenga sentido con el nuevo registro de `tournament_types`.
- **CimaPadel como clase custom** — el motor genérico ya lo puede resolver como caso especial de "rotación con roles", pero el usuario pidió específicamente que CimaPadel tenga su propio código más adelante, no que se fuerce dentro del intérprete genérico. Sigue sin escribirse.

> `/api/valorations` y el frontend de torneos, que estaban en esta lista, **ya se construyeron** — ver secciones 8 y 11.

---

## 7. Próximos pasos sugeridos (actualizado)

1. Escribir la clase custom de CimaPadel.
2. Portar o rediseñar `/api/tournaments` (presets) si todavía tiene sentido con `tournament_types`.
3. Verificar el esquema real de producción (`pg_dump --schema-only`) antes de cualquier plan de subida — **nada de lo de este documento está desplegado**.
4. `CLAUDE.md` describe la app en **producción** (Express, sin tocar) — su sección de Valoraciones (24h, soporte a `Match` clásico) sigue siendo correcta para lo desplegado; no confundir con las reglas nuevas de la sección 11 de este documento, que solo existen en este backend local todavía no desplegado.
5. Limpiar las cuentas de prueba sueltas listadas en la sección 1.
6. Reconciliar versiones (PHP 8.5/Postgres 18 local vs PHP 8.3/Postgres 16 de producción) antes de cualquier despliegue real.

---

## 8. Frontend conectado al motor de torneos nuevo

`frontend/src/pages/TournamentEngineAdmin.jsx` (nuevo, reemplaza `TournamentInstances.jsx` en el routing de `App.jsx` — el archivo viejo sigue en el repo pero ya no está enrutado, sigue apuntando a la API vieja y no debe reusarse) — UI de administración completa contra `tournament-instances`:

- `CreateTournamentModal`, `TournamentListView`, `AddParticipantModal`, `SubstituteModal`, `ParticipantsTab`, `ResultPicker`, `MatchesTab`, `StandingsTab`, `TournamentDetailView`.
- `frontend/src/services/api.js`: `tournamentTypeService` + `tournamentEngineService` (deliberadamente separado de `tournamentInstanceService`, el objeto viejo que todavía usan `Matches.jsx`, `MyPair.jsx`, `Dashboard.jsx`, `TournamentJoin.jsx` y `TournamentView.jsx` para las partes de su API que sí tienen equivalente nuevo — ver el comentario en `api.js` de por qué no se fusionaron).
- `Standings.jsx` y `TournamentView.jsx` repuntados a `tournamentEngineService`; las acciones de autogestión de jugador que no existen en el motor nuevo (pair-request propio, proponer/aceptar/rechazar resultado propio) quedaron **deshabilitadas a propósito** (`canDoPairActions = false` en `TournamentView.jsx`, con comentario explicando por qué) en vez de dejarlas fallar en producción — no hace falta tocarlas porque ningún torneo creado desde `TournamentEngineAdmin.jsx` puede tener `resultMode: 'jugador'` (el formulario de creación no expone ese campo).
- **Gap conocido, no corregido**: `ResultPicker` en `TournamentEngineAdmin.jsx` todavía no tiene forma de marcar un partido como "no jugado" (`played: false`, ver sección 11) desde el navegador — el backend ya lo soporta (`PUT .../matches/:id/result` acepta `played`), falta la UI.

---

## 9. Limpieza de datos de torneos + 3 cuentas de prueba por rol

- Se borraron todos los `TournamentInstance`/`TournamentParticipant`/`TournamentMatch`/`TournamentLog`/`tournament_round_roles`/`InviteCode`/`Availability` de prueba acumulados durante la fase de verificación del motor nuevo, dejando intactos `User`/`Player`/`Club`/`ClubMembership`/`Court`/`tournament_types`/`Season`. `DELETE FROM "TournamentInstance"` solo (cascada a participantes/partidos/logs/roles) + `DELETE` puntual en `InviteCode`/`Availability`.
- Se crearon/confirmaron 3 cuentas de prueba, una por rol (SUPER_ADMIN/ADMIN/PLAYER) — ver lista de credenciales en la sección 1.

---

## 10. Corregido: `GET /tournament-instances/my-matches` devolvía 500

Bug real encontrado por el usuario en consola del navegador (`Matches.jsx`/`Dashboard.jsx`), no teórico. Causa: no había una ruta literal `/my-matches` — `GET /tournament-instances/{id}` (registrada antes) la interceptaba tratando `"my-matches"` como el `{id}`, y Postgres tira `QueryException` (`invalid input syntax for type uuid`) en vez de un 404 limpio.

Fix: `TournamentInstanceController::myMatches()` (nuevo, **no** es un port de `TournamentMatchService.getMyMatches()` de Express — ese manejaba autogestión de jugador y un flujo de árbitro que no existen en el motor nuevo) + `Route::get('/my-matches', ...)` registrada **antes** de `Route::get('/{id}', ...)` en `routes/api/tournaments.php` — el orden de registro importa en Laravel tanto como que el endpoint exista.

De paso: `Matches.jsx` seguía con la ventana de valoración vieja de 24h hardcodeada (`VALORATION_WINDOW_MS`) y sin enterarse del flag `played` nuevo — corregido a 7 días + `match.played !== false` en `canValorate`, para que coincida con `ValorationService` (sección 11).

Verificado con curl real contra el servidor corriendo, con datos de prueba creados y borrados en la misma sesión.

---

## 11. Valoraciones — módulo nuevo (`/api/valorations`)

**No es un port** de `valorations.routes.js` — ese cubría tanto `Match` clásico como `TournamentMatch`, con ventana de 24h desde `createdAt`. Reglas nuevas, decididas explícitamente por el usuario:

- Solo `TournamentMatch` — `Valoration.matchId` se **eliminó** de la tabla (migración `2026_09_18_000001`), `tournamentMatchId` pasó a `NOT NULL` con una `UNIQUE` real en `(tournamentMatchId, fromPlayerId, toPlayerId)`, reemplazando los dos índices únicos parciales que existían para el caso "exactamente una de dos FKs", que ya no aplica.
- Ventana de **7 días** (no 24h), contada desde `result.completedAt` — estampado por `TournamentService::setResult()` en el momento exacto en que se registra el resultado, nunca derivado de `createdAt` del partido (que es cuándo se generó/programó, no cuándo se jugó).
- `result.played` (default `true`) — un walkover/ausencia/lesión/abandono (`played: false`) nunca ofrece valoraciones, aunque el partido tenga resultado y cuente para la tabla. `TournamentMatch::wasPlayed()`/`completedAt()` son los helpers nuevos que exponen esto.
- Se puede valorar a **cualquier otro participante del partido, incluida tu propia pareja** — no solo al rival. Intencional, confirmado con el usuario.
- Unicidad corregida contra condición de carrera: el `INSERT` va envuelto en su propio `DB::transaction()` (crea un `SAVEPOINT` si ya hay una transacción alrededor, como la de Pest) — así, si la constraint `UNIQUE` lo rechaza, solo se revierte ese `INSERT`, no toda la transacción envolvente. Antes de este fix, un doble-submit dejaba la conexión en estado "transacción abortada" para el resto del request/test.

**Servicio**: `app/Services/ValorationService.php` — `pending()`, `create()`, `statsForPlayer()`, `evolution()`, `received()`.
**API**: `routes/api/valorations.php` (`GET pending`, `GET received`, `POST /`, `GET player/:id`, `GET player/:id/evolution`), todas bajo `jwt.auth`.
**Tests**: `tests/Feature/ValorationTest.php`, 7 tests — ventana de 7 días desde `completedAt` (no `createdAt`), `played:false` bloquea todo, valorar a la propia pareja, duplicado rechazado atómicamente, auto-valoración rechazada, no-participante rechazado.

**Sobre "¿deberían los admin poder jugar?"** — recomendación dada (no una decisión unilateral): no crear un rol de jugador separado. `User.role` ya gobierna permisos y `Player` ya gobierna identidad de pádel — son independientes por diseño, y un admin de club que también juega es el caso normal en un club chico. La única brecha real es de navegación (los tabs de jugador están gateados solo por `role`, no por "¿tiene un `Player` asociado?") — señalada, no corregida (el usuario no la pidió).

**Corregido en la sección 24**: `Valorations.jsx` seguía atado a la forma vieja. En realidad los paths ya coincidían con el backend nuevo; lo que rompía la pantalla era `matchService.getMyMatches()` (`/matches/my-matches`, inexistente en Laravel) dentro de un `Promise.all`.

---

## 12. Auth — recuperación de contraseña, verificación de email, cambio de email

Revisión pedida por el usuario de todo el mecanismo de auth por email. Conclusión sobre lo que ya existía:

- **`forgotPassword`/`resetPassword`**: sin bugs — no filtra si el email existe (misma respuesta en ambos casos), token de un solo uso (se limpia al usarse), expira en 1h, hash bcrypt. Sin rate-limiting, pero eso ya estaba señalado como diferido a propósito hasta que esto corra detrás de Nginx (ver comentario en `routes/api/auth.php`).
- **Envío de emails (`ResendMailer`)**: sin bugs — `MAIL_MAILER=log` (default local) escribe a `storage/logs/laravel.log` en vez de pegarle a la API real de Resend, así que nunca se gasta cuota real ni se manda nada real en desarrollo local.

**Lo que sí tenía un hueco real: cambiar el email de login solo pedía la contraseña actual, nunca probaba que el usuario controla la dirección nueva.** Corregido para que use el mismo mecanismo que ya existía para verificar cuentas nuevas (`registerWithInvite` → `sendEmailVerification` → `verifyEmail`):

- Columnas nuevas en `User`: `pendingEmail`, `pendingEmailToken`, `pendingEmailTokenExpiry` (migración `2026_09_18_000002`).
- `AuthService::updateEmail()` ya no cambia `email` — manda un link de confirmación a la dirección **nueva** y guarda el pedido en `pendingEmail`. `AuthService::confirmEmailChange()` (nuevo) es lo que de verdad cambia `email`, solo al clickear ese link — revalida en ese momento que nadie tomó la dirección mientras tanto.
- Endpoint nuevo público (basado en token, como `verify-email`/`reset-password`, no en JWT): `POST /auth/confirm-email-change`.
- Frontend: `Profile.jsx` ya no asume que el email cambió al guardar (lo revierte al valor actual y avisa "revisa tu email"); página nueva `ConfirmEmailChange.jsx` en `/confirm-email-change`.

**Consistencia en las 3 vías de alta** — el usuario pidió explícitamente que el registro también exigiera verificación, "como también al crear cuenta". Antes, 2 de 3 vías ya la exigían (`registerWithInvite`, la activación por invitación de admin); la única inconsistente era el registro simple usado por `TournamentJoin.jsx` para unirse a un torneo (creaba la cuenta activa al instante). Ahora las 3 son iguales:

- `AuthService::register()` reescrito: crea la cuenta con `isActivated: false` + `activationToken` (reusa exactamente el mecanismo de `registerWithInvite`, no uno paralelo) y manda el email de verificación en vez de devolver un token de sesión.
- `joinToken` opcional en el body de `/auth/register` — si viene, el link de verificación lleva `&next=/tournaments/join/:token` para que, al verificar, la persona vuelva exactamente a terminar de inscribirse en el torneo en vez de aparecer en el dashboard sin contexto. `VerifyEmail.jsx` lee `next` y redirige ahí (validado a ser un path propio que empiece con `/`, nunca una URL completa — no es un open redirect).
- `TournamentJoin.jsx`: el tab "Crear cuenta" ya no loguea al instante — muestra "revisa tu email" y la inscripción se completa después de verificar.

**Tests**: `tests/Feature/EmailChangeTest.php` (8) + `tests/Feature/RegistrationRequiresVerificationTest.php` (2). Total del proyecto tras esta sesión: **26 tests, 149 assertions**, todos verdes.

Verificado con curl real end-to-end en los tres flujos (login rechazado antes de verificar, email de login vigente hasta confirmar el cambio, reintentar un token ya usado rechazado), con datos de prueba creados y borrados en la misma sesión.

---

## 13. Cuenta SUPER_ADMIN del usuario

`loga.dani@gmail.com` (la cuenta del propio usuario) no existía en la BD local del motor nuevo. Se creó con `role: SUPER_ADMIN` — ver credenciales en la sección 1.

---

## 14. `.env.example` desactualizado

Encontrado durante una revisión general de credenciales: `.env` (con los valores reales, gitignoreado) siempre estuvo bien — todo pasa por `env()`/`config('bonapinta.*')`, nada hardcodeado en `app/`. El problema era `.env.example` (sí versionado): seguía siendo el template stock de Laravel sin tocar — `sqlite`, `SESSION_DRIVER=database`, sin ninguna de las variables propias del proyecto (`JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`, `EMAIL_FROM`, `BONAPINTA_DEFAULT_SEASON_ID`). Un clone nuevo no tenía ninguna pista de qué variables necesitaba setear.

Corregido: `.env.example` ahora refleja la config real (`pgsql`, `SESSION_DRIVER=file`, etc.) y lista las variables propias del proyecto **con placeholders vacíos**, nunca los valores reales — el valor real de `RESEND_API_KEY`/`JWT_SECRET` solo vive en `.env` (local) o en quien administre el Resend/JWT del proyecto. `phpunit.xml` (sí versionado) mantiene el password de la BD de test en texto plano a propósito — es la contraseña de un Postgres local de desarrollo, no una credencial real, y es la convención estándar de Laravel/PHPUnit para bases de test.

---

## 15. Diagnóstico y fix: cada request tardaba 1-2 segundos, incluso `/up`

El usuario reportó que listar jugadores "tarda unos segundos" — medido con `time curl`, resultó ser **general, no específico de ningún endpoint**: hasta `GET /up` (sin BD, sin lógica) tardaba 1.3-1.7s.

**Diagnóstico** (dos causas, la segunda es la que realmente pesa):

1. Este proyecto vive en `/mnt/c/Users/logad/...` — un disco de Windows montado dentro de WSL2 vía el protocolo **9P** (`stat -f` confirma `Type: v9fs`), no el ext4 nativo de WSL2. Cada llamada a `stat()`/`open()` contra ese punto de montaje es órdenes de magnitud más lenta que en el filesystem nativo — un problema de WSL2 ampliamente documentado, no específico de este proyecto.
2. `php artisan serve` corre bajo el SAPI **CLI**, y por default en esta instalación `opcache.enable_cli` estaba en `Off` — así que OPcache (el cache de bytecode compilado) ni se activaba para el servidor de desarrollo. Y aunque se active, con `opcache.validate_timestamps=1` (el default), OPcache igual hace un `stat()` por archivo en **cada request** para chequear si cambió — sobre ~9500 archivos de `vendor/` más los del framework, sobre un filesystem 9P lento, eso es el cuello de botella real.

**Fix aplicado** (archivo nuevo, a nivel de máquina WSL — **no versionado en git**, hay que recrearlo si se reinstala WSL o se clona en otra máquina):

```bash
echo "opcache.enable_cli=1
opcache.validate_timestamps=1
opcache.revalidate_freq=2" | sudo tee /etc/php/8.5/cli/conf.d/99-opcache-cli.ini
# reiniciar `php artisan serve` para que tome el nuevo ini (se lee una sola vez al arrancar el proceso)
```

`revalidate_freq=2` es el punto medio elegido a propósito: en vez de `validate_timestamps=0` (nunca revalida — más rápido todavía, pero un cambio de código no se refleja hasta reiniciar el servidor manualmente, molesto en pleno desarrollo activo) o `=0` de frecuencia con validar activado (revalida en cada request, sin mejora real), esto revalida como máximo una vez cada 2 segundos por archivo — los cambios de código se reflejan solos a los pocos segundos, sin reinicio manual.

**Medido, no solo teorizado** (mismo endpoint `/up`, mismo request repetido con `curl`, en esta sesión):

| Escenario | Tiempo |
|---|---|
| Antes (opcache.enable_cli=Off) | 1.3-1.7s |
| `enable_cli=1` solo (validate_timestamps=1, revalidate_freq default) | 1.3-2.5s — **sin mejora real**, confirma que el costo era el `stat()`, no la falta de bytecode cacheado |
| `enable_cli=1` + `validate_timestamps=0` | 0.15-0.3s (~10x) |
| `enable_cli=1` + `validate_timestamps=1` + `revalidate_freq=2` (el fix elegido) | 0.14-0.18s en requests seguidos; ~1.3s en el primer request después de tocar un archivo (revalida, como se espera) — misma mejora que el anterior, sin perder la recarga automática de cambios |

Verificado que no rompió nada: `./vendor/bin/pest` sigue en 26/26 (149 assertions) con el nuevo ini activo.

**No corregido en su momento, señalado — y luego sí corregido, ver sección 16**: la causa raíz #1 (proyecto sobre `/mnt/c` vía 9P) seguía ahí — este fix la escondía para el caso común (requests repetidos sin tocar código), pero cualquier operación de filesystem pesada (un `composer install`, un `npm install`, un `git status` en un repo grande) seguía sintiéndose lenta por la misma razón.

---

## 16. El repo se movió al filesystem nativo de WSL2 (`/home/logad/bonapinta_padel`)

A pedido explícito del usuario, tras evaluar la sección 15 con benchmarks reales (no solo la mitigación de OPcache). Comparación medida, copiando `laravel/` completo (con `vendor/`) a `~/` y corriendo exactamente las mismas operaciones en los dos lugares:

| Operación | Nativo (`~/`) | `/mnt/c` (9P) | Diferencia |
|---|---|---|---|
| `composer dump-autoload` | 1.3s | 39.4s | ~30x |
| Suite Pest completa (26 tests) | 2.9s | 18.2s | ~6x |
| `find vendor -name "*.php"` (9579 archivos) | 0.03s | 3.1s | ~100x |

El fix de OPcache (sección 15) ayuda a requests HTTP repetidos, pero no a comandos de una sola pasada (`composer`, `pest`, `git` en árboles grandes) — ahí el costo de `/mnt/c` queda intacto. De ahí la decisión de mover el repo entero, no solo mitigar.

### Por qué se movió el repo **completo**, no solo `laravel/`

`backend/`, `frontend/`, `laravel/` y `CLAUDE.md` son un único repo git (`bonapinta_padel/`), con un único `.git`. No tiene sentido tener medio repo en Windows y medio en WSL — un `git status`/`git add -A` desde la raíz necesita que todo el árbol de trabajo esté en un solo lugar.

### Qué se movió y cómo

- `rsync -a` de `/mnt/c/Users/logad/proyectos/padel/bonapinta_padel/` → `/home/logad/bonapinta_padel/`, **excluyendo** los directorios grandes y regenerables: `laravel/vendor`, `frontend/node_modules`, `backend/node_modules`, `frontend/dist`, `laravel/storage/{logs,framework/cache,framework/sessions,framework/views,framework/testing}`, `laravel/bootstrap/cache`, `laravel/.phpunit.cache`, `*.log`. El repo real (código + `.git`, sin esos directorios) pesa 5.8M — el rsync tardó ~1.3s.
- `composer install` + `npm install` corridos **de nuevo, nativos**, dentro de `~/bonapinta_padel` — no se copió `vendor/`/`node_modules/` desde `/mnt/c` porque leerlos de ahí también es lento; regenerarlos nativamente es más rápido que copiarlos.
- `bootstrap/cache/` y las subcarpetas de `storage/framework/` se recrearon vacías con permisos 775 antes de `composer install` (Laravel las necesita presentes y writables; el `rsync --exclude` de un directorio no crea ni el directorio vacío).
- `.env` (con los valores reales) sí viajó con el rsync — no está en la lista de exclusión, y no hay paths absolutos hardcodeados adentro que dependieran de la ubicación vieja.
- Servidores viejos (`php artisan serve`, `vite`) parados y reiniciados apuntando a la ubicación nueva.
- **La copia vieja en `C:\Users\logad\proyectos\padel\bonapinta_padel` se dejó intacta, sin borrar** — sirve de respaldo hasta confirmar que el flujo nuevo funciona bien en la práctica. Borrarla es una decisión aparte, manual, del usuario.

### Verificado después del move (no solo copiado, probado)

- `./vendor/bin/pest` desde la ubicación nueva: **26/26, 149 assertions, 3.51s** (antes 16-18s en `/mnt/c`; cada test individual bajó de ~0.2s a ~0.02-0.03s).
- Health check repetido (`GET /up`): **~10ms** (antes 1.3-1.7s incluso con el fix de OPcache de la sección 15 — la diferencia real la daba el filesystem, no OPcache).
- `npm run build`: **394ms** (antes ~2.4s).
- Los dos servidores (`php artisan serve` en :8000, `vite` en :5173) confirmados corriendo desde `/home/logad/bonapinta_padel`, no desde `/mnt/c`.

### El otro cambio: Claude Code se invoca desde WSL, no desde PowerShell

Mover solo los archivos habría sido una mejora parcial — el acceso cruzado Windows→WSL (necesario si Claude Code sigue corriendo del lado Windows y edita vía `\\wsl$\...`) es más rápido que la dirección WSL→Windows que había antes, pero sigue cruzando la frontera de la VM en cada edición. La solución completa era correr Claude Code **desde dentro de WSL**, para que sus herramientas de archivo operen nativo sobre ext4 sin cruzar nada.

- Se instaló el CLI dentro de WSL: `sudo npm install -g @anthropic-ai/claude-code` (Node ya estaba disponible ahí, v22.22.1). No estaba instalado antes de esta sesión.
- De acá en adelante, abrir una terminal de WSL (`wsl -d Ubuntu` desde PowerShell, o Windows Terminal con el perfil de Ubuntu) y correr `claude` desde `~/bonapinta_padel` — no desde una terminal de PowerShell/cmd apuntando a `C:\Users\...`.
- Efecto colateral bueno: desaparece toda la capa `wsl -d Ubuntu -- bash -c "..."` que se venía usando para cada comando — con eso desaparece también el footgun de escapado de comillas anidadas (PowerShell → `wsl.exe` → `bash -c` → contenido con `$`/comillas) documentado repetidas veces en esta bitácora.

### Contexto / memoria de sesión — lo que NO viaja solo

La memoria persistente de Claude Code (los archivos en `.claude/projects/<path-codificado>/memory/`) está indexada por la ruta de trabajo. `CLAUDE.md` y este mismo `MIGRATION.md` **sí viajan** con el repo (son archivos normales del repo, se acaban de copiar) y siguen siendo la fuente de verdad — es la razón por la que se mantienen tan exhaustivos. Pero si Claude Code arranca por primera vez desde `~/bonapinta_padel` vía la instalación de WSL recién hecha, es una instalación nueva — no va a tener automáticamente el historial de memoria acumulado del lado Windows. Si en una sesión futura hace falta algo de esa memoria vieja y no aparece, decírselo a Claude explícitamente (o pedirle que lea este documento, que es justamente para eso).

### Qué falta (no bloqueante, pendiente)

- Confirmar con un par de sesiones reales de trabajo que el flujo desde WSL funciona bien de punta a punta (incluida la autenticación de Claude Code dentro de WSL, que no se completó en esta sesión — requiere login interactivo, no se puede automatizar).
- Una vez confirmado, borrar `C:\Users\logad\proyectos\padel\bonapinta_padel` (la copia vieja) — manual, no automático.
- Si alguna vez se necesita editar el repo desde una herramienta nativa de Windows (Explorer, un editor que no sea VS Code con la extensión Remote-WSL), acceder vía `\\wsl$\Ubuntu\home\logad\bonapinta_padel` — más rápido que la dirección inversa que había antes, pero sigue siendo cruce de frontera; para trabajo pesado, preferir siempre hacerlo desde dentro de WSL.

---

## 17. Notificaciones conectadas a eventos + suspender torneo/partido + mensajería completa

### Triggers de notificación nuevos (`TournamentService`)
- `addParticipant()` — notifica al jugador inscripto (`tournament_enrolled`).
- `setResult()` — notifica a todos los participantes del partido (`match_result_set`); ahora también rechaza registrar resultado en un partido suspendido.

### Suspender/reanudar (concepto nuevo, no existía)
- `TournamentInstance.status` gana el valor `suspended` (columna string sin enum estricto en Postgres, libre de agregar). Solo se puede suspender un torneo `active`; reanudar solo uno `suspended`, siempre vuelve a `active`.
- `TournamentMatch.status` gana `suspended` también (el ciclo normal es `pending` → `completed`; ahora `pending` ⇄ `suspended`). No se puede suspender un partido `completed`; reanudar siempre vuelve a `pending`.
- Ambos notifican a los participantes afectados (`tournament_suspended`/`tournament_resumed`/`match_suspended`/`match_resumed`).
- Endpoints: `PUT /tournament-instances/{id}/suspend|resume`, `PUT /tournament-instances/{id}/matches/{matchId}/suspend|resume`.
- Frontend: badge "Suspendido" + botón Suspender/Reanudar en `TournamentEngineAdmin.jsx` (header del torneo y por partido en la pestaña Partidos).
- Tests: `tests/Feature/Tournament/NotificationTriggersAndSuspendTest.php` (8).

### Mensajería (nuevo, no existía nada de esto)
Tablas nuevas: `Conversation` (type `user`|`club`), `Message`, `Block`. Diseño clave:
- **Conversación 'user'**: DM entre dos jugadores, canonicalizada (userAId/userBId ordenados por comparación de string) para que A→B y B→A resuelvan a la misma fila.
- **Conversación 'club'**: entre un jugador (`userAId`) y un club (`clubId`) — **bandeja compartida**: cualquier admin de ese club ve y responde la misma conversación, no hay un admin "dueño". Un admin necesita indicar `targetPlayerUserId` al iniciar/continuar (no puede ser ambiguo sobre con qué jugador habla); un jugador nunca lo indica (siempre es él mismo).
- **Bloqueo**: `blockerUserId` XOR `blockerClubId` (un admin puede bloquear "como el club", aplica a todos sus admins, no solo a quien lo clickeó) × `targetUserId` XOR `targetClubId`. El chequeo de envío es bidireccional — si cualquiera de las dos partes bloqueó a la otra, nadie puede escribir hasta desbloquear.
- `MessagingService`: `startOrGetUserConversation`, `startOrGetClubConversation`, `listConversations`, `getMessages` (marca leído automáticamente), `sendMessage`, `block`/`unblock`/`listBlocked`, `unreadCounts` (separado `{user, club}`).
- API: `routes/api/messaging.php`, 9 endpoints bajo `/api/messages`.
- **Bug real encontrado y corregido durante la verificación con curl** (no solo en Pest): `block()`/`unblock()` no validaban `targetId` vacío antes de consultar — un `targetId` vacío llegaba crudo hasta una query SQL y Postgres tiraba `invalid input syntax for type uuid` (500 feo) en vez de un 400 limpio. Se agregó validación de presencia + existencia del target antes de tocar la base.
- Frontend: `Messages.jsx` (tabs Jugadores/Clubs, lista de conversaciones + hilo, buscador para iniciar conversación nueva, botón bloquear/desbloquear), `MessageBell.jsx` (ícono con punto de no-leído, al lado del de notificaciones), hook `useUnreadMessages`.
- Tests: `tests/Feature/MessagingTest.php` (12).

**Simplificaciones deliberadas, no builds**:
- Un admin solo puede iniciar una conversación de club si conoce el `targetPlayerUserId` — no hay una UI todavía para que un admin le escriba proactivamente a un jugador desde cero eligiendo el club (solo puede seguir una conversación que ya existe, o iniciar una si ya sabe con qué jugador). El "+" de la pestaña Clubs en `Messages.jsx` solo está habilitado para el lado jugador.
- El estado de bloqueo no se pre-consulta al abrir una conversación (evita una request extra por conversación abierta) — el botón bloquear/desbloquear es optimista y el error real aparece recién si se intenta enviar un mensaje bloqueado.
- Layout responsive de `Messages.jsx` es de un solo panel a la vez (lista ⇄ hilo), igual en mobile y desktop — no hay vista de dos columnas lado a lado en pantallas grandes.

Total del proyecto tras esta sesión: **55 tests, 219 assertions**, todos verdes.

---

## 18. Bug real de bracket infinito + inicio explícito de torneo + log de eventos

### Bug encontrado contra datos reales (torneo "enano al hombro")
Investigando por qué ese torneo tenía partidos sin sentido y seguía generando fechas sin parar, se encontraron dos mecanismos distintos en `EliminationGenerator`/`GenericEngine`, ambos reales (no teóricos — confirmados vía `psql` directo contra las filas corruptas):
1. **Ganador perdido al avanzar de ronda**: generar la ronda siguiente mientras la ronda anterior todavía tenía un partido `pending` descartaba en silencio al futuro ganador de ese partido — nunca volvía a aparecer en el bracket. `GenericEngine::generateRound()` ahora rechaza generar (`ApiException` 400: "Hay partidos sin resultado en la fecha anterior…") si la ronda anterior no está 100% `completed`.
2. **Sin condición de parada al llegar al campeón**: cuando el bracket queda con un solo ganador, `EliminationGenerator::advance()` seguía devolviendo un bye sin sentido para siempre — eso generó las 6 rondas duplicadas idénticas del torneo real. Ahora `advance()` devuelve `[]` cuando `count($winners) <= 1`, y `GenericEngine` marca el torneo `completed` y lanza "El torneo ya tiene campeón — no hay más fechas para generar."
- Tests nuevos en `tests/Feature/Tournament/EliminationGeneratorTest.php` (2, cubren exactamente estos dos casos) sin tocar los 2 tests existentes.
- **Reparación de datos reales**: el torneo "enano al hombro" (`1e9ba915-caee-4688-b02e-d18f48878177`) tenía 13 partidos corruptos — se borraron todos (`TournamentMatch` + `tournament_round_roles` de ese torneo) preservando participantes y parejas, dejándolo listo para regenerar desde cero con el motor ya corregido. Decisión tomada con el usuario (opción elegida: reseteo completo, no reparación manual del bracket).

### `TournamentInstance.status` — inicio explícito, ya no implícito
Antes, un torneo pasaba de `draft` a `active` solo con generar la primera fecha, sin ningún checkpoint de "¿terminé de armar el torneo?". Ahora:
- `TournamentService::startTournament(tournament, actingUser?)` — nuevo, requiere `status === 'draft'`, ≥2 participantes y (si `fixed_pairs`) todos emparejados (`assertFullyPaired()`, compartido con `generateRound()`); pasa a `active` y logea `tournament_started`.
- `generateRound()` ya no activa nada — rechaza (`ApiException` 400) si el torneo está en `draft` ("Iniciá el torneo antes de generar partidos."), `suspended` o `completed`.
- Endpoint: `PUT /tournament-instances/{id}/start` → `TournamentInstanceController::start()`.
- 2 tests existentes en `PairingModeAndAutoPairTest.php` se reescribieron para pasar primero por `startTournament()`.

### `TournamentLog` conectado (existía la tabla y el endpoint `logs()`, nada escribía ahí)
`TournamentService` ahora logea 13 acciones mutantes: `tournament_created`, `tournament_updated` (solo si algún campo rastreado cambió de verdad), `tournament_started`, `tournament_suspended`/`resumed`, `participant_added`/`removed`, `paired`/`unpaired`/`auto_paired`, `substitute_set`/`reverted`, `round_generated`, `result_set`, `match_suspended`/`resumed`. Cada entrada guarda `userId` + `playerName` (resuelto del `Player` del actor) + `detail` en español legible.
- Todos los controladores (`TournamentInstanceController`, `TournamentMatchController`) ahora pasan `$request->user()` a estos métodos — antes del wiring, nada se logueaba vía HTTP aunque el código ya existiera a nivel de servicio.
- Tests nuevos: `tests/Feature/Tournament/StartTournamentAndLoggingTest.php` (6).

### Frontend (`TournamentEngineAdmin.jsx`)
- **Botón "Iniciar torneo"** en el header, visible solo si `status === 'draft'` y `canManage`.
- **Pestaña Parejas** (nueva, solo si `pairingSystem === 'fixed_pairs'`) — se sacó toda la lógica de emparejar/desemparejar/auto-emparejar de la pestaña Jugadores a esta pestaña dedicada; controles editables solo mientras `status === 'draft'` (una vez iniciado, solo lectura con aviso "Las parejas quedaron fijas al iniciar el torneo.").
- **Pestaña Eventos** (nueva) — lista de `TournamentLog` vía `getLogs()`, con etiquetas en español por `action` (`LOG_ACTION_LABELS`).
- `STATUS_STYLE.completed` agregado (faltaba, ahora que `GenericEngine` puede marcar un torneo `completed` automáticamente).
- Pestaña Partidos: el botón "Generar próxima fecha" ahora respeta el estado — mensaje en vez de botón si `draft`/`suspended`/`completed`.
- `api.js`: nuevo `tournamentEngineService.start(id)`.

Total del proyecto tras esta sesión: **69 tests, 265 assertions**, todos verdes. Verificado además end-to-end con curl contra el servidor real (`php artisan serve`): crear torneo → bloqueo de generar/iniciar antes de tiempo → agregar participantes → iniciar → generar fecha → ver el log completo con nombre del actor.

---

## 19. Un solo tipo de torneo + nombres apellido+inicial + resultado real (sets/abandono)

### Catálogo reducido a un solo tipo
A pedido explícito del usuario, `tournament_types` quedó con un solo registro: `round_robin_generic` (elegido por el usuario entre las 3 opciones existentes — round robin, eliminación directa, rotación con roles). `TournamentTypeSeeder.php` ya no siembra `elimination_generic` ni `rotation_with_roles_generic`; se borraron esas 2 filas de la BD local. Las piezas subyacentes (`EliminationGenerator`, la rotación de roles en el round-robin) **no se tocaron** — siguen siendo piezas válidas del motor configurable, solo dejaron de ofrecerse como preset en el catálogo. Se borraron además **todos los torneos existentes** en la BD local (cascada a participantes/partidos/logs), a pedido explícito.
- Frontend: `CreateTournamentModal` auto-selecciona el único tipo disponible y oculta el selector si `types.length === 1`.

### Nombres "Apellido + Inicial" en la vista de partidos
`teamNames()` en `MatchesTab` (antes solo mostraba el primer nombre) ahora usa `buildPlayerLabels()` — genera `"Cortizo D."` por jugador; si dos jugadores comparten apellido + inicial, expande el prefijo del nombre dentro de ese grupo de colisión (`"Cortizo Da."` vs `"Cortizo Di."`) hasta que sea único, con un sufijo numérico como último recurso para nombres genuinamente idénticos. Es una función pura a nivel de módulo en `TournamentEngineAdmin.jsx`, sin cambios de backend (usa `firstName`/`lastName`, ya separados desde antes en esta sesión).

### Resultado real: sets jugados o abandono, ya no "gana/empata/pierde"
`TournamentService::setResult()` reescrito por completo — `outcome` ya no se recibe del cliente, se **deriva** server-side de uno de dos payloads mutuamente excluyentes:
- `{ sets: [{t1, t2}, ...] }` — games por set (vocabulario `t1`/`t2` tomado del Express viejo para no reinventar la convención que el usuario ya conoce). Valida: cada set necesita un ganador (no puede empatar en games), el partido necesita alcanzar el "mejor de N" configurado (`ceil(bestOf/2)` sets) o rechaza con "Partido incompleto — falta el set decisivo…", y un empate en cantidad de sets ganados (dato inconsistente) también se rechaza.
- `{ retired: { team: 'team1'|'team2', reason } }` — abandono por cualquier motivo (lesión, no se presentó, etc.); el equipo que NO abandonó gana automáticamente; `reason` es obligatorio; marca `played: false` (mismo flag que ya usaba `ValorationService` para excluir walkovers de las valoraciones — la semántica ya existía, ahora tiene una vía real para setearse).
- **`bestOf`** (mejor de N sets) vive en `TournamentInstance.config.bestOf`, default `3`. Configurable al crear (`create()` acepta `data.bestOf`) y al editar (`update()` acepta `data.bestOf`, mergea sobre el `config` existente sin pisar el resto).
- Endpoint sin cambios (`PUT /tournament-instances/{id}/matches/{matchId}/result`), payload sí — `TournamentMatchController::setResult()` ahora pasa `sets`/`retired` en vez de `outcome`/`sets`/`played`.
- Tests nuevos: `tests/Feature/Tournament/SetResultScoringTest.php` (8) — sweep 2-0, split-sets necesita el set decisivo, set empatado rechazado, set incompleto rechazado, abandono exitoso, abandono sin motivo rechazado, payload vacío rechazado, `bestOf=5` necesita 3 sets en vez de 2. 2 tests existentes (`NotificationTriggersAndSuspendTest.php`) migrados del payload viejo al nuevo.

### Frontend (`TournamentEngineAdmin.jsx`)
- **`ScoreEntry`** (nuevo, reemplaza `ResultPicker`) — filas de sets con inputs `t1`/`t2`, botón "+ Set", tally en vivo "Parcial: X–Y", toggle "Abandono / no se jugó" que cambia a selector de equipo + motivo obligatorio. Mutuamente excluyente con la carga de sets.
- Partido completado ahora muestra el score real (`"6-4, 6-2"`) o `"Abandono — {motivo}"` en vez de solo "Completado"/"Empate".
- **"MEJOR DE" (1/3/5)** — nuevo selector en `CreateTournamentModal` y `EditTournamentModal`, lee/escribe `config.bestOf`.

Total del proyecto tras esta sesión: **77 tests, 287 assertions**, todos verdes. Verificado end-to-end con curl: catálogo con 1 solo tipo, `bestOf` default 3 en la respuesta de creación, 1 set solo rechazado ("Partido incompleto"), 2-0 completa el partido, log `result_set` sin "(no jugado)" para un partido realmente jugado.

---

## 20. Paridad funcional con Express (alcance acordado con el usuario)

Objetivo pedido: que este backend quede **listo para reemplazar a Express**. Alcance acordado: invitaciones + cupo + archivar/reiniciar/pistas, autogestión del jugador, endurecimiento y despliegue Docker. **CimaPadel queda fuera** (decisión del usuario: clase propia más adelante).

Se auditó qué endpoints llama el frontend (`services/api.js`) contra las rutas de Laravel. Lo que faltaba y ya existe, **con los mismos paths y formas de respuesta que Express** (el frontend viejo funciona sin cambios):

| Funcionalidad | Endpoints | Código |
|---|---|---|
| Inscripción por enlace | `GET /tournament-instances/join/:token` (público, throttle 30/min), `POST …/join/:token`, `POST/PUT /:id/invite` | `TournamentInvitationService` |
| Cupo máximo | `PUT /:id/max-participants` (elegir a quién quitar; borra partidos y vuelve a borrador) | `TournamentService::updateMaxParticipants` |
| Archivar / reiniciar | `PUT /:id/archive` (archived ⇄ completed), `POST /:id/reset` (`keepPlayers`) | `toggleArchive`, `reset` |
| Borrado con confirmación | `DELETE /:id` → 409 `{requiresConfirmation, playedCount, totalMatches}` si hay partidos jugados; reenviar `{confirmed:true}` | `TournamentService::delete` |
| Pistas por torneo | `GET/PUT /:id/courts` (valida que pertenezcan al club del torneo) | `CourtService` |
| Modo de resultados | `PUT /:id/result-mode` (`creador`/`jugador`/`arbitro`, limpia propuestas pendientes) | `updateResultMode` |
| Árbitro | en modo `arbitro`, el `arbitroId` puede registrar resultados | `canRegisterResult` |
| Solicitud de pareja | `POST /:id/pair-request`, `PUT …/accept`, `PUT …/reject`, `DELETE …` | `PairRequestService` |
| Resultado por jugadores | `PUT /:id/matches/:mid/propose`, `…/accept`, `…/reject`; auto-confirmación a las 24h | `PlayerResultService`, comando `tournaments:auto-confirm` (cada 10 min) |

`ResultEvaluator` (nuevo, puro) concentra la validación de sets/abandono y lo usan **tanto** el resultado del admin **como** el de los jugadores.

### Diferencias deliberadas respecto a Express (mejoras, no regresiones)
- **Inscripción por enlace solo en `draft`** (Express permitía también `active`): al iniciar, las parejas quedan fijas; alguien que entra tarde en `fixed_pairs` quedaría sin pareja y bloquearía toda ronda futura. El cupo se comprueba bajo `lockForUpdate` (dos personas no pueden tomar el último lugar a la vez).
- **Una solicitud de pareja pendiente NO cuenta como pareja**: el solicitante conserva `partnerId` (= `Player.id` del pedido) con `status='pair_requested'`, y `PartnerGrouper` lo habría fabricado como pareja. `assertFullyPaired` ahora lo trata como sin pareja; emparejar/auto-emparejar/quitar jugador limpian las solicitudes colgadas.
- **Un resultado propuesto se valida al proponerlo** (Express lo guardaba tal cual y fallaba al confirmar), y **solo el equipo rival puede confirmar/rechazar** (Express dejaba confirmar a la propia pareja del que propuso).
- **`participantId` del cliente no se confía**: se resuelve desde el usuario autenticado; si no coincide → 403.
- Un resultado directo (admin/árbitro) **pisa** cualquier propuesta pendiente.
- `update()` genérico ya no cambia `resultMode` (tiene su endpoint que limpia propuestas) y rechaza un `maxParticipants` menor a los inscritos.
- Notificaciones in-app nuevas: `pair_requested/accepted/rejected`, `result_proposed/accepted/rejected/auto_confirmed`, `tournament_joined`. Y ~14 acciones nuevas en `TournamentLog`.

### Bugs reales encontrados por los tests (no teóricos)
1. `update()` masivo de Eloquent no pasa por el cast: `confirmedByParticipants => []` en una columna `text[]` daba `malformed array literal` (500). Requiere el literal `'{}'`.
2. **Una BD recién migrada no tenía la fila `Season`** que exige la FK de `Availability` → `PUT /api/availability` daba 500. Producción la tenía "de fábrica". Corregido con la migración de datos `2026_09_19_000001_seed_default_season` (idempotente); el test `FreshDatabaseTest` lo cubre.
3. `trustProxies(at: ['*'])` con **array** no equivale al comodín (Symfony compara literal): el rate limit habría agrupado a todos los usuarios bajo la IP del proxy — el mismo 429 masivo del incidente ya documentado. Debe pasarse el string `'*'`. Test: `ProductionHardeningTest`.

### Frontend tocado (mínimo)
`TournamentView.jsx` reactiva las acciones de pareja (solo en `draft`); `TournamentEngineAdmin.jsx` gana el selector "quién carga los resultados" (organizador/jugadores), la pestaña **Invitar** (generar/cerrar enlace, copiar, WhatsApp/Telegram) y etiquetas para las acciones nuevas del log; `api.js` suma `generateInvite`, `updateInvite`, `updateResultMode`, `updateMaxParticipants`, `reset`, `archive`, `getCourts`, `setCourts` a `tournamentEngineService`. La UI que faltaba (archivar/reiniciar, pistas, cupo con "a quién quitar", árbitro) se construyó después — ver sección 24.

---

## 21. Endurecimiento para producción

- **Rate limiting** (mismos límites que Express, `AppServiceProvider`): 500 req/15 min global por IP, 20/15 min en `login`/`register`/`verify-2fa`, 5/hora en `forgot-password`. Apagado solo con `APP_ENV=local` (`RATE_LIMITS_ENABLED` lo fuerza).
- **Proxy de confianza** (`TRUSTED_PROXIES`, default `*`): ver bug 3 arriba.
- **Cabeceras de seguridad** (`SecurityHeaders`, equivalente a `helmet`) y `Cache-Control: no-store` en `/api/*`. HSTS lo pone Nginx (termina TLS).
- **CORS** restringido a `FRONTEND_URL` (`config/cors.php`).
- **Tokens fuera de los logs**: `AuthService` escribía en el log las URLs de verificación/activación/invitación (credenciales vivas). Ahora solo fuera de producción (`devLink`).
- **Path traversal en `/uploads`**: `str_starts_with($full, $base)` dejaba pasar un directorio hermano con el mismo prefijo (`uploads-evil`); ahora exige el separador.
- **Preflight** `php artisan bonapinta:check-config`: en producción el contenedor **no arranca** si `JWT_SECRET` < 32 chars, falta `APP_KEY`, `APP_DEBUG=true`, `MAIL_MAILER=log|array`, falta `RESEND_API_KEY`, `FRONTEND_URL` no es https, los rate limits están apagados, no hay BD o `UPLOADS_PATH` no es escribible.
- **Primer admin**: `php artisan bonapinta:create-admin <email> [--name=] [--password=]` (crea SUPER_ADMIN activado, o promueve una cuenta existente sin tocar su clave). Ya no hay credenciales sembradas.
- **`GET /api/health`** (con chequeo de BD, 503 si cae) — lo usa `deploy-backend.sh`.
- Deps: `composer audit` sin avisos de seguridad.

---

## 22. Despliegue (Docker Compose)

Archivos: `laravel/Dockerfile` (targets `app` = php-fpm y `web` = nginx interno), `laravel/docker/{entrypoint.sh,php.ini,nginx-api.conf}`, `docker-compose.yml`, `nginx/default.conf`, `deploy-backend.sh`, `.env.example`. Guía paso a paso en **`DEPLOY.md`** (raíz).

Servicios: `postgres` (16) → `api` (php-fpm; **único que migra**; su entrypoint hace check-config → migrate → seed de tipos → `config/route/event/view:cache`) → `scheduler` (`schedule:work`, auto-confirma resultados) y `api-web` (nginx interno; sirve `/uploads` directo del disco) → `frontend` (nginx público con TLS, proxy a `api-web`).

**Qué está verificado y qué no** (esta máquina no tiene Docker):
- ✅ Simulados en local, sobre una **BD vacía** y con `APP_ENV=production`: `composer install --no-dev` + autoload `--classmap-authoritative` (sin paquetes de dev), `check-config` (OK y fallo con exit 1), `migrate`, seed, `config/route/event/view:cache`, `create-admin`, y el servidor con esa config cacheada: health, login, `/me`, tipos sembrados, disponibilidad, cabeceras, throttle 429 y un recorrido de 25 pasos (invitación → inscripción → parejas por solicitud → propuesta/confirmación de resultado → tabla → log → borrado con confirmación → archivar).
- ⚠️ **No probado**: el build de la imagen, `docker-compose up`, el healthcheck, los permisos del volumen `./uploads` y la conf de nginx. Primer despliegue: mirar `docker-compose logs api` con atención.

---

## 23. Antes de cortar Express — pendientes y decisiones del usuario

1. **Rotar credenciales (urgente, independiente de esta migración)**: `docker-compose.yml` estaba **versionado con la API key real de Resend, el secreto JWT y la clave de Postgres en texto plano** (aparece en 3+ commits del historial). Ya no está en el archivo, pero sigue en git: revocar la key en Resend, generar un JWT nuevo y una clave de BD nueva. Si el repo alguna vez fue o será compartido, considerar reescribir el historial.
2. **Base nueva, no la vieja**: no apuntar Laravel a la BD de Prisma (`_prisma_migrations`, esquema reconstruido a mano). Como no hubo usuarios reales, empezar con un volumen de Postgres nuevo y `bonapinta:create-admin`.
3. ~~Sin UI aún~~ — hecho, ver sección 24.
4. **Fuera de alcance por decisión**: CimaPadel, `/api/matches` (liga clásica), presets `/api/tournaments`, `/api/seasons`. El frontend viejo `TournamentInstances.jsx`/`Matches` clásico sigue llamando a rutas que ya no existen; conviene borrarlo.
5. ~~`Valorations.jsx` atado a la API vieja~~ — hecho, ver sección 24.
6. **Límite de 20 logins/15 min por IP**: es paridad con Express, pero un club entero tras el mismo wifi comparte IP. Si molesta, subir el límite `auth` en `AppServiceProvider`.
7. El sustituto de una baja no ve ni puede proponer los partidos del titular (Express tampoco); solo el titular.

---

## 24. Frontend: ajustes del torneo y valoraciones sobre la API nueva

### Pestaña "Ajustes" del torneo (`components/tournament/TournamentSettings.jsx`)
Visible solo para quien gestiona el torneo (el backend lo exige igual). Cuatro bloques:
- **Quién carga los resultados**: organizador / jugadores / árbitro. El árbitro se elige con un buscador de jugadores (solo los que tienen cuenta: `arbitroId` es un `User.id`; por eso `GET /players/search` debe devolver `userId`, cubierto por test). `GET /tournament-instances/:id` ahora incluye `arbitro: {id, name}`.
- **Cupo máximo**: si el nuevo cupo es menor que los inscritos, pide elegir a quién quitar (botón deshabilitado hasta que sobra el número justo) y avisa —con confirmación— de que, si ya hay partidos, se eliminan y el torneo vuelve a borrador. El modal "Editar" remite a esta pestaña cuando se intenta bajar el cupo por debajo de los inscritos.
- **Pistas**: elegir y ordenar las pistas del club para el torneo.
- **Zona de riesgo**: reiniciar (conservando o quitando jugadores; pide escribir "reiniciar" si hay resultados o se borra el roster) y archivar/restaurar. El estado `archived` tiene badge propio.

### Las pistas ahora se usan de verdad (backend)
Hallazgo: `TournamentCourt` se guardaba pero **nada lo leía**: el motor nunca asignaba pista a un partido. Ahora `TournamentService::assignCourts()` (al generar una fecha) da a cada partido una pista, en el orden elegido. Los partidos de una fecha se juegan a la vez, así que las pistas son el tope: con menos pistas que partidos, los sobrantes quedan **sin pista** (no se reutiliza una pista para dos partidos simultáneos). Se saltan las pistas inactivas y los byes. Sin pistas configuradas, nada cambia. Solo afecta a las fechas generadas después de guardar las pistas. Tests: `CourtAssignmentTest`.

### Borrado de torneo
Bug introducido en la sección 20: `DELETE` con partidos jugados responde 409 y la pantalla no lo trataba, dejando al admin atascado. El modal ya exigía escribir "eliminar", así que esa confirmación escrita ahora envía `confirmed: true` (y el mensaje indica cuántos resultados se pierden). `tournamentEngineService.delete(id, confirmed)`.

### Valoraciones y cromo sobre la API nueva
- `Valorations.jsx`: cargaba `matchService.getMyMatches()` → 404 → **toda la pantalla fallaba al cargar**. Ahora usa `tournamentInstanceService.getMyMatches()`. Además: solo `tournamentMatchId` (fuera `matchId` y la rama de "partido clásico"), cuenta atrás en **días** (ventana de 7 días; antes decía "Xh" pensando en 24 h) y "Fecha N" en vez de "Ronda".
- **Récord del cromo** (PJ/PG/PP/sets/% de victorias): las dos copias del cromo calculaban con la forma clásica (`m.completed`, `team1.players`). Nueva utilidad única `utils/matchRecord.js` (`computeRecord`, `didWin`, `setsForMe`, `timeLeftLabel`) sobre las filas de `my-matches`; verificada con un script de Node.
- **Perfil público** (`PlayerStatsView.jsx`): "Últimos partidos" reescrito (compañeros/rivales por nombre, sets desde el punto de vista del jugador, abandonos). Backend: `GET /players/:id/public` devolvía `ClassicMatch` (tabla clásica, siempre vacía en una BD nueva) → ahora devuelve el historial de partidos de torneo terminados, más recientes primero, **sin datos privados** (a quién valoró, propuestas abiertas) y respetando `showMatches`. `TournamentService::myMatches()` se dividió para reutilizar `matchesForPlayer()`.
- `api.js`: eliminados `matchService` y `valorationService.getByMatch` (rutas inexistentes).

### Bugs míos encontrados y corregidos en esta ronda
1. `setAttribute('arbitro', …)` en `getById` ensuciaba el modelo y el siguiente `update()` intentaba escribir una columna inexistente (500 al cambiar el modo de resultados). Ahora el resumen se añade solo en la respuesta de `show()`.
2. `npm ci --dry-run` (npm 9.2) **vació `node_modules`** del frontend; se reinstaló con `npm ci`. No usar `--dry-run` para "verificar" con npm 9.

### Sin cubrir
- No hay tests de frontend (no hay runner). Verificado con: build, render en servidor de `SettingsTab` en 4 estados, script de Node para la utilidad y tests de backend de cada endpoint que usa la UI. **No se ha probado en un navegador real.**
- `PlayerStatsView.jsx`/`Valorations.jsx` conservan avisos de lint previos (imports sin usar).

---

## 25. Revisión tras probar en navegador: sin botón Editar, valoraciones 1–5 con foto

Tras probarlo a mano, el usuario pidió tres cosas.

### Botón "Editar" eliminado
Hacía cosas parecidas a Ajustes pero no permitía rehacer parejas. Se borró el botón y `EditTournamentModal`; el aviso de "cupo alcanzado" ahora lleva a Ajustes. Lo único que solo hacía Editar (nombre, descripción, "mejor de") pasó a una sección **Datos del torneo** al principio de Ajustes.

**Bug real detrás de la queja de las parejas**: quitar jugadores por el cupo en un torneo de parejas **ya iniciado pero sin partidos** lo dejaba `active`, con el compañero sin pareja y las parejas bloqueadas; como `generateRound` exige que todos tengan pareja, el torneo quedaba **atascado** sin salida. Ahora, si se quita a alguien de un torneo `fixed_pairs` iniciado, vuelve a `draft` (haya o no partidos) para poder rehacer las parejas. En Ajustes el aviso lo dice antes de guardar y, tras guardar, ofrece **"Rehacer parejas →"** (lleva a la pestaña Parejas). Tests: `CapRepairsPairsTest`.

### Valoraciones: escala 1–5 con slider en la misma línea
- **Backend**: la API valida enteros de 1 a 5 (rechaza 0, 6, 3.5, texto, `true`; un valor inválido en cualquier campo rechaza toda la valoración) y la BD lo garantiza con un `CHECK` (`Valoration_score_range`). La migración `2026_09_19_000002` convierte los datos existentes 1–10 → 1–5 con `ceil(v/2)` (solo las filas con algún valor >5; no toca lo que ya está en 1–5, así que es inocua en una BD nueva). En la BD local de desarrollo no había datos en la escala vieja.
- **Promedios con un decimal** (`ROUND(AVG(x),1)`): con solo enteros, un 3,6 se mostraría como 4. Las tres consultas duplicadas (valoraciones, perfil público, dashboard) se unificaron en `ValorationService::averagesSql()`/`statsForPlayer()`.
- **Frontend**: nueva utilidad única `utils/valoration.js` (`SCALE_MAX`, `overall`, `shotColor`, `scaleRatio`, `fmtScore`) que reemplaza tres copias de la matemática "sobre 10" (`Valorations`, `PlayerStatsView`, `Players`). El OVR del cromo pasa a `media/5×100` (rango 20–100). Umbrales recalculados (p. ej. "TOP AMB." de ≥8/10 a ≥4/5), gráfico con eje 0–5 y proyección limitada a 5.
- **Formulario**: cada golpe en una sola línea `Smash ───●─── 4/5 ✕`. Un slider sin tocar es "sin valorar"; ✕ lo devuelve a ese estado. Ambiente igual, separado.
- **Quién es quién**: al valorar se muestra **foto y nombre completo** (iniciales si no hay foto) con la etiqueta **Tu pareja / Rival** (`playersToRate[].relation`, nuevo en el backend); en la lista de pendientes los chips también llevan foto y nombre completo.

### Verificación
166 tests de backend. Renderizado en servidor de `ValorationForm` (nombres, fotos, etiquetas, 8 sliders con máximo 5, sin restos de "/10") y de `SettingsTab`; utilidad verificada con Node; recorrido de punta a punta por el proxy de Vite contra los servidores reales (con datos desechables, ya borrados). **Sigue sin probarse el arrastre real del slider en un navegador** (el primer toque en un slider sin valorar lo fija en 3 y el resto del arrastre lo ajusta).
