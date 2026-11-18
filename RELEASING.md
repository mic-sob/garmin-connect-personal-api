# Releasing

The package is published to npm from a tagged Git commit. CI validates on every
push and publishes on `v*` tags.

## Prerequisites

- A GitHub repository with the `NPM_TOKEN` secret set to an npm automation
  access token.
- `@mic-sob` scope on npm, or change `publishConfig.access` to `"restricted"`.

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
