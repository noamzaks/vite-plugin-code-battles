// Heavily inspired by https://github.com/antfu/vite-plugin-restart

import { execSync } from "child_process"
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  copyFileSync,
} from "fs"
import { join, resolve } from "path"
import { chdir } from "process"
import type { Plugin } from "vite"

interface CodeBattlesOptions {
  /** Additional Python packages to install, see https://docs.pyscript.net/2023.12.1/user-guide/configuration/#packages */
  packages?: string[]
}

const dirname = resolve(".")

const refresh = (options: CodeBattlesOptions) => {
  chdir(dirname)
  const directory = join("public", "scripts")
  const file = join("public", "config.json")
  let config: any = {}
  if (existsSync(file)) {
    config = JSON.parse(readFileSync(file).toString())
  }
  const originalConfig = { ...config }
  config = { files: {} }
  const files = readdirSync(directory, { recursive: true }).sort()
  for (const file of files) {
    if (
      file.includes("__pycache__") ||
      (!file.toString().endsWith(".py") && !file.toString().endsWith(".pyi"))
    ) {
      continue
    }

    const slashPath = file.toString().replace(/\\/g, "/")
    config.files["/scripts/" + slashPath] = "./" + slashPath
  }
  if (options.packages !== undefined) {
    config.packages = options.packages
  }
  if (JSON.stringify(config) !== JSON.stringify(originalConfig)) {
    writeFileSync(file, JSON.stringify(config, null, 4))
    console.log("✨ Refreshed config.json to include all Python files")
  }
}

const deleteSymlinkAndGitIgnore = (filename: string, target: string) => {
  if (!existsSync(filename)) {
    symlinkSync(target, filename, "dir")
  }
  writeFileSync(join(filename, ".gitignore"), "*")
}

const symlinkCodeBattles = () => {
  chdir(dirname)
  const codeBattlesComponentsDirectory = join(
    dirname,
    "node_modules",
    "code-battles",
    "dist"
  )
  deleteSymlinkAndGitIgnore(
    join("public", "scripts", "code_battles"),
    join(codeBattlesComponentsDirectory, "code_battles")
  )
  deleteSymlinkAndGitIgnore(
    join("public", "pyscript"),
    join(codeBattlesComponentsDirectory, "pyscript")
  )

  console.log("✨ Set up code battles symbolic links")
}

const buildAPIDocumentation = () => {
  chdir(join(dirname, "public", "scripts"))
  execSync(
    `pdoc api.py --no-show-source -t ${join(
      "..",
      "..",
      "node_modules",
      "code-battles",
      "dist",
      "pdoc-template"
    )} -o ..`
  )
  rmSync(join("..", "index.html"))
  rmSync(join("..", "search.js"))
  console.log("✨ Refreshed generated API documentation")
}

const copyFirebase = () => {
  chdir(join(dirname))
  const firebaseJsonPath = join("src", "firebase.json")
  if (existsSync(firebaseJsonPath)) {
    copyFileSync(
      firebaseJsonPath,
      join("public", "firebase-configuration.json")
    )
    console.log(
      "✨ Copied firebase configuration to `public` to enable competitor CLI support"
    )
  }
}

export default function CodeBattles(options: CodeBattlesOptions = {}): Plugin {
  return {
    name: "code-battles",
    buildStart() {
      symlinkCodeBattles()
      buildAPIDocumentation()
      copyFirebase()
      refresh(options)
    },
    configureServer(server) {
      const onFileChange = (f: string) => {
        if (f.endsWith(".py") && f.includes(join("public", "scripts"))) {
          refresh(options)
          server.ws.send({ type: "full-reload" })
        }
      }

      server.watcher.add(join(dirname, "public", "scripts"))
      server.watcher.on("add", onFileChange)
      server.watcher.on("change", onFileChange)
      server.watcher.on("unlink", onFileChange)
    },
  }
}
