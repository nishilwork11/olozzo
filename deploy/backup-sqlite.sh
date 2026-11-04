#!/usr/bin/env bash
# Backs up the olozzo SQLite database (see docs/SELF_HOSTING.md). Safe while the site is running:
# sqlite3 ".backup" takes a consistent copy. Each copy is integrity-checked, gzipped and kept KEEP_DAYS days.
#   bash /var/www/olozzo/deploy/backup-sqlite.sh
set -euo pipefail

DB="${DB:-/var/lib/olozzo/olozzo.db}"
DIR="${BACKUP_DIR:-/var/backups/olozzo}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$DIR"
OUT="$DIR/olozzo-$(date +%F-%H%M%S).db"
sqlite3 "$DB" ".backup '$OUT'"
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "$(date -Is) BACKUP FAILED integrity check: $OUT" >&2
  exit 1
fi
gzip -f "$OUT"
find "$DIR" -maxdepth 1 -name 'olozzo-*.db.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"
