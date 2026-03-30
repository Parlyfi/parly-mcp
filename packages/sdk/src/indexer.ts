export type IndexedSettlementRecord = {
  guid: string
  srcEid: number
  settlementLeafIndex: number
}

export function isIndexedSettlementRecord(value: unknown): value is IndexedSettlementRecord {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as IndexedSettlementRecord
  return (
    typeof candidate.guid === "string" &&
    Number.isInteger(candidate.srcEid) &&
    Number.isInteger(candidate.settlementLeafIndex)
  )
}
