# Hosting on AWS Lightsail

The site runs on one small Lightsail server: Node runs the Next.js app as a
systemd service, Caddy serves it over HTTPS, and the SQLite database is a file
on the server's disk.

| | |
|---|---|
| Web address | https://44-196-166-160.sslip.io |
| Admin password | `.env.server` in this repo (not committed) |
| Server | Lightsail `hcdgcstats-web`, 1 GB plan ($7/month), `us-east-1a`, Ubuntu 24.04 |
| Static IP | `hcdgcstats-ip` → 44.196.166.160 |
| SSH key | `~/.ssh/hcdgcstats-lightsail` (Lightsail key pair `hcdgcstats`) |
| App | `/opt/hcdgcstats`, service `hcdgcstats` |
| Settings | `/opt/hcdgcstats/.env.production.local` (same format as `.env.local`) |
| Database | `/var/lib/hcdgcstats/hcdgc.db` |
| Backups | Lightsail automatic snapshot of the whole server, daily at 07:00 UTC |

The hosted database is separate from your local `data/hcdgc.db`. Do imports and
member changes on the hosted admin page from now on.

## Deploying changes

Commit your changes, then from the repo root:

```bash
deploy/deploy.sh
```

It uploads the code, builds it on the server (about 2 minutes) and restarts the
site. Settings and the database are left as they are.

## Connecting to the server

```bash
ssh -i ~/.ssh/hcdgcstats-lightsail ubuntu@44.196.166.160
```

Useful there:

```bash
systemctl status hcdgcstats          # is the site running?
journalctl -u hcdgcstats -n 100      # recent site logs
sudo systemctl restart hcdgcstats    # restart after editing settings
```

## Changing settings

Edit `/opt/hcdgcstats/.env.production.local` on the server
(`sudo nano /opt/hcdgcstats/.env.production.local`), then restart the service.
As in `.env.local`, write any `$` in a value as `\$`. If you change
`ADMIN_PASSWORD`, update `.env.server` here too so you have a copy.

## Backups and restoring

Lightsail keeps a daily snapshot of the whole server (see Lightsail →
`hcdgcstats-web` → Snapshots). To restore one, create a new instance from it
in the console and move the static IP `hcdgcstats-ip` to it.

To grab a copy of just the database onto your Mac:

```bash
ssh -i ~/.ssh/hcdgcstats-lightsail ubuntu@44.196.166.160 \
  'sudo sqlite3 /var/lib/hcdgcstats/hcdgc.db ".backup /tmp/hcdgc.db" && sudo chmod 644 /tmp/hcdgc.db'
scp -i ~/.ssh/hcdgcstats-lightsail ubuntu@44.196.166.160:/tmp/hcdgc.db ./hcdgc-backup.db
```

## Using a real domain

Point the domain's DNS `A` record at 44.196.166.160, then re-run the setup
script with the new name (it only updates what changed):

```bash
ssh -i ~/.ssh/hcdgcstats-lightsail ubuntu@44.196.166.160 'sudo bash -s stats.example.org' < deploy/setup-server.sh
```

Caddy gets the HTTPS certificate for it automatically.

## Setting up a new server

1. Create an Ubuntu 24.04 Lightsail instance with the `hcdgcstats` key pair,
   attach a static IP, and open ports 80 and 443.
2. `ssh -i ~/.ssh/hcdgcstats-lightsail ubuntu@IP 'sudo bash -s HOSTNAME' < deploy/setup-server.sh`
3. Put the settings file at `/opt/hcdgcstats/.env.production.local`
   (owner `hcdgc`, mode 600) with `ADMIN_PASSWORD`, `PDGA_USERNAME`,
   `PDGA_PASSWORD` and `DATABASE_PATH=/var/lib/hcdgcstats/hcdgc.db`.
4. Optionally copy a database to `/var/lib/hcdgcstats/hcdgc.db` (owner `hcdgc`).
5. `SERVER=IP deploy/deploy.sh`

## Ending the trial

Billing stops once these are gone (the static IP is only free while attached):

```bash
aws lightsail delete-instance --instance-name hcdgcstats-web
aws lightsail release-static-ip --static-ip-name hcdgcstats-ip
aws lightsail delete-key-pair --key-pair-name hcdgcstats
```

Automatic snapshots are deleted with the instance; any manual snapshots need
deleting separately in the Lightsail console. Grab a database copy first if
you want to keep the data.
