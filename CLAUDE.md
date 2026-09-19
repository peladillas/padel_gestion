# Bonapinta Padel — Contexto del Proyecto

## Estado actual: backend Laravel listo para reemplazar a Express (aún sin desplegar)

El único backend es `laravel/` (Laravel 13 + Eloquent, **PHP ≥ 8.4**). El Express viejo (`backend/`) fue eliminado del repo y **nunca sirvió a usuarios reales**, así que no hay datos que migrar: se despliega con una BD nueva. El sistema de torneos se **rediseñó desde cero** (motor configurable por piezas, no un port del Strategy Registry de Express) a pedido explícito del usuario.

- Estado completo, bugs encontrados y decisiones: `laravel/MIGRATION.md` (secciones 20–23 = paridad con Express, endurecimiento, despliegue y pendientes).
- Cómo desplegar: `DEPLOY.md`. Los artefactos Docker están escritos pero **no se han podido construir** (sin Docker en la máquina de desarrollo); el resto se verificó en local con `APP_ENV=production`.
- Alcance acordado que **queda fuera**: CimaPadel, `/api/matches` (liga clásica), presets `/api/tournaments`, `/api/seasons`.
- Todas las secciones de más abajo que mencionan `backend/`, Prisma, `*.js` de Express, "Strategy Registry" o `deploy-*.sh` con Node describen el sistema **viejo**: son referencia histórica, no la arquitectura vigente.

## Infraestructura y credenciales
Sin datos de servidor/producción en este archivo por seguridad (estaban en texto plano en un archivo versionado en git — incluido `docker-compose.yml`: hay que rotar esas claves, ver `laravel/MIGRATION.md` §23). No documentar IPs, credenciales, secretos JWT ni API keys reales en CLAUDE.md ni en ningún archivo versionado — usar `.env` (gitignorado). Credenciales de prueba locales: ver `laravel/MIGRATION.md` sección 1.

## Stack técnico
- **Backend**: Laravel 13 + Eloquent → PostgreSQL 16 (local: puerto 8000 con `php artisan serve`; producción: Docker Compose, ver `DEPLOY.md`)
- **Frontend**: React + Vite (`npm run dev`, puerto 5173, con proxy a Laravel — ver `frontend/vite.config.js`)
- **Auth**: JWT + bcrypt, 2FA email, reset contraseña; `loginWithSession(token, user)` en AuthContext para login programático
- **Email**: Resend HTTP API
- **Iconos**: `@heroicons/react/24/outline` — todos los componentes usan Heroicons, sin emojis de UI

## Jugadores de prueba
Emails y contraseñas removidos de este archivo por seguridad — ver `laravel/MIGRATION.md` sección 1 para las cuentas de prueba locales ya creadas.

## Referencia interna de temporada (solo para disponibilidad)
- **ID hardcodeado** (`config('bonapinta.default_season_id')`, usado por `AvailabilityService`): `1f481f07-1eda-48ed-84f2-3e808004b3ad` — la migración `2026_09_19_000001_seed_default_season` crea la fila en una BD nueva
- Las tablas `Season` y `League` siguen en BD pero **no se exponen ni gestionan** desde el frontend

## Estructura de archivos clave
```
backend/src/api/routes/
  auth.routes.js                 ← login (email o username), registro, activación, invite codes, check-username, PUT username
  tournament-instances.routes.js ← torneos: CRUD, participantes, partidos, DELETE, invitaciones
  dashboard.routes.js            ← admin (KPIs + alertas pendingResults) / player
  availability.routes.js         ← GET/PUT /availability, GET /availability/player/:id
  matches.routes.js, valorations.routes.js, players.routes.js, tournaments.routes.js

frontend/src/pages/
  Dashboard.jsx          ← admin: KPIs+alertas+top activos / player: hero+torneos+partidos pendientes
  Players.jsx            ← directorio cromos dorados; admin: crear/importar/InviteCodeSection
  Profile.jsx            ← 2 tabs para todos los roles (Datos, Seguridad) — Contacto vive dentro de Datos;
                            no hay tab "Mi disponibilidad" separado (esta nota estaba desactualizada, corregido 2026-09-18)
  TournamentInstances.jsx ← gestión torneos admin; tabs: Jugadores, Partidos, Tabla, Invitar, Config
  TournamentJoin.jsx     ← /tournaments/join/:token — auto-inscripción con login o registro inline
  Matches.jsx, MyPair.jsx, Standings.jsx, Valorations.jsx, PublicProfile.jsx, TournamentView.jsx

frontend/src/context/
  AuthContext.jsx        ← auto-logout 30min; expone login, loginWithSession, logout, isAdmin
  ThemeContext.jsx       ← solo tema claro; dark/hc eliminados; ThemeProvider es un no-op

frontend/src/services/api.js  ← todos los endpoints; NO existe leagueService ni seasonService
frontend/src/index.css        ← ÚNICO lugar donde se definen los tokens de color por tema
```

## Menú por rol
**ADMIN**: Dashboard(ChartBar), Jugadores(Users), Torneos(Trophy), Perfil(UserCircle)
**PLAYER**: Inicio(Home), Disponibilidad(Calendar), Mis parejas(UserGroup), Partidos(QueueList), Valoraciones(Star), Torneos(Trophy), Jugadores(Users), Perfil(UserCircle)

## Base de datos — Tablas activas
User, Player, InviteCode,
Match, Availability (seasonId fijo interno), Valoration,
Tournament (presets), TournamentInstance, TournamentParticipant, TournamentMatch, TournamentLog

> Tablas Season, League, Team, TeamPlayer siguen en BD pero sin rutas expuestas.

> Migraciones Prisma al día — `prisma migrate status` → "Database schema is up to date!"
> Última migración: `20260429000001_add_participant_substitute` — campos `substituteId`, `absenceReason`, `absenceNote` en TournamentParticipant

## Arquitectura de servicios — backend (LEGACY: Express, referencia histórica)
```
backend/src/services/
  tournament/                      ← Strategy Registry — SISTEMA DE TIPOS DE TORNEO
    TournamentRegistry.js          ← singleton Map<tipo, ClaseEstrategia>
    TournamentFactory.js           ← crea estrategia a partir de (structure, pairingSystem)
    TournamentTemplate.js          ← plantillas de configuración por tipo
    CustomTournamentBuilder.js     ← builder fluido para torneos custom
    README.md                      ← documentación del subsistema
    strategies/
      TournamentStrategy.js        ← clase base abstracta: generateMatches, validate, calculateStandings
      CimaPadelStrategy.js         ← liga social rotación cocina (ver sección específica más abajo)
      EliminationTournament.js     ← eliminación directa
      RoundRobinTournament.js      ← todos contra todos
      AmericanTournament.js        ← americana clásica / perfecta
      MexicanTournament.js         ← mexicano dinámico
      MixicanoTournament.js        ← mixicano
      AmericanTeamTournament.js    ← americana por equipos
      LadderTournament.js          ← escalera
      KingOfTheCourtTournament.js  ← rey de la pista
      GroupsPlusKnockoutTournament.js ← grupos + eliminatoria
      CustomTournament.js          ← torneo custom configurable
    utils/seededRng.js             ← LCG determinista: makeRng, seedFromId, seededShuffle
  CimaPadelScheduler.js    ← lógica pura rotación BBQ/cocina (suggestNextBBQ, suggestCourtAssignments)
  CimaPadelDateManager.js  ← gestión fechas jornadas (computeJornadaDates, postponeJornada, appendJornada)
  CimaPadelOverrideManager.js ← overrides manuales BBQ (applyBBQOverride, recalculateBBQHistory)
  generators.old/          ← generadores legacy (deprecated, no usar)
  tournamentHelpers.js     ← addLog() + outcomeFromSets() compartidos
  StandingsService.js      ← calculateStandings(tournament) → { standings, completedMatches, totalMatches }
  TournamentMatchService.js ← getMyMatches, proposeResult, acceptResult, rejectResult, setResult
  TournamentService.js     ← getAll(userId,isAdmin), lifecycle, participantes, invitaciones, logs
                               + generateCimaPadelRound, setCimaPadelRoundAssignment
  AuthService.js           ← register, invite, login (acepta email o username)
  usernameHelper.js        ← normalizeToUsername, validateUsername, generateAvailableUsername

backend/src/api/
  controllers/TournamentInstancesController.js ← handlers HTTP finos (llaman a servicios)
  routes/tournament-instances.routes.js        ← solo registro de rutas
  middleware/optional-auth.middleware.js        ← extrae JWT si presente; no rechaza si ausente
```

> `GET /api/tournament-instances/` filtra por participación para PLAYER (solo ven sus torneos).
> Admin ve todos.

## Regla de aislamiento de tipos de torneo (LEGACY: Express; en Laravel los tipos son config + piezas del motor, ver MIGRATION.md §5)

**Cada tipo de torneo tiene su propia estrategia encapsulada. Nunca mezclar lógica entre tipos.**

Al crear o modificar un tipo de torneo:
1. Crear/editar SOLO su archivo en `backend/src/services/tournament/strategies/NombreTournament.js`
2. La clase extiende `TournamentStrategy` e implementa `generateMatches()`, `validate()`, `calculateStandings()`
3. Se auto-registra con `registry.register('tipo_key', ClaseTorneo)` al final del archivo
4. En `TournamentFactory.js`: añadir `require('./strategies/NuevoTournament')` y si tiene clave propia, añadirla a `STRUCTURE_KEYS`
5. En `TournamentInstances.jsx`: para UI específica del tipo, usar `selected.structure === 'tipo_key'` para renderizar componentes dedicados

**Consecuencia directa**: cambios en CimaPadel NO afectan a americana, mexicano, etc. y vice versa.
Cada estrategia gestiona su propio formato de datos en `TournamentMatch.group` (JSON libre) y su lógica de standings.

### Tipos de torneo actuales y sus claves
| Clave | Clase | pairingSystem | Notas |
|---|---|---|---|
| `cima_padel` | `CimaPadelStrategy` | `fixed_pairs` | Liga social rotación cocina — ver sección detallada |
| `eliminacion_directa` | `EliminationTournament` | any | Bracket eliminatorio |
| `round_robin` | `RoundRobinTournament` | individual/fixed_pairs | Todos contra todos |
| `americana_clasica` | `AmericanTournament` | `americana_clasica` | |
| `americana_perfecta` | `AmericanTournament` | `americana_perfecta` | |
| `mexicano` | `MexicanTournament` | `mexicano` | |
| `mixicano` | `MixicanoTournament` | `mixicano` | |
| `americana_teams` | `AmericanTeamTournament` | `americana_teams` | |
| `ladder` | `LadderTournament` | — | |
| `king_of_court` | `KingOfTheCourtTournament` | — | |
| `custom` | `CustomTournament` | — | |

## Funcionalidades implementadas ✅
1. Login/logout JWT, 2FA email, reset contraseña, auto-logout 30min
2. Disponibilidad horaria (slots 30min) — rolling 60 días, sin temporada
3. Vista "Mis parejas" (`/mypair`) — fixed_pairs: pareja fija + disponibilidad conjunta + partidos pendientes con overlap de los 4 jugadores; resto de estructuras: historial de partners por ronda. Activos vs historial separados. Acordeón con paginación de 5 días/página.
4. Partidos — proponer/confirmar/rechazar, expirados >7d, solicitar resultado al admin
5. Tabla de clasificación por torneo (fixed_pairs por pareja; resto individual)
6. Perfil — avatar con recorte circular, datos jugador, privacidad (isPublic/showStats/showMatches/showContact)
7. Directorio jugadores — mini-cromos dorados, paginado, buscador
8. Perfil público — cromo premium, radar golpes, evolución valoraciones
9. Valoraciones — 24h post-confirmación, radar rojo→verde, evolución Chart.js
   - **Valoran solo jugadores entre sí** (nunca admin)
   - Soportan tanto `Match` clásico como `TournamentMatch` (campo `tournamentMatchId` en Valoration)
   - `completedAt` se guarda en el JSON `result` del TournamentMatch al completarse (admin, accept, auto-confirm)
   - `/pending` devuelve partidos de ambos sistemas; frontend envía `tournamentMatchId` o `matchId` según corresponda
   - Tab "Mis stats" en Valorations.jsx muestra radar + evolución Chart.js
10. Dashboard admin — KPIs, alerta resultados pendientes (+2d), top jugadores activos
    Dashboard player — hero, lista de torneos en los que está inscrito (con estado+estructura), valoraciones, partidos pendientes
11. Sistema torneos completo:
    - Estructuras: round_robin, eliminacion_directa, americana_clasica/perfecta, mexicano...
    - resultMode: creador / jugador (proponer/confirmar 24h auto) / arbitro asignado
    - Borrar torneo: paso 1 confirmación simple; paso 2 (si hay jugados) escribir "eliminar torneo [nombre]"
    - Vista pública `/tournaments/:id/view`
    - Cambiar resultMode en torneo existente (pestaña Config) — limpia propuestas pendientes en los partidos no completados (transacción atómica)
12. Invitaciones a torneos:
    - `allowInvitations` + `maxParticipants` + `inviteToken` en TournamentInstance
    - Pestaña Invitar en detalle de torneo: generar enlace, compartir WA/TG, revocar
    - `/tournaments/join/:token` — muestra info del torneo; si no autenticado: tabs login / crear cuenta inline
    - Al crear torneo: checkbox auto-inscripción + cupo máximo
    - Invitaciones bloqueadas automáticamente al generar partidos
13. Invite codes plataforma (Jugadores admin — sección "Enlace de invitación"):
    - Multi-uso configurable (campo "Usos"), caducan 7 días
    - Historial paginado (5/página) con fecha caducidad y botón copiar
14. Activación por invitación — isActivated/activationToken en User; import CSV envía invite
15. Roles ADMIN / PLAYER — menús y perfil diferenciados (admin sin tab disponibilidad)
16. Iconos — `@heroicons/react/24/outline` en toda la app; sin emojis de UI
17. Tema visual — solo tema claro; dark/hc eliminados de ThemeContext y tokens.css; toggle de tema eliminado de Layout
18. Registro de actividades por torneo — TournamentLog con acciones de resultado, participantes y configuración; visible para admin y jugadores (pestaña Actividad)
19. Resultado en click desde vista jugador — en partidos propios se puede proponer/aceptar/rechazar resultado inline
20. Botón "Valorar rivales" en partidos completados — aparece en TournamentMatchCard dentro de 24h si quedan rivales sin valorar; navega a /valorations
21. Refactorización SOLID completa — tournament-instances.routes.js (~1000 líneas) separado en capas service/controller; generadores extraídos a Strategy Registry; error handling normalizado
22. Username por usuario — campo `username` único en User; login por email o username; generación automática al crear usuario; sugerencias si tomado; editable en perfil
23. Formación de parejas en fixed_pairs:
    - Inscripción individual libre; parejas se forman en paso separado
    - Admin: botón "Emparejar" con picker inline por participante; "Desemparejar"
    - Jugadores: solicitar pareja a otro inscrito con confirmación (aceptar/rechazar/cancelar)
    - Generar partidos bloqueado hasta que todos los participantes tengan pareja confirmada
    - status='pair_requested' en TournamentParticipant para solicitudes pendientes
    - Endpoints: PUT /pair, PUT /unpair, POST /pair-request, PUT /pair-request/accept, PUT /pair-request/reject, DELETE /pair-request
24. Arquitectura multi-club (Fase 1+2+3):
    - Tablas: `Club` (id, name, slug, description, logoUrl) + `ClubMembership` (clubId, playerId, role:ClubRole, status)
    - Rol `SUPER_ADMIN` añadido al enum Role; `isAdmin()` acepta ADMIN y SUPER_ADMIN; `isSuperAdmin()` solo SUPER_ADMIN
    - Campo `clubId` + `visibility` (internal/open) en `TournamentInstance`; `clubId` en `InviteCode`
    - Club "Cima Padel" creado (slug: cima-padel); 1 usuario SUPER_ADMIN; 2 usuarios ADMIN de Cima Padel; 1 usuario ADMIN sin ClubMembership (emails removidos de este archivo — ver sección Credenciales)
    - Torneos scoped: SUPER_ADMIN → todos; ADMIN → solo torneos de su club (vía ClubMembership.role=ADMIN); PLAYER → solo los suyos
    - Nuevos torneos auto-asignan clubId al club del admin creador
    - Página `/clubs` (solo admin): lista clubs, crear club, detalle con miembros y torneos
    - Gestión de socios: añadir jugador, cambiar rol de club (ADMIN/MEMBER), eliminar del club
    - Gestión de rol de sistema: super admin puede promover/degradar User.role (ADMIN↔PLAYER) desde la lista de socios
    - Middleware: `admin.middleware.js` (ADMIN+SUPER_ADMIN), `superAdmin.middleware.js` (solo SUPER_ADMIN)
    - Rutas: `GET/POST /api/clubs`, `GET/PUT /api/clubs/:id`, `POST/PUT/DELETE /api/clubs/:id/members`, `PUT /api/clubs/:id/members/:playerId/system-role`
25. Panel ABM de jugadores unificado (`ClubPlayersPanel` en `Players.jsx`):
    - SUPER_ADMIN ve y gestiona todos los jugadores (carga vía `search('')`); ADMIN ve solo socios del club (carga vía `getClubPlayers()`)
    - Crear, editar nombre/teléfono/posición y eliminar jugadores desde la misma pantalla
    - Buscador por nombre, email o teléfono (client-side); paginador 10/página
    - Separado visualmente del directorio de cromos (sección propia con header diferenciado)
26. Búsqueda + paginación en página Clubs (`/clubs`, solo SUPER_ADMIN):
    - Filtro client-side por nombre o slug; paginador 8 clubs/página
    - Contador dinámico en header ("N de M clubs" cuando hay búsqueda activa)
    - Estado vacío "Sin resultados para X" cuando el filtro no encuentra coincidencias
27. Links de invitación/activación → **15 días** de caducidad (antes 7d/24h):
    - Tokens de activación de cuenta, invite codes plataforma y verificación de email: 15 días
    - Afectado: `AuthService.js`, `auth.routes.js`, plantillas de `EmailService.js`
28. Sistema de backup y restauración:
    - `./backup.sh <version> ["desc"]` — crea `backups/v{VERSION}_{TIMESTAMP}/` con db.sql.gz, uploads.tar.gz, config.tar.gz, code.bundle, dist.tar.gz, meta.json
    - `./restore.sh [version]` — menú interactivo o por término; detiene servicios, restaura BD/uploads/dist/config, reinicia y hace health check
    - Versiones disponibles: v1.0 (launch), v1.0.1 (sustitución de jugadores)
29. Valoraciones — mejoras completas:
    - Ítem en menú player (StarIcon → `/valorations`)
    - 3 tabs: **Valorar** (partidos pendientes con filtros, paginación), **Recibidas** (valoraciones recibidas con OVR badge + desglose por golpe), **Mis stats** (radar + evolución Chart.js + compartir cromo)
    - `GET /api/valorations/received` — devuelve valoraciones recibidas con fromPlayer y fecha
    - Compartir: botón en Mis stats genera PNG del cromo (html2canvas) y lo comparte vía Web Share API con archivo adjunto (fallback a clipboard)
30. Perfil público sin login (`/players/:id`):
    - Ruta top-level en App.jsx (fuera de PrivateRoute) — accesible sin autenticación
    - Backend: `GET /players/:id/public` usa `optionalAuthMiddleware` (no rechaza anónimos)
    - Interceptor axios arreglado: solo redirige a /login si había token previo (`hadToken`), nunca para visitantes anónimos
    - Página standalone (`PublicProfile.jsx`) con header Bonapinta, reutiliza `PlayerStatsView`
    - Visitantes anónimos ven CTA "Crea el tuyo" (dark card con links a /login y bonapinta.com)
    - Jugadores logueados ven "← Volver" pero no el CTA
31. Sistema de bajas/sustitución en torneos (admin):
    - BD: `substituteId` (FK → Player), `absenceReason`, `absenceNote` en `TournamentParticipant`; `status='absent'` cuando hay baja
    - `TournamentService.setSubstitute(tournamentId, participantId, substitutePlayerId?, reason, note)` — valida existencia del sustituto, registra log
    - `PUT /api/tournament-instances/:id/participants/:pid/substitute` — solo admin; `substitutePlayerId: null` revierte la baja
    - `getById` incluye `substitute: { id, name, avatarUrl }` en cada participante
    - Frontend: botón **"Baja"** en cada fila de participante (visible incluso con torneo activo); modal `SubstituteModal` con:
      - Selector de motivo: Lesión / Ausencia / Viaje / Otro
      - Campo nota opcional
      - Tab "Buscar jugador" (live search) + tab "Crear nuevo" (nombre+email+nivel)
      - Validación: debe seleccionarse o crearse el sustituto antes de confirmar
    - Botón **"Revertir"** reemplaza "Baja" cuando el participante ya está `absent`
    - Badge `BAJA` en rojo + nombre del sustituto en la fila del participante
    - `MyPair.jsx`: la tarjeta de pareja fija muestra badge `BAJA` + nombre del sustituto cuando el compañero está ausente
32. Dashboard admin — `ClubMembersPanel` con tabs Activos/Eliminados:
    - Tab "Activos" (default): socios activos; tab "Eliminados": socios con `active=false` (solo aparece si hay alguno)
    - Badge `BAJA` en rojo en cada fila del tab Eliminados; opacidad 0.6
    - Cambiar de tab resetea página y búsqueda; contador en cada tab
    - Cada fila sigue siendo clickable → navega a `/players/:id`
33. Cupo máximo de participantes editable en torneos:
    - `TournamentService.updateMaxParticipants(tournamentId, newMax, participantsToRemove=[])` — valida que no queden más participantes que el nuevo cupo; si hay partidos generados los elimina y resetea status a `draft`
    - `PUT /api/tournament-instances/:id/max-participants` — solo admin; body: `{ maxParticipants, participantsToRemove[] }`
    - Frontend: componente `MaxParticipantsEditor` en pestaña **Config** (junto a `ResultModeEditor`)
      - Input numérico para nuevo cupo; muestra inscritos actuales
      - Si el nuevo cupo < inscritos actuales: aparece lista de checkboxes para seleccionar quién se elimina
      - Botón deshabilitado si faltan jugadores por seleccionar (`needed > 0`)
      - Avisa si la operación resetea el torneo a borrador
35. **Tipo de torneo CimaPadel** — liga social con rotación de cocina:
    - Estructura: `cima_padel` + `pairingSystem: fixed_pairs`; siempre **6 parejas** registradas
    - Ciclo: cada pareja cocina exactamente 1 vez por cada 3 jornadas; sin enfrentamientos repetidos dentro del ciclo
    - **Generación incremental**: 1 jornada a la vez via `POST /api/tournament-instances/:id/cima-round`
      - Antes de generar: modal de disponibilidad muestra las 6 parejas con checkboxes (filtra solo `status='active'`)
      - Algoritmo adapta número de cocineros al número de disponibles: `numCooking = max(0, min(2, N-4))`
      - Historia completa derivada de matches existentes → no se repite el cocinero; no se repiten enfrentamientos
    - **Drag-and-drop swap**: `PUT /api/tournament-instances/:id/cima-round/:jornada` reemplaza la jornada con asignación explícita
      - En frontend: `CimaPadelRoundEditor` con slots `cook-N` y `match-M-S`; usa `useRef` para `dragSlot` (evita re-render durante drag)
      - Render como función inline (no componente React) para que los DOM nodes no se desmontén durante el arrastre
    - **Formato `_bbq`** en `TournamentMatch.group` (primer match de cada ronda):
      `{ couples: [{ coupleId, members: [pId, pId?] }], isManualOverride }` — historia reconstruible solo desde matches
    - **Botón "Próxima fecha"**: calcula fecha de la próxima jornada desde `config.jornadaDates` o `startDate + frecuencia × (ronda-1)`; muestra "Próxima fecha · 4 jun"
    - **Eliminar jornada**: botón "Eliminar" en header de cada ronda; borra todos los partidos de esa ronda
    - **Reiniciar torneo**: botón "Reiniciar" disponible incluso en estado activo (CimaPadel es liga continua)
    - Servicios de soporte (lógica pura, sin BD): `CimaPadelScheduler`, `CimaPadelDateManager`, `CimaPadelOverrideManager`
    - Frontend: `CimaPadelMatchesView`, `CimaPadelRoundEditor`, `CimaAvailModal` en `TournamentInstances.jsx`
      - `getNextCimaDate(tournament, nextRound)` + `fmtShortDate(iso)` como helpers de módulo

36. Cocineros BBQ/cocina — cambio de formato (antes 1, ahora N parejas por jornada):
    - `overrideJornadaBBQ` recibe `coupleIds: [id1, id2]` (array) en lugar de `coupleId` string
    - Modal override actualizado: checkboxes para seleccionar exactamente 2 parejas

37. Nginx — virtual hosts adicionales en producción:
    - `taxishare.bonapinta.com`: frontend en puerto 3030, API en 3031, socket.io soportado
    - `autos.bonapinta.com`: app en puerto 3001
    - PostgreSQL ya no expone puerto 5432 al host (seguridad)

## Sistema de estilos — convención actual
Solo existe tema claro. Los tokens CSS están en `frontend/src/styles/tokens.css` (`:root` únicamente).

**Patrón de estilos**: inline `style={{}}` para layout/color/spacing + clases CSS en `index.css` para interactividad (hover, focus, media queries). No mezclar.

> ✅ Refactor CSS completado: todos los bloques `<style>` inyectados dinámicamente han sido eliminados.
> Afectados: `Layout.jsx`, `Matches.jsx`, `Dashboard.jsx`, `MyPair.jsx`, `Card.jsx`, `Chip.jsx`, `Button.jsx`, `Pill.jsx`, `Cromo.jsx`, `PlayerStatsView.jsx`, `Valorations.jsx`.
> `@keyframes bp-pulse` (Layout) renombrado a `bp-blink` en `Pill.jsx` para evitar colisión de nombres.

**Elementos intencionalmente oscuros** (no cambiar con el tema):
- Cromos/trading cards: `PlayerCard`, `PlayerCromo`, `PlayerStatsView` — fondo `#1a1200`, borde `#c9a227`
- Overlay de recorte de avatar en `AvatarUpload` — fondo `rgba(0,0,0,0.85)`

## Nav móvil — accesibilidad
- Iconos: 26×26px, área mínima 64px, font-size labels 11px
- `aria-label={label}` en cada NavLink, `aria-hidden="true"` en iconos SVG, `aria-label="Navegación principal"` en `<nav>`
- `touch-action: manipulation` + `-webkit-tap-highlight-color: transparent` para respuesta táctil

## Valoraciones — modelo de datos
```
Valoration {
  matchId           String?   ← partidos clásicos (Match); NULL si es torneo
  tournamentMatchId String?   ← partidos de torneo (TournamentMatch); NULL si es clásico
  fromPlayerId / toPlayerId / smash / volea / globo / bandeja / bajadaPared / resto / saque / ambiente
}
```
Índices únicos parciales (no se pueden definir en Prisma, están en la BD directamente):
- `Valoration_match_unique`  ON (matchId, fromPlayerId, toPlayerId) WHERE matchId IS NOT NULL
- `Valoration_tmatch_unique` ON (tournamentMatchId, fromPlayerId, toPlayerId) WHERE tournamentMatchId IS NOT NULL

## Problemas comunes y soluciones
❌ Build frontend falla silenciosamente
→ deploy-frontend.sh siempre dice "Frontend deployed!" aunque falle
→ Verificar: `docker run --rm -v /var/www/bonapinta/frontend:/app -w /app node:20-slim sh -c "npm run build" 2>&1 | grep -E "✓|error"`

❌ "Cannot read properties of undefined"
→ Usar (array||[]).map(), obj?.prop, (obj?._count?.field ?? 0)

❌ Pantalla en blanco tras deploy backend
→ Build frontend falló y el JS viejo crashea con la API nueva → fix + redesploy frontend

❌ Prisma "Unknown argument" / campo no encontrado
→ ./deploy-backend.sh (--no-cache si persiste); si falta columna: ALTER TABLE + schema.prisma + rebuild

❌ Ruta 404 tras añadir endpoint
→ Verificar registro en server.js + rebuild backend

❌ Valoraciones no aparecen en /pending aunque hay TournamentMatch completados
→ Verificar que el TournamentMatch tiene `status='completed'` y que el jugador es participant1Id o participant2Id vía TournamentParticipant
→ Si falta `completedAt` en result JSON, el sistema usa `createdAt` del match como fallback (siempre permite valorar)

❌ Tab de stats desaparecido en Valorations.jsx
→ Verificar que el array de tabs en línea ~639 incluye `['stats','Mis stats']` además de `['rate',...]`

❌ Mis parejas no muestra pareja aunque está asignada
→ `partnerId` en `TournamentParticipant` guarda el **playerId** del compañero (no su participantId)
→ La comparación correcta es `p.playerId === myPart.partnerId || p.partnerId === myPlayerId`
→ NO comparar `p.id === myPart.partnerId` (participant ID ≠ player ID)

❌ Mis parejas vacío aunque el jugador está en torneos (logged in como admin)
→ El admin no es participante de ningún torneo → `mine` queda vacío → "No estás inscrito"
→ La página es exclusiva de jugadores; navegar a /mypair como admin es un estado esperado vacío

❌ Formulario "Nuevo Preset" en blanco al hacer clic
→ Dos causas combinadas:
  1. `LABELS.byeRules` no existía → `LABELS.byeRules[key]` lanzaba TypeError silencioso
  2. `PresetForm` definido dentro de `PresetsTab` → React recreaba el tipo en cada render (unmount/remount)
→ Solución: añadir `byeRules` al objeto LABELS + extraer `PresetForm` al nivel de módulo

❌ Formulario de crear torneo persiste al cambiar a pestaña Presets
→ `showCreate` se renderizaba independientemente del `mainTab` activo
→ Solución: añadir condición `&& mainTab === 'list'` al renderizar el formulario

❌ Rate limit bloquea a todos los usuarios simultáneamente (429 en producción)
→ Sin `app.set('trust proxy', 1)` en Express, todas las peticiones que llegan desde Nginx comparten la misma IP de contenedor
→ Solución: añadir `app.set('trust proxy', 1)` en `server.js` + cabecera `X-Forwarded-For` en nginx + rebuild backend

❌ Browser cachea el HTML y carga JS viejo tras un deploy
→ Nginx sin cabeceras Cache-Control para HTML → el navegador sirve el `index.html` anterior que apunta al bundle anterior
→ Solución: añadir bloque `location ~* \.html$` con `Cache-Control: no-store, no-cache` en `nginx/default.conf`

❌ `ClubPlayersPanel` no aparece para SUPER_ADMIN
→ La condición era `isAdmin() && !isSuperAdmin()` — excluía al super admin
→ `GET /api/players/club-players` devuelve `[]` para SUPER_ADMIN (sin ClubMembership)
→ Solución: condición `isAdmin()` + prop `isSuperAdmin` al componente; carga todos vía `search('')` cuando `isSuperAdmin=true`

❌ Migración Prisma queda en estado "failed" y bloquea todo deploy
→ El backend arranca con `prisma migrate deploy`; si la migración falla, queda sin `finished_at` ni `rolled_back_at`
→ Síntoma: backend en crash loop con "P3009 — migrate found failed migrations"
→ Solución: `docker exec bonapinta_postgres psql -U bonapinta -d bonapinta -c "UPDATE \"_prisma_migrations\" SET rolled_back_at=now() WHERE migration_name='NOMBRE' AND finished_at IS NULL;"`
→ Luego corregir el SQL de la migración y volver a `./deploy-backend.sh`

❌ Perfil público redirige a /login para visitantes anónimos
→ Causa: interceptor axios redirigía en CUALQUIER 401, incluyendo endpoints autenticados llamados desde PlayerStatsView
→ Solución: verificar `hadToken = !!localStorage.getItem('bp_token')` antes de redirigir; solo redirigir si había sesión previa
→ Para rutas públicas del backend usar `optionalAuthMiddleware` en lugar de `authMiddleware`

❌ Drag-and-drop en React necesita hacerse 2 veces para mover el elemento
→ Causa: componente definido DENTRO de otro componente (ej. `const Card = () => ...` dentro del render)
→ En cada re-render (por `setState` en `onDragStart`) React ve un tipo nuevo → desmonta el DOM → dispara `dragend` → limpia la ref
→ Solución: usar `useRef` para el slot de origen (no causa re-render) + definir el slot como función inline `renderSlot()` en lugar de componente `<Card />`

❌ Fetch manual con `localStorage.getItem('token')` falla silenciosamente (401)
→ El proyecto guarda el JWT bajo `'bp_token'`, no `'token'`
→ Los fetch que no usan el interceptor de axios deben usar `localStorage.getItem('bp_token')`
→ El interceptor de axios en `api.js` ya usa `bp_token` correctamente

❌ CimaPadel: jornadas se eliminan visualmente pero vuelven al recargar
→ Causa: `fetch` usaba `localStorage.getItem('token')` → 401 silencioso → BD sin cambios → state local sí se actualiza
→ Solución: cambiar a `localStorage.getItem('bp_token')` en todos los fetch manuales de `TournamentInstances.jsx`

❌ Añadir nuevo tipo de torneo rompe los existentes
→ NUNCA modificar `TournamentStrategy.js` (clase base) para lógica específica de un tipo
→ Cada tipo vive en su propio archivo en `strategies/`; se auto-registra; no toca los demás
→ Ver sección "Regla de aislamiento de tipos de torneo"

## Comandos útiles
```bash
# Laravel (desde laravel/)
./vendor/bin/pest                                  # tests (387)
php artisan bonapinta:create-admin <email>         # primer SUPER_ADMIN
php artisan bonapinta:check-config                 # preflight de producción
php artisan tournaments:auto-confirm               # auto-confirma resultados propuestos (>24h)

# Deploy (ver DEPLOY.md; el backup/restore de abajo es de la era Express)
./deploy-backend.sh
./deploy-frontend.sh

# Verificar build
docker run --rm -v /var/www/bonapinta/frontend:/app -w /app node:20-slim sh -c "npm run build" 2>&1 | tail -5

# Logs
docker-compose logs --tail 20 backend 2>&1 | grep -v "prisma:query"
docker-compose logs --tail 50 frontend 2>&1 | grep -v "304"

# BD directa
docker exec -i bonapinta_postgres psql -U bonapinta -d bonapinta

# Backup / Restauración
./backup.sh 1.1 "descripcion"   # crea backup en backups/v1.1_TIMESTAMP/
./restore.sh 1.0                 # restaura versión que contenga "1.0"
./restore.sh                     # menú interactivo

# Git
git add -A && git commit -m "mensaje" && git push
```

## Estructura multi-club — modelo de roles
```
User.role = SUPER_ADMIN → acceso total; ve y gestiona todos los clubs y torneos
User.role = ADMIN       → admin de club; solo ve torneos del club donde ClubMembership.role='ADMIN'
User.role = PLAYER      → jugador; solo ve torneos en los que participa

ClubMembership.role = ADMIN  → admin dentro del club (puede gestionar socios vía UI)
ClubMembership.role = MEMBER → socio normal del club

Para hacer admin de club a un jugador:
1. En Clubs.jsx → expandir club → botón "↑ Admin" junto al jugador
2. Esto cambia User.role → ADMIN Y ClubMembership.role → ADMIN
3. El jugador pasa a ver el menú de administración scoped a su club
```

## PRÓXIMOS PASOS (lista histórica escrita para Express — los pendientes reales están en `laravel/MIGRATION.md` §23)

### 1. Notificaciones email para torneos (backend)
`EmailService` cubre: 2FA, invitaciones, resultados/confirmaciones de `Match` clásico, reset contraseña.
**Falta** cubrir eventos de `TournamentMatch` y formación de parejas:
- Propuesta de resultado en torneo → notificar al rival
- Aceptación/rechazo de resultado → notificar al proponente
- Solicitud de pareja (`pair_requested`) → notificar al jugador solicitado
- Aceptación/rechazo de solicitud de pareja → notificar al solicitante
- Baja registrada (`status='absent'`) → notificar al sustituto
- CimaPadel: notificar a las parejas seleccionadas para cocinar

Dónde añadir: `TournamentMatchService.js` (proposeResult, acceptResult, rejectResult), `TournamentService.js` (pairRequest, pairRequestAccept, pairRequestReject, setSubstitute, generateCimaPadelRound).

### 2. CimaPadel — mejoras pendientes
- **Registrar resultados en jornadas activas**: `CimaPadelMatchesView` muestra rondas completadas en lectura pero no tiene inline result editor. Añadir editor de resultado (tipo `ScoreEntry`) en la vista de ronda no-completada.
- **Vista player**: el tab Partidos para jugadores en `TournamentView.jsx` y `Dashboard.jsx` no usa `CimaPadelMatchesView` (solo ve el componente genérico). Adaptar para que muestre la misma vista organizada por jornada.
- **Aplazar jornada**: la pestaña Jornadas (calendario) sigue funcionando para CimaPadel, pero el DnD y el botón de eliminar jornada solo están en el tab Partidos. Unificar en un solo lugar.

### 3. Completar estado final de torneos
Cuando todos los partidos de un torneo están `completed`, no hay mecanismo automático para marcarlo como `completed`.
- Añadir lógica en `TournamentMatchService.acceptResult` / `setResult` para detectar si todos están completados y marcar el torneo automáticamente
- Para CimaPadel no aplica (liga continua sin fin definido) — excluir del check automático

### 4. Sustitución — próximas mejoras
- Opción de **reemplazar en partidos futuros**: asignar el sustituto como participant en los TournamentMatch no completados donde aparecía el titular
- Notificación email al sustituto cuando se registra la baja (ver punto 1)

### 5. Validación de email al editar perfil (frontend)
`Profile.jsx` valida nombre pero no valida el email al editar contacto (tab Contacto).
Añadir validación RFC antes de llamar al API.

### 6. Multi-club Fase 3 — experiencia cross-club
- Directorio público de clubs con sus torneos abiertos (visibility='open')
- Jugadores pueden inscribirse en torneos abiertos de otros clubs sin ser socios
- Dashboard player: separar torneos de "mi club" vs "otros clubs"

### 7. Gestión de clubs — mejoras pendientes
- ~~Logo y descripción de club~~ — hechos (foto, descripción corta y servicios; ver `laravel/MIGRATION.md` §26)

### 8. Cupo máximo — mejora UI en pestaña Invitar
`MaxParticipantsEditor` (Config) y `TournamentInvitationsEditor` (Invitar) gestionan `maxParticipants` independientemente.
Pendiente: sincronizar el valor mostrado en Invitar cuando se cambia desde Config.
