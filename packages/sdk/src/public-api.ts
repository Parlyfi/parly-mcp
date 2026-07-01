export type PublicApiAuth = {
  bearerToken?: string
}

export type PublicApiQuery = Record<string, string | number | boolean | null | undefined>

export type PrivacyLinkKind = "profile" | "invoice"
export type PublicPaymentContext = {
  linkKind?: PrivacyLinkKind
  slug?: string
}

/**
 * Requires the same owner wallet signature accepted by the Parly web app.
 * Create and edit both republish signed public metadata; this client cannot
 * bypass owner approval.
 */
export type PrivacyLinkPublishInput = {
  metadata: Record<string, unknown>
  message: string
  ownerWallet: `0x${string}`
  recipientRecoveryPublicKeyB64: string
  signature: `0x${string}`
  slug: string
}

export type CreateProfileLinkInput = PrivacyLinkPublishInput
export type EditProfileLinkInput = PrivacyLinkPublishInput
export type CreateInvoiceLinkInput = PrivacyLinkPublishInput
export type EditInvoiceLinkInput = PrivacyLinkPublishInput
export type PrivacyLinkOwnerSignedInput = {
  message: string
  ownerWallet: `0x${string}`
  signature: `0x${string}`
}
export type PrivacyLinkClaimInput = PrivacyLinkOwnerSignedInput & {
  kind: PrivacyLinkKind
  slug: string
}
export type PrivacyLinkVisibilityInput = PrivacyLinkOwnerSignedInput & {
  kind: PrivacyLinkKind
  slug: string
  status: "active" | "paused" | "deleted"
}

export type PublicApiResponse<T> = T & {
  ok?: boolean
  error?: string
}

export type BatchCsvRow = {
  destination: `0x${string}`
  amount: string
  asset: string
}

export class ParlyPublicApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: PublicApiAuth = {}
  ) {}

  status(query: { kind: PrivacyLinkKind; slug: string }) {
    return this.get<PublicApiResponse<{ available?: boolean; kind: PrivacyLinkKind; slug: string }>>(
      "/api/phase3/privacy-links/status",
      query
    )
  }

  checkPrivacyLinkStatus(query: { kind: PrivacyLinkKind; slug: string }) {
    return this.status(query)
  }

  claimPrivacyLinkName(input: PrivacyLinkClaimInput) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/claim", input)
  }

  listOwnedPrivacyLinks(input: PrivacyLinkOwnerSignedInput & { window?: "24h" | "7d" | "30d" }) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/owned", input)
  }

  updatePrivacyLinkVisibility(input: PrivacyLinkVisibilityInput) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/status", input)
  }

  reportPrivacyLink(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/report", body)
  }

  readPrivacyLinkSocialStatus(query: PublicApiQuery = {}) {
    return this.get<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/social-status", query)
  }

  createPrivacyImageUploadUrl(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/image-upload", body)
  }

  readProfileLink(slug: string) {
    return this.get<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/public", {
      kind: "profile",
      slug
    })
  }

  readInvoiceLink(slug: string) {
    return this.get<PublicApiResponse<Record<string, unknown>>>("/api/phase3/privacy-links/public", {
      kind: "invoice",
      slug
    })
  }

  createProfileLink(input: CreateProfileLinkInput) {
    return this.publishPrivacyLink("profile", input)
  }

  editProfileLink(input: EditProfileLinkInput) {
    return this.publishPrivacyLink("profile", input)
  }

  createInvoiceLink(input: CreateInvoiceLinkInput) {
    return this.publishPrivacyLink("invoice", input)
  }

  editInvoiceLink(input: EditInvoiceLinkInput) {
    return this.publishPrivacyLink("invoice", input)
  }

  createOneTimeDeposit(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/one-time-deposit", body)
  }

  createProfileOneTimeAddress(body: Record<string, unknown>) {
    return this.createOneTimeDeposit({ ...body, linkKind: "profile" satisfies PrivacyLinkKind })
  }

  createInvoiceOneTimeAddress(body: Record<string, unknown>) {
    return this.createOneTimeDeposit({ ...body, linkKind: "invoice" satisfies PrivacyLinkKind })
  }

  quoteWalletDeposit(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/wallet-deposit", body)
  }

  prepareProfilePayment(body: Record<string, unknown>) {
    return this.quoteWalletDeposit({ ...body, linkKind: "profile" satisfies PrivacyLinkKind })
  }

  prepareInvoicePayment(body: Record<string, unknown>) {
    return this.quoteWalletDeposit({ ...body, linkKind: "invoice" satisfies PrivacyLinkKind })
  }

  verifyInvoiceReceipt(body: { token: string }) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/verify/invoice", body)
  }

  verifyPayoutScope(body: { childKey: string; txHash: `0x${string}` }) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/verify/payout", body)
  }

  receiptDownloadUrl(body: { statusAccessToken: string }) {
    return this.post<PublicApiResponse<{ available: boolean; url?: string }>>(
      "/api/phase3/receipt-download",
      body
    )
  }

  createReceiptDownloadUrl(body: { statusAccessToken: string }) {
    return this.receiptDownloadUrl(body)
  }

  readPaymentStatus(body: { statusAccessToken: string }) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/payment-status", body)
  }

  readPayoutStatus(body: { statusAccessToken: string }) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/payout-status", body)
  }

  readPayerHistory(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/payer-history", body)
  }

  claimRefund(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/phase3/refund-claim", body)
  }

  readUiSettings() {
    return this.get<PublicApiResponse<Record<string, unknown>>>("/api/phase3/ui-settings")
  }

  listRelayers(query: PublicApiQuery = {}) {
    return this.get<PublicApiResponse<Record<string, unknown>>>("/api/relayers", query)
  }

  startRelayerRegistration(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/relayers/register/init", body)
  }

  confirmRelayerRegistration(body: Record<string, unknown>) {
    return this.post<PublicApiResponse<Record<string, unknown>>>("/api/relayers/register/confirm", body)
  }

  parseBatchCsv(csv: string): BatchCsvRow[] {
    const rows = csv
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)

    const dataRows = rows[0]?.toLowerCase().includes("destination") ? rows.slice(1) : rows
    if (dataRows.length < 1 || dataRows.length > 10) {
      throw new Error("Batch CSV must contain 1 to 10 payment rows.")
    }

    return dataRows.map((row, index) => {
      const [destination = "", amount = "", asset = ""] = row.split(",").map((value) => value.trim())
      if (!/^0x[a-fA-F0-9]{40}$/u.test(destination)) {
        throw new Error(`Batch CSV row ${index + 1} has an invalid destination.`)
      }
      if (!/^\d+(\.\d{1,6})?$/u.test(amount) || Number(amount) <= 0) {
        throw new Error(`Batch CSV row ${index + 1} has an invalid amount.`)
      }
      if (!/^(USDC|USDC\.e|USDT|USDT0)$/u.test(asset)) {
        throw new Error(`Batch CSV row ${index + 1} has an unsupported asset.`)
      }
      return { destination: destination as `0x${string}`, amount, asset }
    })
  }

  private publishPrivacyLink(kind: PrivacyLinkKind, input: PrivacyLinkPublishInput) {
    return this.post<PublicApiResponse<{ kind: PrivacyLinkKind; metadata: Record<string, unknown>; slug: string; status: string }>>(
      "/api/phase3/privacy-links/publish",
      {
        ...input,
        kind
      }
    )
  }

  private async get<T>(path: string, query: PublicApiQuery = {}) {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
    }
    return this.request<T>("GET", url)
  }

  private async post<T>(path: string, body: unknown = {}) {
    return this.request<T>("POST", new URL(path, this.baseUrl), body)
  }

  private async request<T>(method: "GET" | "POST", url: URL, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(this.auth.bearerToken ? { authorization: `Bearer ${this.auth.bearerToken}` } : {})
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
