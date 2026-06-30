# Changelog

## 16.9.9-mcp.0

- publishes the Phase 3 MCP surface for Parly agent integrations
- adds `preflight_shielded_payment` and `send_shielded_payment` while keeping
  `execute_shielded_payment` as a compatibility alias
- adds same-chain batch private-send preflight and send tools
- adds MPP session preflight before proof generation or transaction submission
- adds optional public web API-backed tools for Privacy Links, cross-chain deposit routes, Verify,
  payer history, receipt downloads, and relayer flows
- supports stdio and HTTP `/mcp` transports
- keeps AGENT-only execution semantics
