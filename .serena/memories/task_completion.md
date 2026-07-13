# Task completion
- Run the narrowest relevant generator/build, then verify `git status --short` contains no incidental generated files.
- OpenAPI changes: run Redocly lint, Swagger CLI validation, Spectral with error severity, OpenAPI Generator validation, aggregate bundle validation, and `git diff --check`.
- API documentation rendering changes: run `npm run build:redoc` and/or `npm run build:swagger` as applicable; inspect generated output without committing it unless intended.
- Antora content/navigation changes: run `npm run build:antora`; run `npm run build:search` when indexing behavior changes.
- Imported specification examples: run `make check_json` and `make check_asciidoc` from the relevant `releases/` directory.
- Before handoff, review the scoped diff and report validations plus any documented limitation (notably the absent npm test suite).