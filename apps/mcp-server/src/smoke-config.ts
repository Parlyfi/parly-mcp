import "./load-env.js"
import { requireEnv, requirePositiveChainIdValue } from "@parly/env-utils"

const MCP_PHASE3_PROFILE = "phase3-tempo4217"
const MCP_LEGACY_PROFILE = "legacy-moderato-v1"
const PHASE3_TEMPO_CHAIN_ID = 4217
const PHASE3_SETTLEMENT_DOMAIN_ID = 4217

export type McpRuntimeConfig = {
  agentPrivateKey: `0x${string}`
  tempoRpcUrl: string
  tempoChainId: number
  settlementDomainId: number
  tempoProfile: typeof MCP_PHASE3_PROFILE | typeof MCP_LEGACY_PROFILE
  ponderGraphqlUrl?: string
  proofAssetsBasePath?: string
  enableMppAdapter: boolean
  mppServiceName?: string
  mppServiceVersion?: string
  webApiBaseUrl?: string
  webApiBearerToken?: string
  webApiCookieHeader?: string
}

function requirePrivateKey(name: string, env: NodeJS.ProcessEnv): `0x${string}` {
  const value = requireEnv(name, env)
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex private key.`)
  }
  return value as `0x${string}`
}

function normalizeRpcUrl(value: string) {
  return value.trim().replace(/\/+$/u, "")
}

function normalizeWebApiBaseUrl(value: string | undefined) {
  const trimmed = String(value || "").trim().replace(/\/+$/u, "")
  if (!trimmed) return undefined
  if (!/^https:\/\/[^/]+/u.test(trimmed)) {
    throw new Error("PARLY_WEB_API_BASE_URL must be an https origin.")
  }
  return trimmed
}

export function assertMcpConfig(env: NodeJS.ProcessEnv = process.env): McpRuntimeConfig {
  const tempoProfile = String(env.MCP_TEMPO_PROFILE || "").trim()
  if (tempoProfile !== MCP_PHASE3_PROFILE && tempoProfile !== MCP_LEGACY_PROFILE) {
    throw new Error(`MCP_TEMPO_PROFILE must be ${MCP_PHASE3_PROFILE} for Phase 3, or ${MCP_LEGACY_PROFILE} for explicitly legacy V1 smoke checks.`)
  }
  if (tempoProfile === MCP_LEGACY_PROFILE) {
    throw new Error("MCP legacy Moderato V1 smoke config is historical only and is not an active Phase 3 runtime profile.")
  }

  const enableMppAdapter = String(env.ENABLE_MPP_ADAPTER || "false")
  if (enableMppAdapter !== "true" && enableMppAdapter !== "false") {
    throw new Error("ENABLE_MPP_ADAPTER must be either true or false.")
  }

  const tempoChainId = requirePositiveChainIdValue(
    env.TEMPO_CHAIN_ID ?? env.NEXT_PUBLIC_TEMPO_CHAIN_ID,
    "TEMPO_CHAIN_ID/NEXT_PUBLIC_TEMPO_CHAIN_ID"
  )
  if (tempoChainId !== PHASE3_TEMPO_CHAIN_ID) {
    throw new Error(
      `TEMPO_CHAIN_ID/NEXT_PUBLIC_TEMPO_CHAIN_ID must remain locked to ${PHASE3_TEMPO_CHAIN_ID}.`
    )
  }

  const settlementDomainId = requirePositiveChainIdValue(
    env.SETTLEMENT_DOMAIN_ID ?? env.NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID,
    "SETTLEMENT_DOMAIN_ID/NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID"
  )
  if (settlementDomainId !== PHASE3_SETTLEMENT_DOMAIN_ID) {
    throw new Error(
      `SETTLEMENT_DOMAIN_ID/NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID must remain locked to ${PHASE3_SETTLEMENT_DOMAIN_ID}.`
    )
  }

  const tempoRpcUrl = normalizeRpcUrl(requireEnv("TEMPO_RPC_URL", env))

  const config: McpRuntimeConfig = {
    agentPrivateKey: requirePrivateKey("AGENT_PRIVATE_KEY", env),
    tempoRpcUrl,
    tempoChainId,
    settlementDomainId,
    tempoProfile,
    ponderGraphqlUrl: env.PONDER_GRAPHQL_URL ?? env.NEXT_PUBLIC_PONDER_GRAPHQL_URL,
    proofAssetsBasePath: env.PARLY_SDK_ASSETS_PATH,
    enableMppAdapter: enableMppAdapter === "true",
    webApiBaseUrl: normalizeWebApiBaseUrl(env.PARLY_WEB_API_BASE_URL),
    webApiBearerToken: env.PARLY_MCP_WEB_API_BEARER_TOKEN,
    webApiCookieHeader: env.PARLY_MCP_WEB_API_COOKIE
  }

  if (config.enableMppAdapter) {
    config.mppServiceName = requireEnv("MPP_SERVICE_NAME", env)
    config.mppServiceVersion = requireEnv("MPP_SERVICE_VERSION", env)
  }

  return config
}

if (process.argv[1] && process.argv[1].endsWith("smoke-config.js")) {
  const config = assertMcpConfig()
  console.log(
    JSON.stringify(
      {
        status: "mcp-config-valid",
        network: "tempo",
        target: "phase3-tempo4217",
        tempoProfile: config.tempoProfile,
        tempoRpcUrlConfigured: true,
        tempoChainId: config.tempoChainId,
        settlementDomainId: config.settlementDomainId,
        agentPrivateKeyConfigured: true,
        ponderGraphqlUrlConfigured: Boolean(config.ponderGraphqlUrl),
        proofAssetsBasePathConfigured: Boolean(config.proofAssetsBasePath),
        enableMppAdapter: config.enableMppAdapter,
        mppServiceName: config.mppServiceName ?? null,
        mppServiceVersion: config.mppServiceVersion ?? null,
        webApiBaseUrlConfigured: Boolean(config.webApiBaseUrl),
        webApiBearerTokenConfigured: Boolean(config.webApiBearerToken),
        webApiCookieConfigured: Boolean(config.webApiCookieHeader)
      },
      null,
      2
    )
  )
}
