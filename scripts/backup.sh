#!/bin/bash
# EmailV Backup Script
# Usage: ./backup.sh [--restore]

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="${DB_NAME:-emailv}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +%T)]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +%T)] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +%T)] ERROR:${NC} $1"; }

# Create backup directory
mkdir -p "$BACKUP_DIR"

# PostgreSQL backup
backup_postgres() {
    local filename="emailv_${DATE}.sql.gz"
    local filepath="$BACKUP_DIR/$filename"
    
    log "Starting PostgreSQL backup..."
    
    pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" | gzip > "$filepath"
    
    if [ -f "$filepath" ]; then
        local size=$(du -h "$filepath" | cut -f1)
        log "Backup complete: $filename ($size)"
        echo "$filepath"
    else
        error "Backup failed!"
        return 1
    fi
}

# Redis backup (keys)
backup_redis() {
    local filename="redis_${DATE}.rdb"
    local filepath="$BACKUP_DIR/$filename"
    
    log "Starting Redis backup..."
    
    # Get all keys and their values
    redis-cli -h "${REDIS_HOST:-localhost}" SAVE
    
    if [ -f /var/lib/redis/dump.rdb ]; then
        cp /var/lib/redis/dump.rdb "$filepath"
        log "Redis backup complete: $filename"
    else
        warn "Redis dump file not found, skipping..."
    fi
}

# Cleanup old backups
cleanup_old() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -name "emailv_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "redis_*.rdb" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    
    log "Cleanup complete"
}

# List backups
list_backups() {
    echo ""
    echo "Available backups in $BACKUP_DIR:"
    echo ""
    ls -lah "$BACKUP_DIR" | tail -n +2
    echo ""
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "Usage: $0 --restore "
        exit 1
    fi
    
    if [ ! -f "$BACKUP_DIR/$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi
    
    warn "This will OVERWRITE the current database!"
    read -p "Continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log "Restore cancelled"
        exit 0
    fi
    
    log "Restoring from $backup_file..."
    
    gunzip -c "$BACKUP_DIR/$backup_file" | psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME"
    
    log "Restore complete!"
}

# Main
case "$1" in
    --backup|-b)
        backup_postgres
        backup_redis
        cleanup_old
        ;;
    --list|-l)
        list_backups
        ;;
    --restore|-r)
        restore_backup "$2"
        ;;
    *)
        echo "EmailV Backup Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  --backup, -b    Create new backup"
        echo "  --list, -l    List available backups"
        echo "  --restore,-r   Restore from backup"
        echo ""
        echo "Environment:"
        echo "  BACKUP_DIR       Backup directory (default: ./backups)"
        echo "  DB_NAME        Database name (default: emailv)"
        echo "  DB_USER        Database user (default: postgres)"
        echo "  RETENTION_DAYS Days to keep (default: 7)"
        echo ""
        exit 0
        ;;
esac