# Conventions
- Use Conventional Commits; branch names, commit messages, PR titles/bodies, code comments, documentation, changelog, and release notes are English.
- Preserve existing YAML formatting and keep changes version-scoped.
- Use OpenAPI `x-enumDescriptions` for Redoc enum documentation; enum openness must follow the normative OCPI version, not later-version assumptions.
- Keep duplicated schemas synchronized or reference a canonical shared schema when behavior permits.
- Do not change endpoint paths or payload schemas while performing documentation-only enum alignment.
- Keep Antora/Swagger/Redoc navigation text in English and preserve the full default Antora header structure.
- Use git subtree for official specification imports; target the corresponding upstream release bugfix branch.