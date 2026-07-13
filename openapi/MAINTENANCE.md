# OpenAPI Maintenance Workflow

This guide explains when and how to use the repository's OpenAPI maintenance tools. These commands are project-specific, so the workflow lives with the OpenAPI sources instead of in a user-level agent skill.

## Command reference

| Situation | Command | Purpose |
| --- | --- | --- |
| Editing one OCPI version | `npm run validate:openapi -- 2.3.0` | Runs all invariants, then validates only the selected version with Redocly, Spectral, and OpenAPI Generator. |
| Finishing any OpenAPI change | `npm run validate:openapi` | Validates every maintained version and every shared component document. |
| Checking repository-specific choices | `npm run test:openapi-invariants` | Checks canonical references, licenses, enum descriptions, compatibility routes, add-on exclusions, coordinate constraints, and pinned upstream revisions. |
| Building outside a Git worktree | `npm run build:site` | Builds Antora, Redoc, API diffs, Swagger UI, and Pagefind directly. |
| Building in a Conductor workspace | `npm run build:site:worktree` | Builds from a temporary standalone clone because Antora cannot use the worktree's `.git` pointer as a local content source. |
| Preparing to commit or push | `npm run check:github` | Reports the current branch, upstream state, remote delta, worktree state, and pull request. |

## Handle review feedback

Follow this sequence for inline review comments and audit findings:

1. Read [`DECISIONS.md`](DECISIONS.md) and identify whether the finding conflicts with an intentional version-specific decision.
2. Find the normative source revision in [`upstream-revisions.yaml`](upstream-revisions.yaml). Do not classify the official OpenAPI repository as normative.
3. Add or update an invariant before changing behavior when the decision can be tested automatically.
4. Apply the smallest valid correction.
5. Run the focused validation for the affected version.
6. Run the complete validation before committing.

When a scanner proposes a finite array bound, stricter regex, closed enum, or route removal, verify that the normative specification permits that restriction. Document deliberate scanner exceptions next to the affected schema and in `DECISIONS.md`.

## Update an audited upstream revision

Update `upstream-revisions.yaml` only after reviewing the new upstream content. Record full 40-character commit hashes rather than branch-only references.

Use the following commands to resolve the current commits:

```bash
git ls-remote https://github.com/ocpi/openapi-specification.git refs/heads/main
git ls-remote https://github.com/ocpi/ocpi.git refs/heads/release-2.2.1-bugfixes
git ls-remote https://github.com/ocpi/ocpi.git refs/heads/2.3.0/release/core
```

After changing a revision, review the corresponding normative and official OpenAPI diffs, update the version section in `DECISIONS.md`, and rerun `npm run validate:openapi`.

## Add or change an OCPI version

Before creating an OpenAPI version, import and maintain its normative specification under `specifications/` with `git subtree`. Preserve the upstream Git history, avoid rewriting subtree history, and prefer additive subtree updates.

When adding a version:

1. Add the source directory under `openapi/ocpi-x.y.z`.
2. Add immutable normative and official OpenAPI sources to `upstream-revisions.yaml`.
3. Add a version-specific section to `DECISIONS.md`.
4. Extend the invariant test when the version has intentional routes, open enums, add-on modules, or other compatibility choices.
5. Add or update `aggregate.json` when the core aggregate must exclude add-on modules.
6. Run the full validation and worktree-aware site build.

## Maintain tool versions

Redocly, Spectral, OpenAPI Generator CLI, and OpenAPI Changes are exact development dependencies in `package.json`. OpenAPI Generator's Java implementation is also pinned in `openapitools.json`.

Update tools intentionally with `npm install --save-dev --save-exact`, commit the resulting lockfile, and run `npm ci` before validation. Do not replace local commands with `npx --yes` because that can execute an unreviewed tool release.

The current moderate `js-yaml` audit findings originate from Antora. Do not force a breaking Antora downgrade or unsupported dependency override; reassess them when Antora accepts the patched `js-yaml` range.

## Use the Conductor integration

The shared `.conductor/settings.toml` exposes OpenAPI validation and the worktree-aware site build. Conductor applies shared repository settings after they are merged into the remote default branch.

The worktree build reuses the workspace's `node_modules` only when it matches the current package metadata. Otherwise, it runs `npm ci` inside the temporary clone. Set `KEEP_WORKTREE_BUILD=1` when troubleshooting to retain that clone after the build.
