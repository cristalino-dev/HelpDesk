export interface Ticket {
  id: string
  subject: string
  description: string
  phone: string
  computerName: string
  urgency: string
  category: string
  status: string
  createdAt: string
  updatedAt: string
  userId: string
}

export interface TicketWithUser extends Ticket {
  user?: {
    name?: string | null
    email?: string | null
  }
}
