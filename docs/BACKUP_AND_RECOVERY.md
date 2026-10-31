# Database Backup and Recovery

Patient records are clinical data. Back them up daily, keep copies off the database host, encrypt them, and test restores regularly.

## What to back up

| Item | Why |
|------|-----|
| PostgreSQL database `hospital_db` | All patients, check-ups, follow-ups, users and the audit trail |
| `backend/.env` or the Compose `.env` (stored separately, e.g. in a vault) | `SECRET_KEY` and database credentials |

The application stores no files on disk; PDFs and spreadsheets are generated on demand.

## Daily logical backup (pg_dump)

Custom format (`-Fc`) is compressed and supports selective restore.

**Local PostgreSQL (Windows PowerShell):**

```powershell
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
New-Item -ItemType Directory -Force backups | Out-Null
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U hospital_app -d hospital_db -Fc -f "backups\hospital_db_$stamp.dump"
```

Use a `pgpass.conf` file (`%APPDATA%\postgresql\pgpass.conf`) rather than putting the password on the command line. Schedule the command with Windows Task Scheduler.

**Docker Compose (Linux host, cron):**

```bash
docker compose exec -T db pg_dump -U hospital_app -d hospital_db -Fc > backups/hospital_db_$(date +%Y%m%d_%H%M).dump
```

Example crontab entry for 01:30 every day, keeping 30 days:

```cron
30 1 * * * cd /opt/hospital && docker compose exec -T db pg_dump -U hospital_app -d hospital_db -Fc > backups/hospital_db_$(date +\%Y\%m\%d).dump && find backups -name '*.dump' -mtime +30 -delete
```

Encrypt before copying off-site, for example `gpg --symmetric --cipher-algo AES256 file.dump`, and keep at least one copy in a different building or a government-approved cloud location.

## Point-in-time recovery (recommended for production)

Daily dumps can lose up to a day of work. For production, also enable WAL archiving (`archive_mode = on`, `archive_command`) or use a tool such as pgBackRest or Barman. These let you restore to any moment before an incident.

## Restore

1. Stop the API so nothing writes during the restore (`docker compose stop backend`).
2. Restore into a **new, empty** database first and verify it:

```bash
createdb -U postgres -O hospital_app hospital_db_restore
pg_restore -U hospital_app -d hospital_db_restore --no-owner --exit-on-error backups/hospital_db_YYYYMMDD.dump
```

3. Verify the counts match expectations:

```sql
SELECT (SELECT count(*) FROM patients) AS patients,
       (SELECT count(*) FROM eye_checkups) AS checkups,
       (SELECT max(created_at) FROM audit_logs) AS last_audit_entry;
```

4. Point `DATABASE_URL` at the restored database (or rename databases), then run `alembic upgrade head` in case the backup predates the latest migration.
5. Start the API and sign in to spot-check a few patient records.

## Restore testing

Restore the latest backup into a scratch database at least once a month and record the result. A backup that has never been restored is not a verified backup.

## Notes on data handling

- Patient records are soft-deleted (`is_active = false`); clinical tables use `ON DELETE RESTRICT`, so history cannot be cascaded away.
- The `audit_logs` table is append-only, enforced by a database trigger.
- Never restore production backups into development or test databases. The automated test suite only runs against a database whose name contains `test` and truncates it between tests.
