let cachedToken: { token: string; expiresAt: number } | null = null

export async function getZohoAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error("Failed to refresh Zoho token")

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55 minutes
  }

  return cachedToken.token
}

export async function zohoRequest(method: string, path: string, body?: Record<string, unknown>) {
  const token = await getZohoAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const res = await fetch(`https://desk.zoho.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return res.json()
}
