import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, "../../..")
const appRoot = path.resolve(__dirname, "..")

const workspacePackages = [
  "@parly/env-utils",
  "@parly/shared-types",
  "@parly/protocol-abis",
  "@parly/crypto-utils",
  "@parly/sdk"
]

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function copyFirstAvailableDist(candidateDists, targetDist, packageName) {
  let lastError = null

  for (const candidate of candidateDists) {
    try {
      await fs.cp(candidate, targetDist, { recursive: true })
      return
    } catch (error) {
      lastError = error
      const code = error && typeof error === "object" ? error.code : null
      if (code === "ENOENT") {
        continue
      }
      throw error
    }
  }

  throw new Error(
    `Missing ${packageName} dist in candidates: ${candidateDists.join(", ")} (${String(lastError)})`
  )
}

for (const packageName of workspacePackages) {
  const sourcePackageRoot = path.join(workspaceRoot, "packages", packageName.replace("@parly/", ""))
  const sourceDist = path.join(sourcePackageRoot, "dist")
  const fallbackDist = path.join(appRoot, "dist", "packages", packageName.replace("@parly/", ""), "src")
  const sourcePackageJson = path.join(sourcePackageRoot, "package.json")
  const targetPackageRoot = path.join(appRoot, "node_modules", ...packageName.split("/"))
  const targetDist = path.join(targetPackageRoot, "dist")
  const targetPackageJson = path.join(targetPackageRoot, "package.json")
  const targetIndex = path.join(targetDist, "index.js")

  if (await pathExists(targetIndex)) {
    continue
  }

  await fs.mkdir(targetPackageRoot, { recursive: true })
  await fs.rm(targetDist, { recursive: true, force: true })
  await copyFirstAvailableDist([sourceDist, fallbackDist], targetDist, packageName)

  if (!(await pathExists(targetPackageJson)) && (await pathExists(sourcePackageJson))) {
    await fs.copyFile(sourcePackageJson, targetPackageJson)
  }

  if (!(await pathExists(targetPackageJson))) {
    await fs.writeFile(
      targetPackageJson,
      JSON.stringify(
        {
          name: packageName,
          type: "module",
          main: "dist/index.js",
          exports: {
            ".": {
              default: "./dist/index.js"
            }
          }
        },
        null,
        2
      ),
      "utf8"
    )
  }
}
