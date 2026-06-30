export type WebApiQuery = Record<string, string | number | boolean | null | undefined>

export class ParlyWebApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: {
      bearerToken?: string
      cookieHeader?: string
    } = {}
  ) {}

  async getJson<T>(path: string, query: WebApiQuery = {}): Promise<T> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
    }
    return this.requestJson<T>("GET", url)
  }

  async postJson<T>(path: string, body: unknown = {}): Promise<T> {
    return this.requestJson<T>("POST", new URL(path, this.baseUrl), body)
  }

  private async requestJson<T>(method: "GET" | "POST", url: URL, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(this.auth.bearerToken ? { authorization: `Bearer ${this.auth.bearerToken}` } : {}),
        ...(this.auth.cookieHeader ? { cookie: this.auth.cookieHeader } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : `Parly API request failed with HTTP ${response.status}.`
      throw new Error(message)
    }
    return payload as T
  }
}
