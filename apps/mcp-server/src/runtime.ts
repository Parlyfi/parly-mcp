import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  ParlyMppAdapter,
  ParlySDK,
  type ExecutePaymentParams,
  type ExecutePaymentOutcome,
  type MppSessionRecord,
  type MppSessionSpec,
  type MppSettlementRequest
} from "@parly/sdk"
import { z } from "zod"
import { assertMcpConfig, type McpRuntimeConfig } from "./smoke-config.js"
import { ParlyWebApiClient } from "./web-api-client.js"

const MCP_VERSION = "16.9.9-mcp.0"
const MCP_NAME = "parly-mcp"
const MCP_SUPPORTED_TOOLS = [
  "recover_largest_note",
  "preflight_shielded_payment",
  "send_shielded_payment",
  "execute_shielded_payment",
  "mpp_create_session",
  "mpp_preflight_session_payment",
  "mpp_settle_session_payment"
] as const
const MCP_WEB_API_TOOLS = [
  "privacy_link_status",
  "privacy_link_public_read",
  "privacy_link_owned_list",
  "privacy_link_claim",
  "privacy_link_publish",
  "privacy_link_visibility",
  "privacy_link_report",
  "privacy_link_social_status",
  "payment_one_time_deposit_create",
  "payment_wallet_deposit_quote",
  "payment_status_read",
  "payout_status_read",
  "refund_claim",
  "verify_invoice_receipt",
  "relayer_list",
  "relayer_register_init",
  "relayer_register_confirm",
  "admin_operations_summary",
  "admin_reports_list",
  "admin_reserved_names_list",
  "admin_payout_queue",
  "admin_operations_action",
  "admin_ui_settings",
  "telegram_status",
  "telegram_disconnect"
] as const

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const assetIdSchema = z.union([z.literal(1), z.literal(2)])
const addressSchema = z
  .string()
  .regex(ADDRESS_RE, "Must be a 20-byte hex address.")
  .refine((value) => value.toLowerCase() !== ZERO_ADDRESS, "Must not be the zero address.")
const amountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Amount must be a positive decimal string with up to 6 decimals.")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero.")

const mppSessionSchema = z.object({
  version: z.literal(1),
  protocol: z.literal("parly"),
  settlementMode: z.literal("parly-private-immediate"),
  serviceName: z.string().min(1),
  serviceVersion: z.string().min(1),
  sessionId: z.string().min(1),
  counterparty: addressSchema,
  assetId: assetIdSchema,
  spendLimit: amountSchema,
  destinationEid: z.number().int().positive(),
  poolAddress: addressSchema,
  status: z.literal("created")
})
const shieldedPaymentSchema = z.object({
  destination: addressSchema,
  amount: amountSchema,
  assetId: assetIdSchema,
  destinationEid: z.number().int().positive(),
  poolAddress: addressSchema,
  proofAssetsBasePath: z.string().min(1).optional()
})
const webApiGetSchema = z.object({
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
})
const webApiPostSchema = z.object({
  body: z.record(z.unknown()).optional()
})

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function formatStableAmount(raw: bigint | string) {
  const amount = BigInt(raw)
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const whole = absolute / 1_000_000n
  const fraction = String(absolute % 1_000_000n).padStart(6, "0").replace(/0+$/u, "")
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`
}

function jsonToolResponse(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  }
}

function jsonToolError(tool: string, error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "error",
            tool,
            message: normalizeError(error)
          },
          null,
          2
        )
      }
    ],
    isError: true as const
  }
}

function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  }
}

function summarizeOutcome(outcome: ExecutePaymentOutcome) {
  if (outcome.kind === "success") {
    return {
      ...outcome,
      verificationMode: "lane-scoped",
      followUp:
        "Use the confirmed Tempo transaction hash plus one disclosed child key to verify a single payout lane."
    }
  }

  if (outcome.kind === "pending_confirmation") {
    return {
      ...outcome,
      verificationMode: "lane-scoped",
      followUp:
        "Wait for confirmation or run the pending reconciler. When finalized, use the Tempo transaction hash plus one disclosed child key to verify a single payout lane."
    }
  }

  return {
    ...outcome,
    verificationMode: "lane-scoped",
    followUp: null
  }
}

export type ParlyMcpRuntime = {
  config: McpRuntimeConfig
  sdk: ParlySDK
  adapter: ParlyMppAdapter | null
  webApi: ParlyWebApiClient | null
  server: McpServer
  toolNames: string[]
  resourceUris: string[]
}

export function buildParlyMcpRuntime(env: NodeJS.ProcessEnv = process.env): ParlyMcpRuntime {
  const config = assertMcpConfig(env)
  const sdk = new ParlySDK({
    privateKeyHex: config.agentPrivateKey,
    tempoRpcUrl: config.tempoRpcUrl,
    tempoChainId: config.tempoChainId,
    tempoLzEid: config.settlementDomainId,
    ponderGraphqlUrl: config.ponderGraphqlUrl,
    proofAssetsBasePath: config.proofAssetsBasePath
  })

  const adapter =
    config.enableMppAdapter && config.mppServiceName && config.mppServiceVersion
      ? new ParlyMppAdapter(sdk, {
          serviceName: config.mppServiceName,
          serviceVersion: config.mppServiceVersion
        })
      : null
  const webApi = config.webApiBaseUrl
    ? new ParlyWebApiClient(config.webApiBaseUrl, {
        bearerToken: config.webApiBearerToken,
        cookieHeader: config.webApiCookieHeader
      })
    : null

  const server = new McpServer({
    name: MCP_NAME,
    version: MCP_VERSION
  })

  const toolNames: string[] = []
  const resourceUris: string[] = []

  function registerTool(
    name: string,
    config: {
      title: string
      description: string
      inputSchema?: z.ZodTypeAny
    },
    handler: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: true }>
  ) {
    toolNames.push(name)
    server.registerTool(name, config, handler)
  }

  function registerStaticResource(
    name: string,
    uri: string,
    title: string,
    description: string,
    payloadFactory: () => unknown
  ) {
    resourceUris.push(uri)
    server.registerResource(
      name,
      uri,
      {
        title,
        description,
        mimeType: "application/json"
      },
      async () => jsonResource(uri, payloadFactory())
    )
  }

  registerStaticResource(
    "launch-context",
    "parly://launch-context",
    "Parly MCP Launch Context",
    "Current launch context and supported public surfaces for this MCP runtime.",
    () => ({
      ...sdk.getLaunchContext(),
      mcpVersion: MCP_VERSION,
      supportedTools: adapter ? [...MCP_SUPPORTED_TOOLS] : MCP_SUPPORTED_TOOLS.slice(0, 4),
      webApiTools: webApi ? [...MCP_WEB_API_TOOLS] : [],
      verificationModel: "lane-scoped selective disclosure",
      mppAdapterEnabled: Boolean(adapter),
      webApiEnabled: Boolean(webApi)
    })
  )

  registerStaticResource(
    "security-notes",
    "parly://security-notes",
    "Parly MCP Security Notes",
    "Agent-only authority, payout-scope verification notes, and runtime constraints.",
    () => ({
      authority: "AGENT_PRIVATE_KEY only",
      forbiddenKeys: ["RELAYER_PRIVATE_KEY", "RELAYER_BOX_PRIVATE_KEY_B64"],
      recoveryModel: "deterministic EIP-191 auth plus asymmetric sealed-box note recovery",
      verificationTruth: [
        "Selective disclosure remains lane-scoped.",
        "Use the confirmed Tempo transaction hash plus one disclosed child key to verify one payout lane.",
        "Unavailable recipient, provenance, or route-cost fields are omitted rather than fabricated."
      ],
      mppBoundary: "MPP compatibility stays at the SDK/MCP boundary only."
    })
  )

  function registerWebApiTool(
    name: (typeof MCP_WEB_API_TOOLS)[number],
    config: { title: string; description: string },
    request: { method: "GET" | "POST"; path: string }
  ) {
    if (!webApi) return
    registerTool(
      name,
      {
        ...config,
        inputSchema: request.method === "GET" ? webApiGetSchema : webApiPostSchema
      },
      async (args) => {
        try {
          const payload =
            request.method === "GET"
              ? await webApi.getJson(request.path, (args as z.infer<typeof webApiGetSchema>).query ?? {})
              : await webApi.postJson(request.path, (args as z.infer<typeof webApiPostSchema>).body ?? {})
          return jsonToolResponse({ status: "ok", tool: name, payload })
        } catch (error) {
          return jsonToolError(name, error)
        }
      }
    )
  }

  registerTool(
    "recover_largest_note",
    {
      title: "Recover Largest Note",
      description:
        "Recover the largest live Parly note for the AGENT wallet from chain envelopes and indexed history.",
      inputSchema: z.object({
        assetId: assetIdSchema
      })
    },
    async ({ assetId }) => {
      try {
        const recovered = await sdk.recoverLargestNote(assetId)
        return jsonToolResponse({
          status: "ok",
          tool: "recover_largest_note",
          assetId,
          recoveryMode: "asymmetric-chain-envelope",
          verificationMode: "lane-scoped selective disclosure",
          recoveryPublicKeyB64: recovered.kp.publicKeyB64,
          noteFound: Boolean(recovered.best),
          leafCount: recovered.leaves.length,
          bestNote: recovered.best
            ? {
                amount: recovered.best.amount.toString(),
                amountFormatted: formatStableAmount(recovered.best.amount),
                commitment: recovered.best.commitment,
                nullifierHash: recovered.best.nullifierHash,
                depositor: recovered.best.payload.depositor,
                kind: recovered.best.payload.kind
              }
            : null
        })
      } catch (error) {
        return jsonToolError("recover_largest_note", error)
      }
    }
  )

  async function handleShieldedPaymentTool(
    tool: "send_shielded_payment" | "execute_shielded_payment",
    args: z.infer<typeof shieldedPaymentSchema>
  ) {
    try {
      const outcome = await sdk.sendShieldedPayment(args as ExecutePaymentParams)
      return jsonToolResponse({
        status: "ok",
        tool,
        routeMode:
          args.destinationEid === config.settlementDomainId
            ? "same-chain"
            : "cross-chain-alt-fee-token-only",
        settlementChainId: config.tempoChainId,
        settlementEid: config.settlementDomainId,
        assetId: args.assetId,
        amount: args.amount,
        poolAddress: args.poolAddress,
        destination: args.destination,
        destinationEid: args.destinationEid,
        outcome: summarizeOutcome(outcome)
      })
    } catch (error) {
      return jsonToolError(tool, error)
    }
  }

  registerTool(
    "preflight_shielded_payment",
    {
      title: "Preflight Shielded Payment",
      description:
        "Validate one shielded payment request and route shape before proof generation or transaction submission.",
      inputSchema: shieldedPaymentSchema
    },
    async (args) =>
      jsonToolResponse({
        status: "ok",
        tool: "preflight_shielded_payment",
        preflight: {
          ok: true,
          routeMode:
            args.destinationEid === config.settlementDomainId
              ? "same-chain"
              : "cross-chain-alt-fee-token-only",
          settlementChainId: config.tempoChainId,
          settlementEid: config.settlementDomainId,
          assetId: args.assetId,
          amount: args.amount,
          poolAddress: args.poolAddress,
          destination: args.destination,
          destinationEid: args.destinationEid
        }
      })
  )

  registerTool(
    "send_shielded_payment",
    {
      title: "Send Shielded Payment",
      description:
        "Send from the AGENT wallet's largest live Parly note with the same outcome model as direct SDK execution.",
      inputSchema: shieldedPaymentSchema
    },
    async (args) => handleShieldedPaymentTool("send_shielded_payment", args)
  )

  registerTool(
    "execute_shielded_payment",
    {
      title: "Execute Shielded Payment",
      description:
        "Compatibility alias for send_shielded_payment. New integrations should use send_shielded_payment.",
      inputSchema: shieldedPaymentSchema
    },
    async (args) => handleShieldedPaymentTool("execute_shielded_payment", args)
  )

  if (adapter) {
    registerTool(
      "mpp_create_session",
      {
        title: "Create MPP Session",
        description:
          "Create one deterministic MPP session descriptor at the SDK/MCP boundary without changing pool or relayer semantics.",
        inputSchema: z.object({
          sessionId: z.string().min(1),
          counterparty: addressSchema,
          assetId: assetIdSchema,
          spendLimit: amountSchema,
          destinationEid: z.number().int().positive(),
          poolAddress: addressSchema
        })
      },
      async (args: MppSessionSpec) => {
        try {
          const session = await adapter.createSession(args)
          return jsonToolResponse({
            status: "ok",
            tool: "mpp_create_session",
            session,
            boundary: "sdk-mcp-only"
          })
        } catch (error) {
          return jsonToolError("mpp_create_session", error)
        }
      }
    )

    registerTool(
      "mpp_settle_session_payment",
      {
        title: "Settle Session Payment",
        description:
          "Settle one payment from an MPP session descriptor using the same structured outcome kind as direct SDK execution.",
        inputSchema: z.object({
          session: mppSessionSchema,
          destination: addressSchema,
          amount: amountSchema,
          proofAssetsBasePath: z.string().min(1).optional()
        })
      },
      async ({
        session,
        destination,
        amount,
        proofAssetsBasePath
      }: {
        session: MppSessionRecord
        destination: `0x${string}`
        amount: string
        proofAssetsBasePath?: string
      }) => {
        try {
          const outcome = await adapter.settleFromSession(
            {
              sessionId: session.sessionId,
              destination,
              amount,
              proofAssetsBasePath
            } satisfies MppSettlementRequest,
            session
          )

          return jsonToolResponse({
            status: "ok",
            tool: "mpp_settle_session_payment",
            boundary: "sdk-mcp-only",
            sessionId: session.sessionId,
            outcome: summarizeOutcome(outcome)
          })
        } catch (error) {
          return jsonToolError("mpp_settle_session_payment", error)
        }
      }
    )

    registerTool(
      "mpp_preflight_session_payment",
      {
        title: "Preflight Session Payment",
        description:
          "Validate one MPP session payment before proof generation or transaction submission.",
        inputSchema: z.object({
          session: mppSessionSchema,
          destination: addressSchema,
          amount: amountSchema
        })
      },
      async ({
        session,
        destination,
        amount
      }: {
        session: MppSessionRecord
        destination: `0x${string}`
        amount: string
      }) => {
        try {
          return jsonToolResponse({
            status: "ok",
            tool: "mpp_preflight_session_payment",
            boundary: "sdk-mcp-only",
            preflight: adapter.preflightSessionPayment(
              {
                sessionId: session.sessionId,
                destination,
                amount
              },
              session
            )
          })
        } catch (error) {
          return jsonToolError("mpp_preflight_session_payment", error)
        }
      }
    )
  }

  registerWebApiTool("privacy_link_status", {
    title: "Privacy Link Status",
    description: "Check public profile or invoice link availability and status through the Parly web API."
  }, { method: "GET", path: "/api/phase3/privacy-links/status" })
  registerWebApiTool("privacy_link_public_read", {
    title: "Read Public Privacy Link",
    description: "Read a published Parly profile or invoice link without exposing private owner data."
  }, { method: "GET", path: "/api/phase3/privacy-links/public" })
  registerWebApiTool("privacy_link_owned_list", {
    title: "List Owned Privacy Links",
    description: "List owner-authorized Privacy Links using the same signed wallet authorization as the web app."
  }, { method: "POST", path: "/api/phase3/privacy-links/owned" })
  registerWebApiTool("privacy_link_claim", {
    title: "Claim Privacy Link Name",
    description: "Claim a Privacy Link name using the same owner wallet signature required by the web app."
  }, { method: "POST", path: "/api/phase3/privacy-links/claim" })
  registerWebApiTool("privacy_link_publish", {
    title: "Publish Privacy Link",
    description: "Publish profile or invoice metadata through the existing Privacy Links API."
  }, { method: "POST", path: "/api/phase3/privacy-links/publish" })
  registerWebApiTool("privacy_link_visibility", {
    title: "Update Privacy Link Visibility",
    description: "Pause, activate, or delete a Privacy Link using the existing owner-signed status API."
  }, { method: "POST", path: "/api/phase3/privacy-links/status" })
  registerWebApiTool("privacy_link_report", {
    title: "Report Privacy Link",
    description: "Submit a public Privacy Link report through the same rate-limited web API."
  }, { method: "POST", path: "/api/phase3/privacy-links/report" })
  registerWebApiTool("privacy_link_social_status", {
    title: "Privacy Link Social Status",
    description: "Read linked X and Telegram status for the current Privacy Links web session."
  }, { method: "GET", path: "/api/phase3/privacy-links/social-status" })
  registerWebApiTool("payment_one_time_deposit_create", {
    title: "Create One-Time Deposit",
    description: "Create a one-time deposit route through the same web API used by public payment pages."
  }, { method: "POST", path: "/api/phase3/one-time-deposit" })
  registerWebApiTool("payment_wallet_deposit_quote", {
    title: "Quote Wallet Deposit",
    description: "Prepare connected-wallet deposit route data without submitting a wallet transaction."
  }, { method: "POST", path: "/api/phase3/wallet-deposit" })
  registerWebApiTool("payment_status_read", {
    title: "Read Payment Status",
    description: "Read a one-time or wallet payment status using the public status token flow."
  }, { method: "POST", path: "/api/phase3/payment-status" })
  registerWebApiTool("payout_status_read", {
    title: "Read Payout Status",
    description: "Read public payout lifecycle status without exposing unrelated private lanes."
  }, { method: "POST", path: "/api/phase3/payout-status" })
  registerWebApiTool("refund_claim", {
    title: "Claim Failed-Payment Refund",
    description: "Submit a claimant-bound refund request through the existing refund API."
  }, { method: "POST", path: "/api/phase3/refund-claim" })
  registerWebApiTool("verify_invoice_receipt", {
    title: "Verify Invoice Receipt",
    description: "Verify a Privacy Invoice receipt token through the public Verify API."
  }, { method: "POST", path: "/api/verify/invoice" })
  registerWebApiTool("relayer_list", {
    title: "List Relayers",
    description: "Read the public relayer registry snapshot."
  }, { method: "GET", path: "/api/relayers" })
  registerWebApiTool("relayer_register_init", {
    title: "Start Relayer Registration",
    description: "Start the relayer registration flow using the same public registration API as /relayer."
  }, { method: "POST", path: "/api/relayers/register/init" })
  registerWebApiTool("relayer_register_confirm", {
    title: "Confirm Relayer Registration",
    description: "Confirm a relayer registration using the same signed API as /relayer."
  }, { method: "POST", path: "/api/relayers/register/confirm" })
  registerWebApiTool("admin_operations_summary", {
    title: "Admin Operations Summary",
    description: "Read operations metrics through the existing admin session-gated API."
  }, { method: "GET", path: "/api/phase3/admin/operations-summary" })
  registerWebApiTool("admin_reports_list", {
    title: "Admin Reports",
    description: "Read Privacy Links reports through the existing admin session-gated API."
  }, { method: "GET", path: "/api/phase3/admin/reports" })
  registerWebApiTool("admin_reserved_names_list", {
    title: "Admin Reserved Names",
    description: "Read active reserved names through the existing admin session-gated API."
  }, { method: "GET", path: "/api/phase3/admin/reserved-names" })
  registerWebApiTool("admin_payout_queue", {
    title: "Admin Payout Queue",
    description: "Read payout queue state through the existing admin session-gated API."
  }, { method: "GET", path: "/api/phase3/admin/payout-queue" })
  registerWebApiTool("admin_operations_action", {
    title: "Admin Operations Action",
    description: "Submit signed operations workflow actions through the existing admin audit API."
  }, { method: "POST", path: "/api/phase3/admin/operations-action" })
  registerWebApiTool("admin_ui_settings", {
    title: "Admin UI Settings",
    description: "Read or update admin-controlled UI settings through the existing admin API."
  }, { method: "GET", path: "/api/phase3/admin/ui-settings" })
  registerWebApiTool("telegram_status", {
    title: "Telegram Status",
    description: "Read Telegram connection status for the current web session."
  }, { method: "GET", path: "/api/telegram/status" })
  registerWebApiTool("telegram_disconnect", {
    title: "Disconnect Telegram",
    description: "Disconnect Telegram notifications through the existing web session API."
  }, { method: "POST", path: "/api/telegram/disconnect" })

  return {
    config,
    sdk,
    adapter,
    webApi,
    server,
    toolNames,
    resourceUris
  }
}
