// Generates a root OpenAPI spec (openapi.yaml) by aggregating paths from OCPI module specs.
// Usage:
//   node tools/generate-root-openapi.js 2.3.0
//   node tools/generate-root-openapi.js 2.3.0 --output public/api/.cache/aggregates/ocpi-2.3.0/openapi.yaml
//   node tools/generate-root-openapi.js 2.3.0 --check
//   OCPI_VERSION=2.3.0 node tools/generate-root-openapi.js
//
// Requirements:
//   npm i -D yaml

const fs = require("fs");
const path = require("path");
let yaml;
try {
  yaml = require("yaml");
} catch (e) {
  console.error("Missing dependency: yaml");
  console.error("Install it with: npm install --save-dev yaml");
  process.exit(1);
}

// ---- Arguments --------------------------------------------------------------
function parseArguments(args) {
  const options = { check: false, output: null, version: null };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--output") {
      options.output = args[++index];
      if (!options.output) {
        throw new Error("--output requires a path");
      }
    } else if (argument === "--help" || argument === "-h") {
      console.log("Usage: node tools/generate-root-openapi.js <version> [--output <path>] [--check]");
      process.exit(0);
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (!options.version) {
      options.version = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }

  return options;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}

const VERSION = options.version || process.env.OCPI_VERSION;

if (!VERSION) {
  console.error("ERROR: OCPI version is required. Example: node tools/generate-root-openapi.js 2.3.0");
  process.exit(1);
}

// ---- Paths ------------------------------------------------------------------
const VERSION_DIR = path.join("openapi", `ocpi-${VERSION}`);
const CANONICAL_OUTPUT_FILE = path.join(VERSION_DIR, "openapi.yaml");
const OUTPUT_FILE = options.output ? path.resolve(options.output) : path.resolve(CANONICAL_OUTPUT_FILE);
const AGGREGATE_CONFIG_FILE = path.join(VERSION_DIR, "aggregate.json");

// ---- Metadata ---------------------------------------------------------------
const ROOT_INFO = {
  title: `OCPI ${VERSION} API`,
  version: VERSION,
  license: {
    name: "Creative Commons Attribution-NoDerivatives 4.0 International",
    url: "https://creativecommons.org/licenses/by-nd/4.0/",
  },
};

function readAggregateConfig() {
  if (!fs.existsSync(AGGREGATE_CONFIG_FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(AGGREGATE_CONFIG_FILE, "utf8"));
}

// Optional servers
// const SERVERS = [{ url: "https://api.example.com" }];

// ---- Helpers ----------------------------------------------------------------
function toJsonPointerKey(key) {
  // JSON Pointer escaping: "~" => "~0", "/" => "~1"
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function toKebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function isYamlFile(fileName) {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function isSharedFile(filePath) {
  return filePath.includes(`${path.sep}shared${path.sep}`);
}

function readYaml(filePath) {
  return yaml.parse(fs.readFileSync(filePath, "utf8"));
}

function relativeRef(fromFile, toFile) {
  const relativePath = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function listModuleSpecs(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      files.push(...listModuleSpecs(full));
      continue;
    }

    if (e.isFile() && isYamlFile(e.name)) {
      files.push(full);
    }
  }

  return files
    .filter((f) => !f.endsWith(path.sep + "openapi.yaml") && !f.endsWith(path.sep + "openapi.yml"))
    .filter((f) => !isSharedFile(f))
    // keep only top-level module specs (OCPI convention)
    .filter((f) => path.dirname(f) === path.resolve(dir));
}

// ---- Main -------------------------------------------------------------------
function main() {
  const baseDirAbs = path.resolve(VERSION_DIR);
  const aggregateConfig = readAggregateConfig();
  const excludedModules = new Set(aggregateConfig.exclude || []);

  if (!fs.existsSync(baseDirAbs)) {
    console.error(`ERROR: directory not found: ${VERSION_DIR}`);
    process.exit(1);
  }

  const specFiles = listModuleSpecs(baseDirAbs)
    .filter((filePath) => !excludedModules.has(path.basename(filePath)))
    .sort((a, b) => a.localeCompare(b));

  if (specFiles.length === 0) {
    console.error(`ERROR: no module specs found in ${VERSION_DIR}`);
    process.exit(1);
  }

  const root = {
    openapi: "3.1.0",
    info: {
      ...ROOT_INFO,
      ...(aggregateConfig.info || {}),
    },
    security: [{ TokenAuth: [] }],
    paths: {},
    webhooks: {},
    components: {
      securitySchemes: {
        TokenAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: aggregateConfig.tokenAuthDescription ||
            "OCPI credentials token passed as `Token <base64-encoded-credentials-token>` in the Authorization header.",
        },
      },
    },
    // servers: SERVERS,
  };

  if (aggregateConfig.externalDocs) {
    root.externalDocs = aggregateConfig.externalDocs;
  }

  const collisions = [];
  let totalPaths = 0;

  let totalWebhooks = 0;

  for (const filePath of specFiles) {
    const doc = readYaml(filePath);
    const fileName = path.basename(filePath);

    if (doc?.paths) {
      for (const p of Object.keys(doc.paths)) {
        totalPaths++;

        if (root.paths[p]) {
          collisions.push({ path: p, from: fileName });
          continue; // keep first occurrence
        }

        root.paths[p] = {
          $ref: `${relativeRef(OUTPUT_FILE, filePath)}#/paths/${toJsonPointerKey(p)}`,
        };
      }
    }

    if (doc?.webhooks) {
      for (const name of Object.keys(doc.webhooks)) {
        totalWebhooks++;
        const key = toKebabCase(name);

        if (root.webhooks[key]) {
          collisions.push({ webhook: key, from: fileName });
          continue;
        }

        root.webhooks[key] = {
          $ref: `${relativeRef(OUTPUT_FILE, filePath)}#/webhooks/${toJsonPointerKey(name)}`,
        };
      }
    }
  }

  const webhookCount = Object.keys(root.webhooks).length;

  // Remove webhooks key if empty to keep output clean
  if (webhookCount === 0) {
    delete root.webhooks;
  }

  if (options.check) {
    if (!fs.existsSync(OUTPUT_FILE)) {
      console.error(`ERROR: aggregate is missing: ${OUTPUT_FILE}`);
      process.exit(1);
    }

    const current = canonicalize(readYaml(OUTPUT_FILE));
    const expected = canonicalize(root);
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      console.error(`ERROR: aggregate is out of date: ${OUTPUT_FILE}`);
      process.exit(1);
    }
    console.log(`✔ Aggregate is up to date: ${OUTPUT_FILE}`);
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, yaml.stringify(root), "utf8");

  console.log(`✔ Generated ${OUTPUT_FILE}`);
  console.log(`  OCPI version: ${VERSION}`);
  console.log(`  Module specs: ${specFiles.length}`);
  console.log(`  Paths found: ${totalPaths}`);
  console.log(`  Paths exported: ${Object.keys(root.paths).length}`);
  console.log(`  Webhooks found: ${totalWebhooks}`);
  console.log(`  Webhooks exported: ${webhookCount}`);

  if (collisions.length) {
    console.warn(`⚠ Collisions detected (${collisions.length})`);
    collisions.slice(0, 10).forEach((c) => {
      const key = c.path ? `path: ${c.path}` : `webhook: ${c.webhook}`;
      console.warn(`  - ${key} (duplicate in ${c.from})`);
    });
  }

  console.log("\nNext steps:");
  console.log(`  npm exec -- redocly lint ${OUTPUT_FILE}`);
  console.log(`  npm exec -- redocly build-docs ${OUTPUT_FILE} --output dist/redoc/${VERSION}/index.html`);
}

main();
