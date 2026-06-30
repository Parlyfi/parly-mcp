import fs from "node:fs"
import path from "node:path"
import dotenv from "dotenv"

function findWorkspaceRoot(start: string) {
  let current = path.resolve(start)

  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return path.resolve(start)
    }
    current = parent
  }
}

const workspaceRoot = findWorkspaceRoot(process.cwd())

for (const candidate of [path.join(workspaceRoot, ".env"), path.join(workspaceRoot, "apps", "mcp-server", ".env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false })
  }
}
