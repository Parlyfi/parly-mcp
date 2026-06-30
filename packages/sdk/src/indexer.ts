export type DepositRow = {
  depositor: string
  commitment: string
  amount: string
  leafIndex: number
  assetId: number
  txHash: string
  timestamp: string
}

export type IngressSettlementRow = {
  guid: string
  commitment: string
  assetId: number
  depositor: string
  amount: string
  innerCommitment: string
  settlementLeafIndex: number
  settlementChain: string
  settlementEid: number
  sourceEid: number
  composeFrom: string
  txHash: string
  timestamp: string
}

export type SpokeShieldDispatchRow = {
  guid: string
  assetId: number
  sender: string
  amount: string
  innerCommitment: string
  sourceChain: string
  sourceEid: number
  gateway: string
  txHash: string
  timestamp: string
}

export type WithdrawalRow = {
  nullifierHash: string
  executor: string
  protocolFee: string
  executorFee: string
  childKeys: string[] | string
  assetId: number
  txHash: string
  timestamp: string
}

export type LeafRow = {
  commitment: string
  leafIndex: number
  kind?: number
  txHash?: string
  timestamp?: string
}

export type EnvelopeRow = {
  commitment: string
  kind: "deposit" | "change"
  envelope: `0x${string}`
  txHash?: string
  timestamp?: string
}

export type NullifierRow = {
  nullifierHash: string
  txHash?: string
  timestamp?: string
}

export type DepositHistoryRow = DepositRow & {
  origin: "tempo" | "spoke"
  provenance?: {
    guid: string
    settlementChain: string
    settlementEid: number
    settlementTxHash: string
    sourceChain?: string
    sourceEid: number
    sourceTxHash?: string
    sourceSender?: string
    composeFrom: string
  }
}

export type RecoveryHeads = {
  leafCursor: string | null
  envelopeCursor: string | null
  nullifierCursor: string | null
}

type IndexerQueryOptions = {
  ponderUrl?: string
}

function resolvePonderUrl(options: IndexerQueryOptions = {}): string {
  const value =
    options.ponderUrl ??
    process.env.PONDER_GRAPHQL_URL ??
    process.env.NEXT_PUBLIC_PONDER_GRAPHQL_URL

  if (!value) {
    throw new Error(
      "PONDER_GRAPHQL_URL or NEXT_PUBLIC_PONDER_GRAPHQL_URL must be configured for SDK indexer queries."
    )
  }

  return value
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? String(fallback))
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return fallback
  }
  return value
}

const INDEXER_PAGE_SIZE = parsePositiveInt(
  process.env.INDEXER_PAGE_SIZE ?? process.env.NEXT_PUBLIC_INDEXER_PAGE_SIZE,
  500
)

async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  options: IndexerQueryOptions = {}
) {
  const response = await fetch(resolvePonderUrl(options), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error(`Indexer request failed with HTTP ${response.status}`)
  }

  const json = (await response.json()) as {
    data?: Record<string, unknown>
    errors?: Array<{ message?: string }>
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "Indexer request failed.")
  }

  return json.data
}

async function fetchAllPages<T>(
  query: string,
  rootKey: string,
  variables: Record<string, unknown> = {},
  options: IndexerQueryOptions = {}
): Promise<T[]> {
  let after: string | null = null
  const items: T[] = []

  while (true) {
    const data = (await gql(
      query,
      {
        ...variables,
        limit: INDEXER_PAGE_SIZE,
        after
      },
      options
    )) as Record<string, any> | undefined

    const page = data?.[rootKey]
    const pageItems = (page?.items || []) as T[]
    items.push(...pageItems)

    if (!page?.pageInfo?.hasNextPage || !page?.pageInfo?.endCursor) {
      break
    }

    after = page.pageInfo.endCursor as string
  }

  return items
}

export async function fetchLeaves(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<LeafRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      leafInsertedEvents(
        where:{assetId:$assetId},
        orderBy:"leafIndex",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items { commitment leafIndex kind txHash timestamp }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages<LeafRow>(query, "leafInsertedEvents", { assetId }, options)
}

export async function fetchDeposits(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<DepositRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      depositEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items { depositor commitment amount leafIndex assetId txHash timestamp }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages(query, "depositEvents", { assetId }, options)
}

export async function fetchIngressSettlements(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<IngressSettlementRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      ingressSettlementEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items {
          guid
          commitment
          assetId
          depositor
          amount
          innerCommitment
          settlementLeafIndex
          settlementChain
          settlementEid
          sourceEid
          composeFrom
          txHash
          timestamp
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages(query, "ingressSettlementEvents", { assetId }, options)
}

export async function fetchSpokeShieldDispatches(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<SpokeShieldDispatchRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      spokeShieldDispatchEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items {
          guid
          assetId
          sender
          amount
          innerCommitment
          sourceChain
          sourceEid
          gateway
          txHash
          timestamp
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages(query, "spokeShieldDispatchEvents", { assetId }, options)
}

export async function fetchDepositHistory(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<DepositHistoryRow[]> {
  const [deposits, settlements, dispatches] = await Promise.all([
    fetchDeposits(assetId, options),
    fetchIngressSettlements(assetId, options),
    fetchSpokeShieldDispatches(assetId, options)
  ])

  const settlementByCommitment = new Map(
    settlements.map((row) => [String(row.commitment).toLowerCase(), row] as const)
  )
  const dispatchByGuid = new Map(
    dispatches.map((row) => [String(row.guid).toLowerCase(), row] as const)
  )

  return deposits.map((row) => {
    const settlement = settlementByCommitment.get(String(row.commitment).toLowerCase())
    if (!settlement) {
      return { ...row, origin: "tempo" as const }
    }

    const dispatch = dispatchByGuid.get(String(settlement.guid).toLowerCase())
    if (!dispatch) {
      return { ...row, origin: "tempo" as const }
    }

    return {
      ...row,
      origin: "spoke" as const,
      provenance: {
        guid: settlement.guid,
        settlementChain: settlement.settlementChain,
        settlementEid: settlement.settlementEid,
        settlementTxHash: settlement.txHash,
        sourceChain: dispatch.sourceChain,
        sourceEid: settlement.sourceEid,
        sourceTxHash: dispatch.txHash,
        sourceSender: dispatch.sender,
        composeFrom: settlement.composeFrom
      }
    }
  })
}

export async function fetchRecoveryHeads(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<RecoveryHeads> {
  const query = `
    query($assetId:Int!) {
      leafInsertedEvents(where:{assetId:$assetId}, orderBy:"leafIndex", orderDirection:"desc", limit:1) {
        items { commitment leafIndex txHash }
      }
      noteEnvelopeEvents(where:{assetId:$assetId}, orderBy:"timestamp", orderDirection:"desc", limit:1) {
        items { commitment txHash timestamp }
      }
      batchWithdrawalEvents(where:{assetId:$assetId}, orderBy:"timestamp", orderDirection:"desc", limit:1) {
        items { nullifierHash txHash timestamp }
      }
    }
  `

  const data = (await gql(query, { assetId }, options)) as Record<string, any> | undefined
  const leaf = data?.leafInsertedEvents?.items?.[0]
  const envelope = data?.noteEnvelopeEvents?.items?.[0]
  const nullifier = data?.batchWithdrawalEvents?.items?.[0]

  return {
    leafCursor: leaf ? `${leaf.leafIndex}:${leaf.commitment}:${leaf.txHash}` : null,
    envelopeCursor: envelope
      ? `${envelope.commitment}:${envelope.txHash}:${envelope.timestamp}`
      : null,
    nullifierCursor: nullifier
      ? `${nullifier.nullifierHash}:${nullifier.txHash}:${nullifier.timestamp}`
      : null
  }
}

export async function fetchEnvelopes(assetId: number, options: IndexerQueryOptions = {}) {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      noteEnvelopeEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items { commitment kind envelope txHash timestamp }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages<EnvelopeRow>(query, "noteEnvelopeEvents", { assetId }, options)
}

export async function fetchWithdrawals(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<WithdrawalRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      batchWithdrawalEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items { nullifierHash executor protocolFee executorFee childKeys assetId txHash timestamp }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages(query, "batchWithdrawalEvents", { assetId }, options)
}

export async function fetchNullifiers(
  assetId: number,
  options: IndexerQueryOptions = {}
): Promise<NullifierRow[]> {
  const query = `
    query($assetId:Int!, $limit:Int!, $after:String) {
      batchWithdrawalEvents(
        where:{assetId:$assetId},
        orderBy:"timestamp",
        orderDirection:"asc",
        limit:$limit,
        after:$after
      ) {
        items { nullifierHash txHash timestamp }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  return fetchAllPages<NullifierRow>(query, "batchWithdrawalEvents", { assetId }, options)
}

export async function fetchDepositsByDepositor(
  depositor: string,
  options: IndexerQueryOptions = {}
): Promise<DepositRow[]> {
  const normalized = depositor.toLowerCase()
  const [usdc, usdt] = await Promise.all([
    fetchDeposits(1, options),
    fetchDeposits(2, options)
  ])
  return [...usdc, ...usdt].filter(
    (row) => String(row.depositor).toLowerCase() === normalized
  )
}

export async function fetchApproxPublicDepositVolume(options: IndexerQueryOptions = {}) {
  const [usdc, usdt] = await Promise.all([
    fetchDeposits(1, options),
    fetchDeposits(2, options)
  ])
  const usdcTotal = usdc.reduce((sum, row) => sum + BigInt(row.amount), 0n)
  const usdtTotal = usdt.reduce((sum, row) => sum + BigInt(row.amount), 0n)
  return {
    usdc: usdcTotal,
    usdt: usdtTotal,
    total: usdcTotal + usdtTotal
  }
}

export async function fetchTxBatches(
  txHash: string,
  options: IndexerQueryOptions = {}
) {
  const query = `
    query($txHash:String!) {
      batchWithdrawalEvents(where:{txHash:$txHash}) {
        items { childKeys protocolFee executorFee txHash timestamp assetId nullifierHash }
      }
    }
  `

  const data = (await gql(query, { txHash }, options)) as Record<string, any> | undefined
  return (data?.batchWithdrawalEvents?.items || []) as WithdrawalRow[]
}
