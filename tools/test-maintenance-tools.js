#!/usr/bin/env node

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const generator = path.join(root, 'tools', 'generate-root-openapi.js')

function createFixture() {
  const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ocpi-maintenance-')))
  const source = path.join(root, 'openapi', 'ocpi-2.3.0')
  const destination = path.join(fixtureRoot, 'openapi', 'ocpi-2.3.0')
  fs.cpSync(source, destination, { recursive: true })
  return { fixtureRoot, destination }
}

function runGenerator(fixtureRoot, ...args) {
  return spawnSync(process.execPath, [generator, ...args], {
    cwd: fixtureRoot,
    encoding: 'utf8'
  })
}

test('writes an aggregate to a separate output without changing the tracked root', (t) => {
  const { fixtureRoot, destination } = createFixture()
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

  const sourceRoot = path.join(destination, 'openapi.yaml')
  const original = fs.readFileSync(sourceRoot, 'utf8')
  const output = path.join(fixtureRoot, 'public', '.cache', 'openapi', 'ocpi-2.3.0', 'openapi.yaml')
  const result = runGenerator(fixtureRoot, '2.3.0', '--output', output)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(sourceRoot, 'utf8'), original)
  assert.ok(fs.existsSync(output))
  assert.match(fs.readFileSync(output, 'utf8'), /\.\.\/\.\.\/\.\.\/\.\.\/openapi\/ocpi-2\.3\.0\/versions\.yaml/)
})

test('--check detects a semantically stale aggregate without rewriting it', (t) => {
  const { fixtureRoot, destination } = createFixture()
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

  const sourceRoot = path.join(destination, 'openapi.yaml')
  const stale = fs.readFileSync(sourceRoot, 'utf8').replace(/title: .+/, 'title: Stale aggregate')
  fs.writeFileSync(sourceRoot, stale)

  const result = runGenerator(fixtureRoot, '2.3.0', '--check')

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /out of date/i)
  assert.equal(fs.readFileSync(sourceRoot, 'utf8'), stale)
})

test('--check accepts an equivalent aggregate without rewriting formatting', (t) => {
  const { fixtureRoot, destination } = createFixture()
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

  const sourceRoot = path.join(destination, 'openapi.yaml')
  const original = fs.readFileSync(sourceRoot, 'utf8')
  const result = runGenerator(fixtureRoot, '2.3.0', '--check')

  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(sourceRoot, 'utf8'), original)
})

test('maintenance scripts expose usage without performing work', () => {
  for (const script of ['check_openapi.sh', 'publish_pr.sh']) {
    const result = spawnSync('bash', [path.join(root, 'scripts', script), '--help'], {
      cwd: root,
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, `${script}: ${result.stderr}`)
    assert.match(result.stdout, /Usage:/)
  }
})

test('pull request publication requires complete explicit metadata', () => {
  const result = spawnSync('bash', [path.join(root, 'scripts', 'publish_pr.sh'), '--title', 'Incomplete'], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--title and --body-file must be provided together/)
})
