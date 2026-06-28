/**
 * types/printer.ts — Shared Printer type definitions
 *
 * Shape of printer data as it travels DB → API → client. Date fields are
 * strings because they are serialized to JSON by the API route.
 */

export interface PrinterDriver {
  id: string
  printerId: string
  filename: string       // original filename shown to the user
  storedName: string     // on-disk name (not really needed client-side)
  size: number           // bytes
  mimeType?: string | null
  createdAt: string
}

export interface Printer {
  id: string
  name: string
  maker?: string | null
  model?: string | null
  supplier?: string | null
  ipv4?: string | null
  hostname?: string | null
  inkToner?: string | null
  tonerLevel?: number | null  // 0–100 percentage of toner/ink remaining
  createdAt: string
  updatedAt: string
  drivers: PrinterDriver[]
}
