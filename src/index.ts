// Heavily inspired by https://github.com/antfu/vite-plugin-restart

import { execSync } from "child_process"
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { join, resolve } from "path"
import { chdir, exit } from "process"
import type { Plugin } from "vite"

interface CodeBattlesOptions {
  /** Additional configuration for PyScript */
  pyscript?: {
    /** Additional Python packages to install, see https://docs.pyscript.net/latest/user-guide/configuration/#packages */
    packages?: string[]
    /** Custom pyodide version, see https://docs.pyscript.net/latest/user-guide/configuration/#interpreter */
    interpreter?: string
  }

  /** Additional configuration for pdoc */
  documentation?: {
    /** The URL for the favicon, by default this is `/images/logo.png` */
    favicon?: string
    /** Optional footer text for the sidebar, empty by default */
    footerText?: string
    /** The URL for the logo, by default this is `/images/logo-transparent.png` */
    logo?: string
    /** The URL for the logo, by default this is `/` */
    logoLink?: string
  }
}

const dirname = resolve(".")

const refresh = (_: CodeBattlesOptions) => {
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

  console.log("✨ Created code battles symbolic links")
  return shouldRestart
}

const buildAPIDocumentation = (options: CodeBattlesOptions) => {
  chdir(join(dirname, "public", "scripts"))
  let args = ""
  if (options.documentation?.footerText) {
    args += `--footer-text ${JSON.stringify(options.documentation.footerText)} `
  }
  args += `--favicon ${JSON.stringify(
    options.documentation?.favicon ?? `/images/logo.png`
  )} `
  args += `--logo ${JSON.stringify(
    options.documentation?.logo ?? `/images/logo-transparent.png`
  )} `
  args += `--logo-link ${JSON.stringify(
    options.documentation?.logoLink ?? `/`
  )} `

  try {
    execSync(
      `pdoc api.py --no-show-source -t ${join(
        "..",
        "..",
        "node_modules",
        "code-battles",
        "dist",
        "pdoc-template"
      )} ${args} -o ..`
    )
    rmSync(join("..", "index.html"))
    rmSync(join("..", "search.js"))
    console.log("✨ Created API documentation")
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
    console.log("✨ Copied Firebase configuration")
  }
}

const createConfig = (options: CodeBattlesOptions) => {
  chdir(join(dirname))
  const configFile = join("public", "config.json")

  let originalConfig: any = null
  if (existsSync(configFile)) {
    originalConfig = JSON.parse(readFileSync(configFile).toString())
  }

  const config: any = {}
  if (options.pyscript?.packages !== undefined) {
    config.packages = options.pyscript.packages
  }
  if (options.pyscript?.interpreter) {
    config.interpreter = options.pyscript.interpreter
  }

  if (JSON.stringify(config) !== JSON.stringify(originalConfig)) {
    writeFileSync(configFile, JSON.stringify(config, null, 4))
    console.log("✨ Created PyScript configuration file")
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
      buildAPIDocumentation(options)
      createConfig(options)
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
