"""
scripts/refresh-dev-db.py — copy production's data into the dev database (v3.86).

Run from a checkout whenever dev should look like production again:
    python scripts/refresh-dev-db.py

Production's connection string comes from PROD_DATABASE_URL, or DATABASE_URL
in .env; dev's from DEV_DATABASE_URL, or .env.dev (written by
scripts/create-dev-db.py).

  • Production is opened READ-ONLY. Nothing is ever written there.
  • Dev is emptied and refilled table by table with COPY, parents before
    children, in ONE transaction: a failure leaves dev exactly as it was.
  • Sequences are moved past the copied rows, so the next ticket opened on dev
    continues production's numbering.
  • The schema is not copied. Dev's own migrations build it (`bash deploy.sh
    dev`), so deploy dev first after any migration — the script stops if a
    table or column is missing on dev.
  • API keys are not copied (v3.88). Dev keeps its own ApiKey rows, and
    production's never come over: a production key — even one revoked in
    production since — must not open the dev copy, whose data is production's.

Attachments and printer drivers live on disk, not in the database. Copy them on
the server:
    ssh ubuntu@18.195.248.157 'rsync -a --delete /home/ubuntu/helpdesk/uploads/ /home/ubuntu/helpdesk-dev/uploads/'
"""

import io
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"_prisma_migrations"}
# Neither emptied nor copied: the dev copy's own API keys (v3.88).
KEEP_DEV = {"ApiKey"}


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
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(keep), ""))


def tables(cur):
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    return {r[0] for r in cur.fetchall()} - SKIP


def columns(cur, table):
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position", (table,))
    return [r[0] for r in cur.fetchall()]


def parents_first(cur, names):
    """Order tables so every table comes after the tables its foreign keys point at."""
    cur.execute("""
        SELECT child.relname, parent.relname
        FROM pg_constraint c
        JOIN pg_class child  ON child.oid  = c.conrelid
        JOIN pg_class parent ON parent.oid = c.confrelid
        JOIN pg_namespace n  ON n.oid = child.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
    """)
    deps = {t: set() for t in names}
    for child, parent in cur.fetchall():
        if child in deps and parent in deps and child != parent:
            deps[child].add(parent)
    ordered, done = [], set()
    while len(ordered) < len(names):
        ready = sorted(t for t in names if t not in done and deps[t] <= done)
        if not ready:
            sys.exit(f"Circular foreign keys among: {sorted(set(names) - done)}")
        ordered += ready
        done |= set(ready)
    return ordered


def main():
    prod = os.environ.get("PROD_DATABASE_URL") or env_file_value(ROOT / ".env", "DATABASE_URL")
    dev = os.environ.get("DEV_DATABASE_URL") or env_file_value(ROOT / ".env.dev", "DEV_DATABASE_URL")
    if not prod or not dev:
        sys.exit("Need both connection strings: PROD_DATABASE_URL (or DATABASE_URL in .env) and "
                 "DEV_DATABASE_URL (or .env.dev).")
    prod, dev = libpq_url(prod), libpq_url(dev)

    p, d = urlsplit(prod), urlsplit(dev)
    if (p.hostname, p.port, p.path) == (d.hostname, d.port, d.path):
        sys.exit("The dev URL is the production database — refusing.")
    if "dev" not in d.path:
        sys.exit(f"The dev database is called {d.path.lstrip('/')!r}, not a dev name — refusing.")

    src = psycopg2.connect(prod, connect_timeout=15)
    src.set_session(readonly=True)
    dst = psycopg2.connect(dev, connect_timeout=15)
    s, t = src.cursor(), dst.cursor()

    # `names` is both what is emptied and what is copied — KEEP_DEV is in neither.
    names = tables(s) - KEEP_DEV
    missing = names - tables(t)
    if missing:
        sys.exit(f"Dev lacks tables {sorted(missing)} — run `bash deploy.sh dev` first, so its migrations run.")

    order = parents_first(t, names)
    try:
        t.execute(sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(
            sql.SQL(", ").join(sql.Identifier(n) for n in order)))
        for name in order:
            cols = columns(s, name)
            lacking = set(cols) - set(columns(t, name))
            if lacking:
                raise SystemExit(f"Dev table {name} lacks columns {sorted(lacking)} — deploy dev first.")
            col_list = sql.SQL(", ").join(sql.Identifier(c) for c in cols)
            buf = io.BytesIO()
            s.copy_expert(sql.SQL("COPY {} ({}) TO STDOUT").format(sql.Identifier(name), col_list).as_string(src), buf)
            buf.seek(0)
            t.copy_expert(sql.SQL("COPY {} ({}) FROM STDIN").format(sql.Identifier(name), col_list).as_string(dst), buf)
            s.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(name)))
            print(f"  {name}: {s.fetchone()[0]} rows")
        print(f"  kept as they were on dev, not copied: {', '.join(sorted(KEEP_DEV))}")

        # Move every sequence past the rows just copied (Ticket.ticketNumber among them).
        t.execute("""
            SELECT table_name, column_name, pg_get_serial_sequence(format('%I', table_name), column_name)
            FROM information_schema.columns
            WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'
        """)
        for table, column, seq in t.fetchall():
            if not seq:
                continue
            t.execute(sql.SQL("SELECT setval(%s, COALESCE((SELECT max({}) FROM {}), 0) + 1, false)").format(
                sql.Identifier(column), sql.Identifier(table)), (seq,))
        dst.commit()
    except BaseException:
        dst.rollback()
        raise
    finally:
        src.close()
        dst.close()
    print("Dev database refreshed from production.")
    print("Files: ssh ubuntu@18.195.248.157 'rsync -a --delete /home/ubuntu/helpdesk/uploads/ /home/ubuntu/helpdesk-dev/uploads/'")


if __name__ == "__main__":
    main()
