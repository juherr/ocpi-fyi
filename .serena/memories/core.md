# Project core
- Multi-version OCPI documentation site for ocpi.fyi.
- Official specification mirrors live under `specifications/ocpi-<version>`; preserve subtree history and never rewrite imported history.
- OpenAPI sources live under `openapi/ocpi-<version>`; each version has an aggregate `openapi.yaml` plus module/shared YAML files.
- Generated public output lives under `public/`; avoid committing incidental generated output unless requested.
- Optional `aggregate.json` controls root metadata and excludes add-on modules from the core aggregate.
- Public UI and generated technical content are English; user-facing collaboration is French.
- Build/tool details: `mem:tech_stack`. Commands: `mem:suggested_commands`. Completion gates: `mem:task_completion`. Conventions: `mem:conventions`.