# Deployment, backup, and recovery

## Before real personal data

1. Choose the host, dedicated data storage, HTTPS hostname, and VPN access path. Do not assume a VM ID or change other services.
2. Set a strong setup token, create the owner account, then remove the token from routine environment configuration if desired. Existing accounts do not need it to sign in.
3. Configure HTTPS and secure cookies. Verify unauthenticated API and attachment downloads are rejected.
4. Verify the persistent data path and free disk space. Export/media size determines capacity more than note count.
5. Configure one backup repository on a physically separate device and another encrypted repository off-site. Store recovery passwords separately from the app host.
6. Restore a backup into a separate directory and verify notes, journals, conversation branches, history, and attachments.
7. Configure an independent host-down/backup-age monitor using a destination you explicitly choose. The application cannot report its own total outage.

## restic job

Install restic on the host running the job. Initialize repositories once after verifying their locations. Keep credentials in restricted files/environment, never in this repository. A destination label is not proof that a destination is independent: verify the physical failure boundary yourself.

Example environment for a backup runner:

```bash
export DATA_DIR=/srv/secondbrain/data
export RESTIC_REPOSITORY=/mnt/separate-device/secondbrain
export RESTIC_PASSWORD_FILE=/etc/secondbrain/local-backup-password
export BACKUP_KIND=separate-device
sh scripts/backup.sh
```

For an off-site repository use its configured restic backend, credentials, a separate password file, and `BACKUP_KIND=offsite`. Repository initialization and encryption-key recovery must be tested before calling this protected. A restic repository is encrypted; a plaintext local snapshot or portable ZIP is not.

For Docker named volumes, run the snapshot command inside the app container and expose the produced bundle to the host backup runner, or use a verified bind mount with permissions matching UID 1000. Do not assume host `./data` is the Compose named volume.

Schedule separate-device jobs hourly and off-site jobs nightly, e.g. 02:15 in the host’s explicitly configured local timezone. Use cron/systemd on the backup host; the app does not silently install schedules. Prevent overlapping jobs with a host-level lock. Send job exit failures and stale success timestamps to the chosen independent monitor. The application status shows the last recorded job success and its age, not a guarantee of recoverability.

After a successful restore exercise, `ENABLE_RETENTION=true` enables restic retention: 48 hourly, 30 daily, 12 weekly, 12 monthly points, grouped by host/tags rather than unique snapshot-directory path. Verify how that retention applies to each repository before enabling pruning.

Application-generated local snapshot directories are not automatically pruned. Monitor space and remove old local staging snapshots only after independent backups and a restore drill succeed. No automatic permanent deletion of note/attachment data is implemented.

Weekly repository checks and monthly rotating `restic check --read-data-subset` jobs should complement quarterly restore drills. Metadata checks alone do not read every stored data block. Recovery time depends on host/network size; measure it instead of assuming a deadline.

## Backup failure semantics

A failed restic command exits nonzero and must be captured by the external scheduler. A previously recorded success timestamp does not change on failure. Settings must be read as a timestamp; a stale success is not a successful new backup. Source originals, attachment objects, and database contents are included in consistent snapshots. The server writes immutable objects before committing their references and does not garbage-collect those objects during snapshots.

## Password recovery

There is no email recovery service. With local server access, first take a snapshot, stop the app, and use a local administrative script to replace the owner hash and revoke sessions:

```bash
node --env-file-if-exists=.env scripts/reset-password.mjs
```

The script reads the new password from standard input; use it on a trusted terminal. It does not print the password. Server administrators can read database content; private hosting is not end-to-end encryption.

## Upgrades

Take and verify a snapshot before upgrading, record the old app image/commit, install/build pinned dependencies, then start the new version. Roll back by restoring the matching snapshot into a new data directory and running the matching app version. Never downgrade against an unknown newer schema. Keep source code backups separate from personal data backups.
