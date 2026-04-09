/**
 * lib/db.ts — Prisma Client Singleton
 *
 * WHY A SINGLETON?
 * ─────────────────
 * Next.js with hot-reloading (dev mode) re-evaluates module files on every
 * change. If we simply wrote `export const prisma = new PrismaClient()`,
 * each hot-reload would create a new database connection pool, quickly
 * exhausting the PostgreSQL connection limit (default: 100 on AWS RDS free
 * tier). The singleton pattern prevents this by reusing the same client
 * instance across hot-reloads.
 *
 * HOW IT WORKS:
 * ─────────────
 * 1. We cast `globalThis` to an object that may hold a `prisma` property.
 * 2. On first load, `globalForPrisma.prisma` is undefined → we create a new
 *    PrismaClient and store it on `globalThis`.
 * 3. On subsequent hot-reloads, `globalForPrisma.prisma` already exists →
 *    we reuse it (the `??` operator short-circuits).
 * 4. In production builds there is no hot-reloading, so we skip the global
 *    assignment entirely (keeps the production footprint clean).
 *
 * USAGE:
 * ──────
 *   import { prisma } from "@/lib/db"
 *   const user = await prisma.user.findUnique({ where: { email } })
 */

import { PrismaClient } from "@prisma/client"

/**
 * Extend globalThis with an optional `prisma` slot so TypeScript
 * doesn't complain about an unknown property.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

/**
 * The application-wide Prisma Client instance.
 * All database access goes through this exported constant.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Cache the instance on globalThis only in development so it survives
// Next.js hot-module-replacement cycles without leaking connections.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
