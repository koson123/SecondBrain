#!/bin/sh
set -eu
# Run from the checkout directory. Destination credentials belong in the environment.
: "${DATA_DIR:?Set DATA_DIR to your application data directory}"
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY to a separate-device or off-site repository}"
: "${RESTIC_PASSWORD_FILE:?Keep the repository password in a restricted file}"
: "${BACKUP_KIND:?Set BACKUP_KIND to separate-device or offsite}"
case "$BACKUP_KIND" in separate-device|offsite) ;; *) echo 'Invalid BACKUP_KIND' >&2; exit 1;; esac
umask 077
snapshot_dir=$(node scripts/snapshot.mjs)
restic backup "$snapshot_dir" --tag secondbrain --tag "$BACKUP_KIND"
restic check
node --input-type=module - <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const p=join(process.env.DATA_DIR,'backup-status.json');const status=JSON.parse(readFileSync(p,'utf8'));status[process.env.BACKUP_KIND==='offsite'?'lastOffsite':'lastIndependentBackup']=new Date().toISOString();if(process.env.BACKUP_KIND==='offsite')status.offsite='Last job completed; repository checked';writeFileSync(p,JSON.stringify(status));
JS
# Enable retention deliberately after verifying the destination and restoring a snapshot.
if [ "${ENABLE_RETENTION:-false}" = true ]; then
 restic forget --tag secondbrain --tag "$BACKUP_KIND" --group-by host,tags --keep-hourly 48 --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune
fi
