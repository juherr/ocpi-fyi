# OpenAPI Maintenance Decisions

This document records intentional differences between the local OpenAPI descriptions, the official OCPI OpenAPI repository, and the normative OCPI specification. Maintainers must verify proposed changes against the normative specification before treating a difference from the official OpenAPI files as a defect.

The immutable source revisions used by the latest audit are listed in [`upstream-revisions.yaml`](upstream-revisions.yaml). The operational workflow and command reference are documented in [`MAINTENANCE.md`](MAINTENANCE.md).

## Decisions shared by all versions

### Source precedence

The normative OCPI specification takes precedence over the official OpenAPI description when the two disagree. The official OpenAPI repository remains the comparison baseline, but it does not define protocol requirements.

### Documentation metadata

Every standalone OpenAPI document, including shared component libraries, declares the Creative Commons Attribution-NoDerivatives 4.0 International license. Shared component files remain complete OpenAPI documents and therefore follow the same metadata rules as module files.

`format: enum` and `x-enumDescriptions` from the official OpenAPI files are non-normative documentation enhancements. The local descriptions may use `x-enumDescriptions` when the renderer supports it, but each mapping must remain attached to its enum and use exactly the same keys as the enum values.

### Canonical shared schemas

Shared primitive schemas live in `shared/schemas/types.yaml`, and shared location schemas live in `shared/schemas/locations.yaml`. `shared/common.yaml` preserves the public schema names through `$ref` entries instead of maintaining parallel inline definitions.

## OCPI 2.1.1 decisions

- `ModuleID` remains extensible through an unrestricted string branch. Its `x-enumDescriptions` mapping belongs to the branch that declares the known enum values so code generators can associate descriptions correctly.
- `VersionNumber` documents the known 2.0, 2.1, and 2.1.1 values as a closed enum because this discovery endpoint describes the versions known to OCPI 2.1.1.
- Shared types and location classes remain canonical schemas referenced by module-specific request and response models.

## OCPI 2.2.1 Edition 2 decisions

The normative source is the `2.2.1-d2` documentation release from `release-2.2.1-bugfixes`. Edition 2 clarifies the OCPI 2.2.1 specification without changing its protocol requirements.

- `PUT /chargingprofiles/{session_id}/activeprofile` remains available for compatibility. It must not be removed solely to match the official OpenAPI repository.
- Command enums remain closed. The open-enum convention introduced by OCPI 2.3.0 does not apply retroactively to OCPI 2.2.1.
- Latitude uses `maxLength: 11`, and longitude uses `maxLength: 12`. These limits accommodate every value accepted by the normative five-to-seven-decimal patterns, including a sign.
- Shared location classes and primitive types use their canonical definitions instead of parallel definitions in `shared/common.yaml`.

## OCPI 2.3.0 Edition 2 decisions

The Edition 2 core release at `2.3.0/release/core` is the primary normative source. The older `release-2.3.0-bugfixes` branch remains a supplementary historical reference.

- `PUT /chargingprofiles/{session_id}/activeprofile` remains available for compatibility.
- OCPI endpoint URLs are implementation-defined. Payments uses an explicit `/receiver` path segment to distinguish Receiver operations from Provider operations in generated documentation and clients.
- Payments remains an add-on module. `aggregate.json` excludes `payments.yaml` from the Edition 2 core aggregate while keeping the standalone module available.
- Invoice Reconciliation follows the normative `+` cardinality for `cdrs`: the array contains at least one item and has no specified upper bound. CKV_OPENAPI_21 must not introduce an arbitrary `maxItems` that would reject valid messages.
- `CommandType` remains extensible through an unrestricted string branch in addition to the documented command values.
- Latitude uses `maxLength: 11`, and longitude uses `maxLength: 12`, consistently with the allowed coordinate patterns.
- Shared location classes and primitive types use their canonical definitions instead of parallel definitions in `shared/common.yaml`.

## Review checklist

Before accepting an OpenAPI review suggestion:

1. Check whether `npm run test:openapi-invariants` already protects the behavior.
2. Compare the proposal with the pinned normative source in `upstream-revisions.yaml`.
3. Update the relevant version section when the proposal changes an intentional compatibility or modeling decision.
4. Run `npm run validate:openapi -- <version>` for a focused check, then run `npm run validate:openapi` before publication.
