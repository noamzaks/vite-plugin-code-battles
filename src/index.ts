// Heavily inspired by https://github.com/antfu/vite-plugin-restart

import { execSync } from "child_process"
import {
  copyFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { join, resolve } from "path"
import { chdir, exit } from "process"
import type { Plugin } from "vite"

interface CodeBattlesOptions {
  /** Additional Python packages to install, see https://docs.pyscript.net/2023.12.1/user-guide/configuration/#packages */
  packages?: string[]
}

const dirname = resolve(".")

const refresh = (options: CodeBattlesOptions) => {
  chdir(dirname)
  const directory = join("public", "scripts")
  const packedFilePath = join(directory, "packed.py")
  if (existsSync(packedFilePath)) {
    rmSync(packedFilePath)
  }

  try {
    execSync(`pybunch -d . -p code_battles -e main -o packed.py`, {
      cwd: directory,
    })
    console.log("✨ Packed all Python files")
  } catch (e) {
    console.log(
      "⚠️  Failed packing the Python files, perhaps install pybunch with `pip install --upgrade pybunch`"
    )
  }
}

const symlinkAndGitIgnore = (filename: string, target: string) => {
  let createdSymlinks = false
  if (!existsSync(filename)) {
    symlinkSync(target, filename, "dir")
    createdSymlinks = true
  }
  writeFileSync(join(filename, ".gitignore"), "*")
  return createdSymlinks
}

const symlinkCodeBattles = () => {
  let shouldRestart = false

  chdir(dirname)
  const codeBattlesComponentsDirectory = join(
    dirname,
    "node_modules",
    "code-battles",
    "dist"
  )
  if (
    symlinkAndGitIgnore(
      join("public", "scripts", "code_battles"),
      join(codeBattlesComponentsDirectory, "code_battles")
    ) ||
    symlinkAndGitIgnore(
      join("public", "pyscript"),
      join(codeBattlesComponentsDirectory, "pyscript")
    )
  ) {
    shouldRestart = true
  }

  console.log("✨ Set up code battles symbolic links")
  return shouldRestart
}

const buildAPIDocumentation = () => {
  chdir(join(dirname, "public", "scripts"))
  try {
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
  } catch {
    console.log(
      "⚠️  Failed building API documentation, perhaps install pdoc with `pip install --upgrade pdoc`"
    )
  }
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
      if (symlinkCodeBattles()) {
        console.log(
          "✨ New symbolic links were generated, please re-run the previous command"
        )
        exit(-1)
      }
      buildAPIDocumentation()
      copyFirebase()
      refresh(options)
    },
    configureServer(server) {
      const onFileChange = (f: string) => {
        if (
          !f.endsWith("packed.py") &&
          f.endsWith(".py") &&
          f.includes(join("public", "scripts"))
        ) {
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
