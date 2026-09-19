#!/bin/bash
# Bonapinta — Backup completo
# Uso: ./backup.sh <version> ["descripcion opcional"]
# Ej:  ./backup.sh 1.0 "Launch version"
#      ./backup.sh 1.1 "Notificaciones email"

set -e
cd /var/www/bonapinta

VERSION="${1:-$(date +%Y%m%d_%H%M%S)}"
DESCRIPTION="${2:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/v${VERSION}_${TIMESTAMP}"

mkdir -p "$BACKUP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bonapinta Backup"
echo "  Versión   : v$VERSION"
echo "  Directorio: $BACKUP_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Base de datos (con DROP + CREATE para restore limpio)
echo "▶ [1/5] Volcando base de datos..."
docker exec bonapinta_postgres pg_dump \
  -U bonapinta \
  --clean --if-exists \
  bonapinta | gzip > "$BACKUP_DIR/db.sql.gz"
echo "    ✓ $(du -sh "$BACKUP_DIR/db.sql.gz" | cut -f1)  →  db.sql.gz"

# 2. Uploads (avatares y archivos subidos)
echo "▶ [2/5] Comprimiendo uploads..."
tar -czf "$BACKUP_DIR/uploads.tar.gz" -C . backend/uploads/ 2>/dev/null || true
echo "    ✓ $(du -sh "$BACKUP_DIR/uploads.tar.gz" | cut -f1)  →  uploads.tar.gz"

# 3. Configuración (nginx, docker-compose, .env si existe)
echo "▶ [3/5] Guardando configuración..."
CONFIG_FILES="docker-compose.yml nginx/"
[ -f ".env" ] && CONFIG_FILES="$CONFIG_FILES .env"
[ -f "deploy-backend.sh" ] && CONFIG_FILES="$CONFIG_FILES deploy-backend.sh deploy-frontend.sh"
tar -czf "$BACKUP_DIR/config.tar.gz" $CONFIG_FILES 2>/dev/null
echo "    ✓ $(du -sh "$BACKUP_DIR/config.tar.gz" | cut -f1)  →  config.tar.gz"

# 4. Código fuente (git bundle — incluye todo el historial)
echo "▶ [4/5] Creando bundle de código (git)..."
git bundle create "$BACKUP_DIR/code.bundle" --all 2>/dev/null
echo "    ✓ $(du -sh "$BACKUP_DIR/code.bundle" | cut -f1)  →  code.bundle"

# 5. Frontend compilado (dist — evita recompilar al restaurar)
echo "▶ [5/5] Guardando frontend compilado..."
tar -czf "$BACKUP_DIR/dist.tar.gz" -C . frontend/dist/ 2>/dev/null || true
echo "    ✓ $(du -sh "$BACKUP_DIR/dist.tar.gz" | cut -f1)  →  dist.tar.gz"

# Metadata
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

cat > "$BACKUP_DIR/meta.json" <<EOF
{
  "version": "$VERSION",
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "description": "$DESCRIPTION",
  "git": {
    "commit": "$GIT_COMMIT",
    "branch": "$GIT_BRANCH",
    "message": "$GIT_MSG"
  },
  "contents": ["db.sql.gz", "uploads.tar.gz", "config.tar.gz", "code.bundle", "dist.tar.gz"]
}
EOF

TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Backup v$VERSION completado"
echo "     Directorio : $BACKUP_DIR"
echo "     Tamaño     : $TOTAL"
echo "     Commit     : ${GIT_COMMIT:0:12} — $GIT_MSG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
