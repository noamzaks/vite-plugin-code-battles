// Heavily inspired by https://github.com/antfu/vite-plugin-restart

import { execSync } from "child_process"
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "fs"
import { join, resolve } from "path"
import { chdir } from "process"
import type { Plugin } from "vite"

const dirname = resolve(".")

const refresh = () => {
  chdir(dirname)
  const directory = join("public", "scripts")
  const file = join("public", "config.json")
  let config: any = {}
  if (existsSync(file)) {
    config = JSON.parse(readFileSync(file).toString())
  }
  const originalFiles = config.files
  config.files = {}
  const files = readdirSync(directory, { recursive: true }).sort()
  for (const file of files) {
    if (file.includes("__pycache__") || !file.toString().endsWith(".py")) {
      continue
    }

    const slashPath = file.toString().replace(/\\/g, "/")
    config.files["/scripts/" + slashPath] = "./" + slashPath
  }
  if (JSON.stringify(config.files) !== JSON.stringify(originalFiles)) {
    writeFileSync(file, JSON.stringify(config, null, 4))
    console.log("✨ Refreshed config.json to include all Python files")
  }
}

const deleteSymlinkAndGitIgnore = (filename: string, target: string) => {
  if (existsSync(filename)) {
    rmSync(filename)
  }
  symlinkSync(target, filename)
  writeFileSync(join(filename, ".gitignore"), "*")
}

const symlinkCodeBattles = () => {
  chdir(dirname)
  const codeBattlesComponentsDirectory = join(
    dirname,
    "node_modules",
    "code-battles-components",
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
      "code-battles-components",
      "dist",
      "pdoc-template"
    )} -o ..`
  )
  rmSync(join("..", "index.html"))
  rmSync(join("..", "search.js"))
  console.log("✨ Refreshed generated API documentation")
}

export default function CodeBattles(): Plugin {
  return {
    name: "code-battles",
    buildStart() {
      symlinkCodeBattles()
      buildAPIDocumentation()
      refresh()
    },
    configureServer(server) {
      const onFileChange = (f: string) => {
        if (f.endsWith(".py")) {
          refresh()
        }
      }

      server.watcher.add(["public/scripts/*.py"])
      server.watcher.on("add", onFileChange)
      server.watcher.on("change", onFileChange)
      server.watcher.on("unlink", onFileChange)
    },
  }
}