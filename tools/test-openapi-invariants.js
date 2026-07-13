#!/usr/bin/env node

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const root = path.resolve(__dirname, '..')
let assertionCount = 0

function readYaml(relativePath) {
  return YAML.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function check(condition, message) {
  assert.ok(condition, message)
  assertionCount += 1
}

function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message)
  assertionCount += 1
}

function schema(document, name) {
  return document.components.schemas[name]
}

function listYamlFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listYamlFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      files.push(entryPath)
    }
  }
  return files
}

function validateEnumDescriptions(value, location = []) {
  if (!value || typeof value !== 'object') return

  const descriptions = value['x-enumDescriptions']
  if (descriptions) {
    const enumValues = value.enum ?? value.anyOf?.find((branch) => Array.isArray(branch.enum))?.enum
    check(enumValues, `${location.join('.')} has x-enumDescriptions without a related enum`)
    equal(
      Object.keys(descriptions).sort(),
      [...enumValues].sort(),
      `${location.join('.')} enum values and x-enumDescriptions keys differ`
    )
  }

  for (const [key, child] of Object.entries(value)) {
    validateEnumDescriptions(child, [...location, key])
  }
}

function validateLicense(document, relativePath) {
  equal(
    document.info.license,
    {
      name: 'Creative Commons Attribution-NoDerivatives 4.0 International',
      url: 'https://creativecommons.org/licenses/by-nd/4.0/'
    },
    `${relativePath} must declare the OCPI documentation license`
  )
}

function validateCoordinates(version) {
  const locations = readYaml(`openapi/ocpi-${version}/shared/schemas/locations.yaml`)
  for (const name of ['GeoLocation', 'AdditionalGeoLocation']) {
    const coordinates = schema(locations, name).properties
    equal(coordinates.latitude.maxLength, 11, `${version} ${name} latitude length`)
    equal(coordinates.longitude.maxLength, 12, `${version} ${name} longitude length`)
    equal(coordinates.latitude.pattern, '^-?[0-9]{1,2}\\.[0-9]{5,7}$', `${version} ${name} latitude pattern`)
    equal(coordinates.longitude.pattern, '^-?[0-9]{1,3}\\.[0-9]{5,7}$', `${version} ${name} longitude pattern`)
  }
}

function validateCanonicalSharedSchemas(version) {
  const common = readYaml(`openapi/ocpi-${version}/shared/common.yaml`)
  for (const name of [
    'GeoLocation',
    'AdditionalGeoLocation',
    'RegularHours',
    'ImageCategory',
    'EnergySourceCategory',
    'EnvironmentalImpactCategory'
  ]) {
    equal(
      schema(common, name),
      { $ref: `./schemas/locations.yaml#/components/schemas/${name}` },
      `${version} ${name} must use its canonical location schema`
    )
  }
}

function validateUpstreamRevisions() {
  const revisions = readYaml('openapi/upstream-revisions.yaml')
  equal(revisions.schema_version, 1, 'upstream revision manifest schema version')

  for (const version of ['2.1.1', '2.2.1', '2.3.0']) {
    const entry = revisions.versions[version]
    check(entry, `missing upstream revisions for OCPI ${version}`)
    for (const source of Object.values(entry.sources)) {
      check(/^[0-9a-f]{40}$/.test(source.commit), `${version} ${source.kind} must use a full commit SHA`)
      check(/^https:\/\/github\.com\//.test(source.repository), `${version} ${source.kind} repository must be a GitHub URL`)
    }
  }

  equal(revisions.versions['2.2.1'].sources.normative.edition, 2, 'OCPI 2.2.1 normative edition')
  equal(
    revisions.versions['2.2.1'].sources.normative.document_version,
    '2.2.1-d2',
    'OCPI 2.2.1 normative document version'
  )
  equal(revisions.versions['2.3.0'].sources.normative.edition, 2, 'OCPI 2.3.0 normative edition')
}

function validateLocalDecisions() {
  for (const version of ['2.2.1', '2.3.0']) {
    const aggregate = readYaml(`openapi/ocpi-${version}/openapi.yaml`)
    check(
      aggregate.paths['/chargingprofiles/{session_id}/activeprofile'],
      `${version} must retain the activeprofile route`
    )
  }

  const aggregateConfig = JSON.parse(
    fs.readFileSync(path.join(root, 'openapi/ocpi-2.3.0/aggregate.json'), 'utf8')
  )
  check(aggregateConfig.exclude.includes('payments.yaml'), 'Payments must remain outside the 2.3.0 core aggregate')

  const payments = readYaml('openapi/ocpi-2.3.0/payments.yaml')
  for (const receiverPath of [
    '/payments/terminals/receiver',
    '/payments/terminals/receiver/{terminal_id}',
    '/payments/financial-advice-confirmations/receiver',
    '/payments/financial-advice-confirmations/receiver/{fac_id}'
  ]) {
    check(payments.paths[receiverPath], `missing local Receiver route ${receiverPath}`)
  }

  const commands = readYaml('openapi/ocpi-2.3.0/commands.yaml')
  const commandType = schema(commands, 'CommandType')
  check(Array.isArray(commandType.anyOf), 'OCPI 2.3.0 CommandType must remain extensible')
  check(
    commandType.anyOf.some((branch) => branch.type === 'string' && !branch.enum),
    'OCPI 2.3.0 CommandType must accept additional string values'
  )

  const invoiceReconciliation = readYaml('openapi/ocpi-2.3.0/invoice-reconciliation.yaml')
  const cdrs = schema(invoiceReconciliation, 'InvoiceReconciliationRecord').properties.cdrs
  equal(cdrs.minItems, 1, 'invoice reconciliation must contain at least one CDR')
  check(!Object.hasOwn(cdrs, 'maxItems'), 'invoice reconciliation CDRs must not have a non-normative maximum')
}

for (const version of ['2.2.1', '2.3.0']) {
  validateCoordinates(version)
  validateCanonicalSharedSchemas(version)
}

for (const versionDirectory of fs.readdirSync(path.join(root, 'openapi')).filter((name) => name.startsWith('ocpi-'))) {
  const directory = path.join(root, 'openapi', versionDirectory)
  for (const filePath of listYamlFiles(directory)) {
    const relativePath = path.relative(root, filePath)
    const document = readYaml(relativePath)
    validateEnumDescriptions(document, [relativePath])
    validateLicense(document, relativePath)
  }
}

validateLocalDecisions()
validateUpstreamRevisions()

console.log(`OpenAPI invariant checks passed (${assertionCount} assertions).`)
