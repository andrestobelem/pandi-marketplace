# pandi-marketplace

## Commits

- Conventional Commits with an explicit scope, e.g. `feat(pandi-launchpad): add lp_ask tool`.
- Atomic commits: one coherent change per commit.
- Never add `Co-Authored-By:` or any other AI attribution — not in commit messages,
  commit descriptions, PR titles/bodies, branch names, or anywhere else in this repo.

## Development

- Feature work follows TDD (`/tdd`): write the test first, watch it fail, then
  implement.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
