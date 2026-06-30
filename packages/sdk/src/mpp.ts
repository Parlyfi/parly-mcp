import { parseUnits } from "viem"
import {
  ParlySDK,
  type ExecutePaymentOutcome
} from "./core.js"

export type MppSessionSpec = {
  sessionId: string
  counterparty: `0x${string}`
  assetId: 1 | 2
  spendLimit: string
  destinationEid: number
  poolAddress: `0x${string}`
}

export type MppSessionRecord = {
  version: 1
  protocol: "parly"
  settlementMode: "parly-private-immediate"
  serviceName: string
  serviceVersion: string
  sessionId: string
  counterparty: `0x${string}`
  assetId: 1 | 2
  spendLimit: string
  destinationEid: number
  poolAddress: `0x${string}`
  status: "created"
}

export type MppSettlementRequest = {
  sessionId: string
  destination: `0x${string}`
  amount: string
  proofAssetsBasePath?: string
}

export type MppPaymentPreflight =
  | {
      ok: true
      sessionId: string
      assetId: 1 | 2
      amount: string
      spendLimit: string
      destination: `0x${string}`
      destinationEid: number
      poolAddress: `0x${string}`
      settlementMode: "parly-private-immediate"
    }
  | {
      ok: false
      sessionId: string
      reason: string
    }

type MppAdapterMetadata = {
  serviceName?: string
  serviceVersion?: string
}

function resolveServiceName(metadata: MppAdapterMetadata): string {
  return metadata.serviceName || process.env.MPP_SERVICE_NAME || "parly-mpp-adapter"
}

function resolveServiceVersion(metadata: MppAdapterMetadata): string {
  return metadata.serviceVersion || process.env.MPP_SERVICE_VERSION || "16.9.9"
}

function assertWithinSpendLimit(amount: string, spendLimit: string) {
  const requested = parseUnits(amount, 6)
  const cap = parseUnits(spendLimit, 6)
  if (requested > cap) {
    throw new Error("MPP session spend limit exceeded.")
  }
}

function assertSessionPayment(request: MppSettlementRequest, session: MppSessionRecord) {
  if (request.sessionId !== session.sessionId) {
    throw new Error("MPP session ID mismatch.")
  }

  if (request.destination.toLowerCase() !== session.counterparty.toLowerCase()) {
    throw new Error("MPP session destination must match the session counterparty.")
  }

  assertWithinSpendLimit(request.amount, session.spendLimit)
}

export class ParlyMppAdapter {
  constructor(
    private sdk: ParlySDK,
    private metadata: MppAdapterMetadata = {}
  ) {}

  async createSession(spec: MppSessionSpec): Promise<MppSessionRecord> {
    return {
      version: 1,
      protocol: "parly",
      settlementMode: "parly-private-immediate",
      serviceName: resolveServiceName(this.metadata),
      serviceVersion: resolveServiceVersion(this.metadata),
      sessionId: spec.sessionId,
      counterparty: spec.counterparty,
      assetId: spec.assetId,
      spendLimit: spec.spendLimit,
      destinationEid: spec.destinationEid,
      poolAddress: spec.poolAddress,
      status: "created"
    }
  }

  async settleFromSession(
    request: MppSettlementRequest,
    session: MppSessionRecord
  ): Promise<ExecutePaymentOutcome> {
    assertSessionPayment(request, session)

    return this.sdk.executeAgenticPayment({
      destination: request.destination,
      amount: request.amount,
      assetId: session.assetId,
      destinationEid: session.destinationEid,
      poolAddress: session.poolAddress,
      proofAssetsBasePath: request.proofAssetsBasePath
    })
  }

  preflightSessionPayment(
    request: MppSettlementRequest,
    session: MppSessionRecord
  ): MppPaymentPreflight {
    try {
      assertSessionPayment(request, session)
    } catch (error) {
      return {
        ok: false,
        sessionId: session.sessionId,
        reason: error instanceof Error ? error.message : String(error)
      }
    }

    return {
      ok: true,
      sessionId: session.sessionId,
      assetId: session.assetId,
      amount: request.amount,
      spendLimit: session.spendLimit,
      destination: request.destination,
      destinationEid: session.destinationEid,
      poolAddress: session.poolAddress,
      settlementMode: session.settlementMode
    }
  }
}
