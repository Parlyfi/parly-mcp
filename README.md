# Parly MCP Server

Production MCP server for Parly agent integrations.

## What this repo is

This repo is the public MCP distribution for Parly. It packages the MCP server with only the minimal shared packages needed to expose the supported Parly tool surface to agent stacks.

## Who this repo is for

This repo is for teams integrating Parly into agent or AI workflows.

## Install

```bash
cp .env.example .env
pnpm install
pnpm start
```

## Configuration

- `AGENT_PRIVATE_KEY`
- `TEMPO_RPC_URL`
- `TEMPO_CHAIN_ID`
- `TEMPO_LZ_EID`
- optional MPP adapter flags

Fail fast on missing required configuration. Do not configure relayer keys in this repo.
