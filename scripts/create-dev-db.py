"""
scripts/create-dev-db.py — create the dev copy's database and login (v3.86).

Run once, from a checkout:
    python scripts/create-dev-db.py

It connects with the production connection string (DATABASE_URL in .env, or
PROD_DATABASE_URL) — the RDS master login, which may create roles and
databases — and creates, if they do not exist yet:
    • a login role  helpdesk_dev  with a new random password;
    • a database    helpdesk_dev  owned by it.
It writes DEV_DATABASE_URL to .env.dev (git-ignored; Next.js never loads it)
and prints nothing secret. It never touches production's database or the other
databases on the instance. The tables come from dev's own migrations, run by
`bash deploy.sh dev`; the data from scripts/refresh-dev-db.py.
"""

import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, quote

import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parent.parent
DEV_ROLE = DEV_DB = "helpdesk_dev"


def env_file_value(path: Path, key: str):
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def libpq_url(url: str) -> str:
    """Prisma URLs may carry ?schema=…, which libpq rejects. Keep what libpq knows."""
    parts = urlsplit(url)
    keep = [(k, v) for k, v in parse_qsl(parts.query) if k in ("sslmode", "connect_timeout", "sslrootcert")]
    return urlunsplit((parts.scheme.replace("postgres", "postgresql", 1) if parts.scheme == "postgres" else parts.scheme,
                       parts.netloc, parts.path, urlencode(keep), ""))


def main():
    prod = os.environ.get("PROD_DATABASE_URL") or env_file_value(ROOT / ".env", "DATABASE_URL")
    if not prod:
        sys.exit("No production connection string: set PROD_DATABASE_URL or DATABASE_URL in .env")
    prod = libpq_url(prod)
    if urlsplit(prod).path.lstrip("/") == DEV_DB:
        sys.exit("The production URL already points at helpdesk_dev — refusing.")

    conn = psycopg2.connect(prod, connect_timeout=15)
    conn.autocommit = True  # CREATE DATABASE cannot run inside a transaction
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (DEV_ROLE,))
    password = None
    if cur.fetchone():
        print(f"role {DEV_ROLE} exists — left as it is")
    else:
        password = secrets.token_hex(24)
        cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD %s").format(sql.Identifier(DEV_ROLE)), (password,))
        print(f"role {DEV_ROLE} created")

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DEV_DB,))
    if cur.fetchone():
        print(f"database {DEV_DB} exists — left as it is")
    else:
        # The master login must be able to act as the owner to create for it.
        cur.execute(sql.SQL("GRANT {} TO CURRENT_USER").format(sql.Identifier(DEV_ROLE)))
        cur.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(DEV_DB), sql.Identifier(DEV_ROLE)))
        print(f"database {DEV_DB} created, owned by {DEV_ROLE}")
    conn.close()

    if password:
        p = urlsplit(prod)
        host = p.hostname + (f":{p.port}" if p.port else "")
        dev_url = urlunsplit((p.scheme, f"{DEV_ROLE}:{quote(password)}@{host}", f"/{DEV_DB}", p.query, ""))
        target = ROOT / ".env.dev"
        target.write_text(f'DEV_DATABASE_URL="{dev_url}"\n', encoding="utf-8")
        print(f"DEV_DATABASE_URL written to {target.name} (git-ignored)")
    else:
        print("No new password was set, so .env.dev was not rewritten.")


if __name__ == "__main__":
    main()
