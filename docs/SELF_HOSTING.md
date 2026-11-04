# Self-hosting olozzo on your own server (SQLite)

olozzo now uses **SQLite via Prisma**: the whole database is one file on the server's disk
(`/var/lib/olozzo/olozzo.db`). This guide moves the site from Vercel + Neon to your own server
**without losing any data** and without touching the live site until the very last step (the DNS switch).

Assumes **Ubuntu 22.04 or 24.04**, a user with `sudo`, and SSH access. Replace `SERVER_IP` with your server's IP.

| What | Where |
|---|---|
| Code | `/var/www/olozzo` (from GitHub, branch `self-hosting-sqlite`) |
| Database | `/var/lib/olozzo/olozzo.db` — outside the code folder, so deploys never touch it |
| Backups | `/var/backups/olozzo` |
| App | Next.js on `127.0.0.1:3100`, kept running by pm2 |
| Web server | nginx in front, HTTPS from Let's Encrypt |

---

## Part A — on your PC (once)

Commit the SQLite changes and push the branch so the server can download it:

```bash
cd D:/olozzo
git switch self-hosting-sqlite
git status                     # review what will be committed
git add .env.example .gitignore .gitattributes README.md package.json prisma/schema.prisma prisma/seed-catalog.ts scripts deploy docs src vercel.json
git commit -m "Move olozzo to SQLite for self-hosting"
git push -u origin self-hosting-sqlite
```

Never add database files (`*.db`), `.env` files or backups: the repository is public.

`vercel.json` turns off Vercel's automatic deployments (`git.deploymentEnabled: false`) for every commit that
contains it: pushing this branch builds nothing on Vercel, and even if it is merged into `develop` or `main`, Vercel
doesn't deploy it — **olozzo.com keeps running its current deployment on Vercel and is not affected.**
Still, merge it into `develop`/`main` only after the switch to your server (Part D).

---

## Part B — prepare the server (once)

### 1. Software

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git nginx sqlite3 curl ca-certificates certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm install -g pm2
node -v                        # must print v22.x
```

Check nothing else already uses the web ports or port 3100 (e.g. Apache from another site):

```bash
sudo ss -ltnp | grep -E ':80 |:443 |:3100 '
```

If Apache is listed on port 80/443, stop here and tell me — the nginx steps below need adapting.

### 2. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 3. Folders

```bash
sudo mkdir -p /var/www/olozzo /var/lib/olozzo /var/backups/olozzo
sudo chown -R $USER:$USER /var/www/olozzo /var/lib/olozzo /var/backups/olozzo
chmod 700 /var/lib/olozzo /var/backups/olozzo
```

### 4. Code

```bash
git clone -b self-hosting-sqlite https://github.com/nishilwork11/olozzo.git /var/www/olozzo
cd /var/www/olozzo
```

### 5. Settings (`.env`)

Generate a secret for login sessions:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the settings file:

```bash
nano /var/www/olozzo/.env
```

Paste this, putting the generated secret in `AUTH_SECRET`, then save (Ctrl+O, Enter, Ctrl+X):

```
DATABASE_URL="file:/var/lib/olozzo/olozzo.db"
AUTH_SECRET="paste-the-generated-secret-here"
NEXT_PUBLIC_APP_URL="https://www.olozzo.com"
NEXT_PUBLIC_ROOT_DOMAIN=""
ENABLE_DEMO_PAYMENTS="false"
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
MOLLIE_API_KEY=""
```

```bash
chmod 600 /var/www/olozzo/.env
```

> The secret on Vercel can't be read back, so this is a new one: anyone logged in on the old site simply logs in
> again once. Passwords are not affected (they're stored in the database).

### 6. Install and create the empty database

```bash
cd /var/www/olozzo
npm ci
npx prisma db push             # creates /var/lib/olozzo/olozzo.db with all tables
```

---

## Part C — copy the data from Neon (read-only) and test

You need the Neon connection string: **Vercel → olozzo project → Storage → olozzo-db → `.env.local` tab →
`DATABASE_URL_UNPOOLED`** (starts with `postgresql://` and ends with `neon.tech/neondb?sslmode=require`).
Neon is only **read** — nothing on the live site changes.

```bash
cd /var/www/olozzo
node scripts/postgres-to-sqlite.cjs prepare

# paste the Neon URL when asked (it isn't shown or saved in your shell history)
read -rsp "Neon URL: " SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL && echo

# 1) backup of the Neon data as JSON files (keep this — it contains customer data)
node scripts/postgres-to-sqlite.cjs backup /var/backups/olozzo/neon-json-$(date +%F)

# 2) copy everything into SQLite; it checks every table row by row at the end
node scripts/postgres-to-sqlite.cjs copy
```

The copy ends with `✔ All data copied and verified: every table matches Postgres row for row.`

### Build and start

```bash
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup                    # prints one "sudo env PATH=..." command — copy it and run it
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/login     # expect 200
```

### nginx

```bash
sudo cp deploy/nginx-olozzo.conf /etc/nginx/sites-available/olozzo
sudo ln -s /etc/nginx/sites-available/olozzo /etc/nginx/sites-enabled/olozzo
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: www.olozzo.com" http://127.0.0.1/   # expect 200
```

### Test it in your browser before going live

On your PC, open a tunnel to the server and browse it as if it were live (log in, search, check orders):

```bash
ssh -L 3100:127.0.0.1:3100 YOUR_USER@SERVER_IP
```

Then open **http://localhost:3100** on your PC. Close the tunnel with `exit` when done.

### Daily backups

```bash
bash /var/www/olozzo/deploy/backup-sqlite.sh        # test once — prints "backup ok"
crontab -e                                          # add this line at the bottom:
30 3 * * * bash /var/www/olozzo/deploy/backup-sqlite.sh >> /var/backups/olozzo/backup.log 2>&1
```

Copy `/var/backups/olozzo` off the server now and then (e.g. to your PC) so a disk failure can't take everything.

---

## Part D — go live (the only step that affects olozzo.com)

Optional, one day before: at Namecheap set the TTL of the `@` and `www` records to 5 minutes, so the switch is quick.

### 1. Take a fresh copy (orders from the last days are included)

```bash
cd /var/www/olozzo
read -rsp "Neon URL: " SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL && echo
pm2 stop olozzo
node scripts/postgres-to-sqlite.cjs copy --replace   # saves a snapshot of the test data, then copies again
pm2 start olozzo
```

### 2. Point the domain at the server (Namecheap → Domain List → olozzo.com → Advanced DNS)

| Type | Host | Value |
|---|---|---|
| A Record | `@` | `SERVER_IP` (replaces 216.198.79.1) |
| A Record | `www` | `SERVER_IP` (delete the old CNAME `www → …vercel-dns…` first) |

Check from the server until both show your IP:

```bash
dig +short olozzo.com @dns1.registrar-servers.com
dig +short www.olozzo.com @dns1.registrar-servers.com
```

### 3. HTTPS certificate (right after DNS shows the new IP)

```bash
sudo certbot --nginx -d www.olozzo.com -d olozzo.com --redirect -m YOUR_EMAIL --agree-tos -n
curl -I https://www.olozzo.com/              # expect HTTP/2 200 (or HTTP/1.1 200)
curl -I https://olozzo.com/                  # expect 301 to https://www.olozzo.com/
```

Certificates renew automatically (`sudo certbot renew --dry-run` to check).

### 4. Check nothing was missed

Visitors can still reach the old site on Vercel for a few minutes while DNS updates. Right after the switch, run:

```bash
node scripts/postgres-to-sqlite.cjs verify
unset SOURCE_DATABASE_URL
```

Look only for lines `only in Postgres …` — those are orders/users created on the old site after your copy. If any
appear, **don't** run `copy --replace` (that would remove new orders on the server) — send me the output instead.

### 5. Afterwards

- Keep the Vercel project and Neon database for a week or two as a fallback: to roll back, point the two DNS
  records back to Vercel (`@` → `216.198.79.1`, `www` CNAME → the value Vercel shows under Settings → Domains).
- When you're sure, remove the domain in Vercel (Settings → Domains).

---

## Deploying updates later

```bash
cd /var/www/olozzo
bash deploy/backup-sqlite.sh                # backup first
git pull
npm ci
npx prisma db push                          # applies database changes; it stops and asks if data would be lost
npm run build
pm2 reload olozzo
```

## Useful commands

```bash
pm2 status                  # is it running?
pm2 logs olozzo             # live logs (Ctrl+C to leave)
pm2 restart olozzo
sqlite3 /var/lib/olozzo/olozzo.db "SELECT COUNT(*) FROM \"Order\";"     # quick look at the data
```

Restore a backup: `pm2 stop olozzo`, then
`gunzip -c /var/backups/olozzo/olozzo-<date>.db.gz > /var/lib/olozzo/olozzo.db`, then `pm2 start olozzo`.
