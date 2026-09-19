# Despliegue — Bonapinta (Laravel + React)

Guía para poner en producción el backend Laravel que reemplaza a Express. Contexto, decisiones y qué está verificado: `laravel/MIGRATION.md` secciones 20–23.

> ⚠️ Las imágenes Docker **no se pudieron construir** donde se escribió esta guía (sin Docker). El código, las migraciones, los comandos y la config de producción sí se probaron en local con `APP_ENV=production`. En el primer despliegue, mira los logs de `api`.

## 0. Antes de nada: rotar credenciales

El `docker-compose.yml` anterior tenía en texto plano (y en el historial de git) la **API key de Resend, el secreto JWT y la clave de Postgres**. Trátalas como comprometidas:

1. Resend → revoca la key vieja y crea una nueva.
2. Genera un JWT secret y una clave de BD **nuevos** (abajo).

## 1. Requisitos del servidor

- Docker + docker-compose, el repo en `/var/www/bonapinta`, certificados Let's Encrypt en `/etc/letsencrypt` (igual que hoy).
- No hace falta PHP ni Composer en el host: todo corre en contenedores (PHP **8.4**, Postgres **16**).

## 2. Configuración (`/var/www/bonapinta/.env`, git-ignorado)

```bash
cp .env.example .env
# Rellena TODOS los valores. Generadores:
openssl rand -hex 32                      # JWT_SECRET, POSTGRES_PASSWORD
echo "base64:$(openssl rand -base64 32)"  # APP_KEY
```

El contenedor **se niega a arrancar** si la config es insegura (`bonapinta:check-config`): `JWT_SECRET` < 32 chars, sin `APP_KEY`, `APP_DEBUG=true`, `MAIL_MAILER=log`, sin `RESEND_API_KEY`, `FRONTEND_URL` sin https…

## 3. Base de datos: empezar de cero

No apuntes Laravel a la BD vieja de Prisma. Como nunca hubo usuarios reales:

```bash
docker-compose down
docker volume rm bonapinta_postgres_data   # ⚠️ borra la BD vieja; el nombre exacto: docker volume ls
```

`migrate` crea todas las tablas, la temporada interna que exige Disponibilidad y el catálogo de tipos de torneo.

## 4. Primer despliegue

```bash
cd /var/www/bonapinta
mkdir -p uploads
./deploy-frontend.sh        # build del frontend → frontend/dist (aborta si el build falla)
./deploy-backend.sh         # build + up + espera a /api/health; falla ruidosamente si no responde

# Primer SUPER_ADMIN (no hay credenciales sembradas):
docker-compose exec api php artisan bonapinta:create-admin tu@email.com --name "Tu Nombre"
# → pide la contraseña por consola
```

`deploy-backend.sh` termina con `Backend deployed!` solo si `https://bonapinta.com/api/health` responde `{"status":"ok","db":"up"}`.

## 5. Qué corre

| Servicio | Rol |
|---|---|
| `postgres` | Postgres 16, volumen `postgres_data` |
| `api` | php-fpm. **Único que migra** (entrypoint: check-config → `migrate --force` → seed de tipos → cachés) |
| `scheduler` | `schedule:work`: auto-confirma a las 24h los resultados propuestos por jugadores sin respuesta |
| `api-web` | nginx interno: PHP por fastcgi y `/uploads` directo del disco (volumen `./uploads`, solo lectura) |
| `frontend` | nginx público con TLS: sirve el SPA y hace proxy de `/api` y `/uploads` a `api-web` |

## 6. Operación

```bash
docker-compose logs --tail 50 api            # LOG_CHANNEL=stderr → los errores de Laravel salen acá
docker-compose logs --tail 20 scheduler
docker-compose exec api php artisan bonapinta:check-config
docker-compose exec api php artisan tournaments:auto-confirm   # forzar el auto-confirm
docker exec -i bonapinta_postgres psql -U bonapinta -d bonapinta   # BD directa
```

- **Actualizar**: `git pull && ./deploy-backend.sh` (las migraciones nuevas corren solas).
- **Rollback**: `git checkout <commit anterior> && ./deploy-backend.sh`. Las migraciones no se revierten solas; si una migración nueva hay que deshacerla: `docker-compose exec api php artisan migrate:rollback --step=1`.
- **Backups**: `backup.sh`/`restore.sh` siguen siendo de la era Express (esperan `backend/`). Hasta adaptarlos, un backup mínimo:
  `docker exec bonapinta_postgres pg_dump -U bonapinta bonapinta | gzip > backup_$(date +%F).sql.gz` y copiar `./uploads`.

## 7. Problemas comunes

- **`api` en bucle de reinicio**: mira `docker-compose logs api`. Casi siempre es `check-config` (mensaje `✗ ...` con qué variable falta) o no poder conectar a Postgres.
- **429 para todos los usuarios a la vez**: el rate limit está viendo la IP del proxy. Debe cumplirse `TRUSTED_PROXIES=*` y que Nginx envíe `X-Forwarded-For` (ya está en `nginx/default.conf`).
- **Los emails no llegan**: `MAIL_MAILER=resend`, `RESEND_API_KEY` válida y el dominio `EMAIL_FROM` verificado en Resend.
- **Avatares no se ven**: permisos de `./uploads` (el entrypoint hace `chown www-data`) y que `api-web` tenga el volumen montado.
- **Un cambio de `.env` no se aplica**: la config queda cacheada al arrancar; `docker-compose up -d --force-recreate api scheduler`.
