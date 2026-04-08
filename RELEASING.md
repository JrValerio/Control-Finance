# Releasing

## Goal
Keep release, deploy, and runtime (`/health`) consistent and auditable.

## Release flow (8 steps)
1. Open a PR to `main` with the intended changes.
2. Review the full PR diff before merge with `git diff main...<branch>` (or the equivalent complete PR diff on GitHub). No merge to `main` should happen without this review.
3. Ensure CI is green (lint/test/build).
4. Merge to `main` (prefer squash merge).
5. Create tag `vX.Y.Z` and publish a GitHub Release (when applicable).
6. Deploy:
   - API on Render
   - Web on Vercel
7. Execute the production runbook checklist after deploy.
8. Record evidences for the release (links, `/health` output, smoke + monitoring outcome).

## References
- Production runbook: `docs/runbooks/release-production-checklist.md`
- PR template: `.github/pull_request_template.md`

## Golden rule (post-deploy)
After deploy, validate that runtime matches the intended release:
- `/health.version` is the expected API version
- `/health.commit` is the expected commit running in production
