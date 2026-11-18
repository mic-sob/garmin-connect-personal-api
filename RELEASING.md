# Releasing

The package is published to npm from a tagged Git commit. CI validates on every
push and publishes on `v*` tags.

## Prerequisites

- npm Trusted Publishing configured for the GitHub repository (see below) —
  no npm token is stored in GitHub.
- `@micsob` scope on npm, or change `publishConfig.access` to `"restricted"`.

## Trusted publishing (OIDC)

The publish workflow authenticates with a short-lived OIDC token, not a stored
secret. Configure it once on npm:

1. Ensure the package exists on npm (publish it once manually if needed).
2. On the package page: **Settings → Access → Trusted Publishing →
   Add trusted publisher**.
3. Owner = the GitHub user/org, Repository = this repo,
   Workflow = `publish.yml`, Environment = (leave empty).

## Steps

1. Bump `version` in `package.json` (semver).
2. Commit: `git commit -am "chore: bump version to <version>"`.
3. Tag and push:

   ```bash
   git tag v<version>
   git push origin main --tags
   ```

4. The `Publish` workflow runs `prepublishOnly` (`vp pack --attw --publint`,
   which builds and validates types), then `pnpm publish`.

## Manual publish

```bash
pnpm install --frozen-lockfile
pnpm exec vp pack --attw --publint   # validate build + types
npm publish --access public
```
