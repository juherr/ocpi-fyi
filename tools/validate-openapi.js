#!/usr/bin/env node

'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const openApiRoot = path.join(root, 'openapi')

function usage() {
  console.log(`Usage: scripts/check_openapi.sh [options] [version ...]

Options:
  --changed       Validate only versions affected relative to the base branch.
  --base <ref>    Comparison ref for --changed (default: origin/main).
  --jobs <count>  Maximum concurrent validators (default: up to 4).
  --verbose       Print every command and successful validator output.
  -h, --help      Show this help.`)
}

function parseArguments(args) {
  const options = {
    base: 'origin/main',
    changed: false,
    jobs: Math.min(4, Math.max(1, os.availableParallelism?.() || os.cpus().length)),
    verbose: false,
    versions: []
  }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--changed') options.changed = true
    else if (argument === '--verbose') options.verbose = true
    else if (argument === '--base') options.base = args[++index]
    else if (argument === '--jobs') options.jobs = Number.parseInt(args[++index], 10)
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument.startsWith('-')) throw new Error(`unknown option: ${argument}`)
    else options.versions.push(argument.replace(/^ocpi-/, ''))
  }

  if (!options.base) throw new Error('--base requires a ref')
  if (!Number.isInteger(options.jobs) || options.jobs < 1) throw new Error('--jobs requires a positive integer')
  if (options.changed && options.versions.length) throw new Error('--changed cannot be combined with explicit versions')
  return options
}

function listVersions() {
  return fs.readdirSync(openApiRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('ocpi-'))
    .map((entry) => entry.name.replace(/^ocpi-/, ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch (error) {
    const detail = String(error.stderr || error.message).trim()
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function changedVersions(base, availableVersions) {
  const changedFiles = new Set([
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]),
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  ])
  const selected = new Set()
  let validateAll = false

  for (const file of changedFiles) {
    const match = file.match(/^openapi\/ocpi-([^/]+)\//)
    if (match) {
      selected.add(match[1])
      continue
    }
    if (
      file === 'package.json' ||
      file === 'package-lock.json' ||
      file === 'redocly.yaml' ||
      file === 'redocly-components.yaml' ||
      file === '.spectral.yaml' ||
      file === 'openapitools.json' ||
      file === 'openapi/upstream-revisions.yaml' ||
      file.startsWith('tools/') ||
      file === 'scripts/check_openapi.sh' ||
      file === '.github/workflows/openapi-validation.yml'
    ) {
      validateAll = true
    }
  }

  return validateAll ? availableVersions : availableVersions.filter((version) => selected.has(version))
}

function yamlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort()
}

function commandLabel(command, args) {
  return [path.relative(root, command) || command, ...args].join(' ')
}

function createTasks(versions) {
  const redocly = path.join(root, 'node_modules', '.bin', 'redocly')
  const spectral = path.join(root, 'node_modules', '.bin', 'spectral')
  const generator = path.join(root, 'node_modules', '.bin', 'openapi-generator-cli')
  for (const tool of [redocly, spectral, generator]) {
    if (!fs.existsSync(tool)) throw new Error('missing local OpenAPI tooling. Run npm ci first.')
  }

  const tasks = []
  for (const version of versions) {
    const versionDirectory = path.join(openApiRoot, `ocpi-${version}`)
    if (!fs.existsSync(versionDirectory)) throw new Error(`OpenAPI version directory not found: ${versionDirectory}`)

    const topLevel = yamlFiles(versionDirectory)
    const componentDirectories = [
      path.join(versionDirectory, 'shared'),
      path.join(versionDirectory, 'shared', 'schemas')
    ].filter((directory) => fs.existsSync(directory))
    const components = componentDirectories.flatMap(yamlFiles)
    const modules = topLevel.filter((file) => path.basename(file) !== 'openapi.yaml')

    tasks.push({
      args: [path.join('tools', 'generate-root-openapi.js'), version, '--check'],
      command: process.execPath,
      file: path.join(versionDirectory, 'openapi.yaml'),
      validator: 'aggregate',
      version
    })
    for (const file of [...topLevel, ...components]) {
      tasks.push({
        args: ['lint', '--config', components.includes(file) ? 'redocly-components.yaml' : 'redocly.yaml', file],
        command: redocly,
        file,
        validator: 'redocly',
        version
      })
    }
    for (const file of modules) {
      tasks.push({
        args: ['lint', '--fail-severity=error', file],
        command: spectral,
        file,
        validator: 'spectral',
        version
      })
      tasks.push({
        args: ['validate', '-i', file],
        command: generator,
        file,
        validator: 'generator',
        version
      })
    }
  }
  return tasks
}

function runTask(task, verbose) {
  return new Promise((resolve) => {
    if (verbose) console.log(`→ ${commandLabel(task.command, task.args)}`)
    const child = spawn(task.command, task.args, { cwd: root, env: process.env })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', (error) => resolve({ ...task, error, output }))
    child.on('close', (status) => {
      if (verbose && output.trim()) process.stdout.write(`${output.trimEnd()}\n`)
      resolve({ ...task, output, status })
    })
  })
}

async function runTasks(tasks, jobs, verbose) {
  const results = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const index = next++
      results[index] = await runTask(tasks[index], verbose)
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker))
  return results
}

function printSummary(versions, results) {
  for (const version of versions) {
    const fields = []
    for (const validator of ['aggregate', 'redocly', 'spectral', 'generator']) {
      const matching = results.filter((result) => result.version === version && result.validator === validator)
      const passed = matching.filter((result) => result.status === 0).length
      fields.push(`${validator} ${passed}/${matching.length}`)
    }
    console.log(`OCPI ${version}: ${fields.join(', ')}`)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const availableVersions = listVersions()
  const versions = options.changed
    ? changedVersions(options.base, availableVersions)
    : (options.versions.length ? options.versions : availableVersions)
  if (!versions.length) {
    console.log('No affected OpenAPI versions to validate.')
    return
  }
  for (const version of versions) {
    if (!availableVersions.includes(version)) throw new Error(`unknown OCPI version: ${version}`)
  }

  const tasks = createTasks(versions)
  console.log(`OpenAPI validation: ${versions.length} version(s), ${tasks.length} checks, ${options.jobs} worker(s)`)
  const results = await runTasks(tasks, options.jobs, options.verbose)
  const failures = results.filter((result) => result.status !== 0)
  for (const failure of failures) {
    console.error(`\nFAILED ${failure.validator} ${path.relative(root, failure.file)}`)
    if (failure.error) console.error(failure.error.message)
    if (failure.output.trim()) console.error(failure.output.trimEnd())
  }
  printSummary(versions, results)
  if (failures.length) {
    console.error(`OpenAPI validation failed: ${failures.length} of ${results.length} checks failed.`)
    process.exitCode = 1
  } else {
    console.log(`OpenAPI validation passed: ${results.length} checks.`)
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`)
  process.exit(1)
})
