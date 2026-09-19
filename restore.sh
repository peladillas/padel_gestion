#!/bin/bash
# Bonapinta — Restauración de backup
# Uso: ./restore.sh                  ← menú interactivo
#      ./restore.sh 1.0              ← restaura versión que contenga "1.0"
#      ./restore.sh v1.0_20260429    ← nombre exacto (parcial)

set -e
cd /var/www/bonapinta

# ── Colores ──
RED='\033[0;31m'; YEL='\033[1;33m'; GRN='\033[0;32m'; BLU='\033[0;34m'; NC='\033[0m'

# ── Leer meta.json ──
meta_field() { grep "\"$2\"" "$1/meta.json" 2>/dev/null | sed 's/.*": *"\(.*\)".*/\1/' | head -1; }

# ── Listar backups disponibles ──
list_backups() {
  echo ""
  printf "  ${BLU}%-4s %-30s %-19s %s${NC}\n" "#" "Versión" "Fecha" "Descripción/Commit"
  printf "  %-4s %-30s %-19s %s\n" "────" "──────────────────────────────" "───────────────────" "──────────────────────────"
  local i=1
  for dir in backups/v*/; do
    [ -d "$dir" ] || continue
    local name=$(basename "$dir")
    local desc=$(meta_field "$dir" "description")
    local date=$(meta_field "$dir" "date" | cut -c1-16 | tr 'T' ' ')
    local msg=$(grep '"message"' "$dir/meta.json" 2>/dev/null | sed 's/.*": *"\(.*\)".*/\1/' | head -1 | cut -c1-35)
    local label="${desc:-$msg}"
    printf "  %-4s %-30s %-19s %s\n" "[$i]" "$name" "$date" "$label"
    BACKUP_LIST[$i]="$dir"
    i=$((i+1))
  done
  BACKUP_COUNT=$((i-1))
  echo ""
}

# ── Encontrar backup por término de búsqueda ──
find_backup() {
  local term="$1"
  for dir in backups/v*/; do
    [ -d "$dir" ] || continue
    if [[ "$(basename "$dir")" == *"$term"* ]]; then
      echo "$dir"
      return
    fi
  done
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bonapinta — Restauración de Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verificar que existen backups
TOTAL_BACKUPS=$(ls -d backups/v*/ 2>/dev/null | wc -l)
if [ "$TOTAL_BACKUPS" -eq 0 ]; then
  echo -e "  ${RED}❌ No hay backups disponibles en backups/${NC}"
  exit 1
fi

declare -A BACKUP_LIST

# ── Seleccionar backup ──
if [ -n "$1" ]; then
  SELECTED=$(find_backup "$1")
  if [ -z "$SELECTED" ]; then
    echo -e "  ${RED}❌ No se encontró backup con '$1'${NC}"
    list_backups
    exit 1
  fi
else
  list_backups
  read -p "  Número de versión a restaurar: " NUM
  SELECTED="${BACKUP_LIST[$NUM]}"
  if [ -z "$SELECTED" ] || [ ! -d "$SELECTED" ]; then
    echo -e "  ${RED}❌ Número inválido${NC}"
    exit 1
  fi
fi

# ── Mostrar detalles del backup seleccionado ──
BNAME=$(basename "$SELECTED")
GIT_COMMIT=$(meta_field "$SELECTED" "commit")
GIT_MSG=$(grep '"message"' "$SELECTED/meta.json" 2>/dev/null | sed 's/.*": *"\(.*\)".*/\1/' | head -1)
BDATE=$(meta_field "$SELECTED" "date" | cut -c1-19 | tr 'T' ' ')
BDESC=$(meta_field "$SELECTED" "description")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${YEL}Versión seleccionada: $BNAME${NC}"
echo "  Fecha   : $BDATE"
[ -n "$BDESC" ] && echo "  Desc    : $BDESC"
[ -n "$GIT_MSG" ] && echo "  Código  : $GIT_MSG"
[ -n "$GIT_COMMIT" ] && echo "  Commit  : ${GIT_COMMIT:0:12}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${YEL}⚠️  ATENCIÓN: esto sobreescribirá la DB, uploads y config actuales.${NC}"
echo ""
read -p "  ¿Confirmar restauración? (escribe 'si' para continuar): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "  Cancelado."
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Iniciando restauración..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Detener backend y frontend (liberar conexiones DB) ──
echo ""
echo "▶ [1/6] Deteniendo servicios (backend + frontend)..."
docker-compose stop backend frontend 2>/dev/null || true
echo "    ✓ Servicios detenidos"

# ── 2. Restaurar configuración ──
if [ -f "$SELECTED/config.tar.gz" ]; then
  echo "▶ [2/6] Restaurando configuración (nginx, docker-compose)..."
  tar -xzf "$SELECTED/config.tar.gz" -C .
  echo "    ✓ Configuración restaurada"
else
  echo "▶ [2/6] Sin config.tar.gz — omitido"
fi

# ── 3. Restaurar uploads ──
if [ -f "$SELECTED/uploads.tar.gz" ]; then
  echo "▶ [3/6] Restaurando uploads (avatares y archivos)..."
  tar -xzf "$SELECTED/uploads.tar.gz" -C .
  echo "    ✓ Uploads restaurados"
else
  echo "▶ [3/6] Sin uploads.tar.gz — omitido"
fi

# ── 4. Restaurar frontend compilado ──
if [ -f "$SELECTED/dist.tar.gz" ]; then
  echo "▶ [4/6] Restaurando frontend compilado..."
  tar -xzf "$SELECTED/dist.tar.gz" -C .
  echo "    ✓ Frontend restaurado"
else
  echo "▶ [4/6] Sin dist.tar.gz — omitido"
fi

# ── 5. Restaurar base de datos ──
if [ -f "$SELECTED/db.sql.gz" ]; then
  echo "▶ [5/6] Restaurando base de datos..."
  echo "    Asegurando que postgres está corriendo..."
  docker-compose start postgres 2>/dev/null || true
  sleep 4

  echo "    Eliminando y recreando base de datos..."
  docker exec bonapinta_postgres psql -U bonapinta -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='bonapinta' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true
  docker exec bonapinta_postgres psql -U bonapinta \
    -c "DROP DATABASE IF EXISTS bonapinta;" \
    -c "CREATE DATABASE bonapinta OWNER bonapinta;" \
    > /dev/null 2>&1

  echo "    Importando dump..."
  gunzip -c "$SELECTED/db.sql.gz" | \
    docker exec -i bonapinta_postgres psql -U bonapinta -d bonapinta -q 2>&1 | \
    grep -v "^SET$\|^COMMIT$\|^BEGIN$\|already exists\|^$" || true
  echo "    ✓ Base de datos restaurada"
else
  echo "▶ [5/6] Sin db.sql.gz — omitido"
fi

# ── 6. Restaurar código (opcional) ──
echo ""
if [ -f "$SELECTED/code.bundle" ] && [ -n "$GIT_COMMIT" ] && [ "$GIT_COMMIT" != "unknown" ]; then
  read -p "▶ [6/6] ¿Restaurar también el código fuente al commit ${GIT_COMMIT:0:12}? (s/N): " RESTORE_CODE
  if [[ "$RESTORE_CODE" =~ ^[sS]$ ]]; then
    echo "    Aplicando código del bundle..."
    git fetch "$SELECTED/code.bundle" 'refs/heads/*:refs/remotes/bundle/*' 2>/dev/null || true
    git checkout "$GIT_COMMIT" -- . 2>/dev/null && \
      echo "    ✓ Código restaurado al commit ${GIT_COMMIT:0:12}" || \
      echo -e "    ${YEL}⚠ No se pudo hacer checkout del código — el resto ya fue restaurado${NC}"
  else
    echo "    [6/6] Código fuente omitido (se mantiene el actual)"
  fi
else
  echo "▶ [6/6] Código fuente omitido"
fi

# ── Reiniciar todos los servicios ──
echo ""
echo "▶ Reiniciando todos los servicios..."
docker-compose up -d
echo "    Esperando que el backend inicie..."
sleep 6

# ── Health check ──
HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null | grep -c '"ok"' || echo "0")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$HEALTH" -gt 0 ]; then
  echo -e "  ${GRN}✅ Restauración completada — sistema operativo${NC}"
  echo -e "  ${GRN}   https://bonapinta.com${NC}"
else
  echo -e "  ${YEL}⚠️  Servicios iniciados pero el health check no respondió aún.${NC}"
  echo "     Espera unos segundos y verifica con:"
  echo "     docker-compose logs --tail 30 backend"
fi
echo "  Versión restaurada: $BNAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
