# Tech stack
- Node.js/npm site tooling; dependency versions are pinned/resolved through `package.json` and `package-lock.json`.
- Antora generates versioned specification pages.
- Redoc and Swagger UI generate API explorer pages.
- Redocly CLI, Swagger CLI, Spectral, and OpenAPI Generator validate OpenAPI descriptions.
- Pagefind indexes specification HTML only; `/api/` pages are intentionally excluded.
- Official OCPI source documents use AsciiDoc for newer versions and Markdown for OCPI 2.1.1-era sources.
- Shell environment is zsh on macOS/Darwin.