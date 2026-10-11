# Releasing

Pushing a version tag such as `v0.2.0` runs `.github/workflows/release.yml`. The workflow checks, builds and publishes one tarball. The same file goes to npm (with a provenance attestation) and to a GitHub release with generated notes.

## Two version numbers

- **Package version** (`version` in `package.json`) identifies a CLI release. Bump it for every release.
- **Suite version** (`VERSION` in `src/model.ts`) is recorded in every run as `suite_version`. Bump it only when scenario semantics change ([contributing](contributing.md), step 5). `replay` refuses evidence from a different suite version, so a package-only release must leave it alone.

`flow-conformance --version` prints both, for example `0.3.0 (suite 0.2.0)`.

## One-time setup

1. **npm.** Sign in to an npm account that will own `flow-conformance-lab`. The name was unclaimed on 2026-10-11; the first publish claims it. Create a granular access token with read and write access to packages. Before the first publish the package does not exist yet, so the token needs access to all packages; afterwards, narrow it to `flow-conformance-lab`.
2. **GitHub.** Under _Settings → Environments_, create an environment named `release` and add the token as the secret `NPM_TOKEN`. Add yourself as a required reviewer if every publish should wait for approval, and limit the environment to `v*` tags.

npm also supports trusted publishing from GitHub Actions, which needs no long-lived token. Once the package exists, you can configure it in the package settings on npmjs.com by following npm's guide.

## Cutting a release

1. Make sure `main` is green.
2. Use Node 24, as CI does, then bump the version. This updates `package.json` and `package-lock.json`, commits, and creates the tag:

   ```sh
   npm version 0.2.0 -m "Release v%s"
   git push origin main --follow-tags
   ```

   If `main` only accepts pull requests, merge the version bump through one, then tag that merge commit:

   ```sh
   git tag v0.2.0 <merge-commit>
   git push origin v0.2.0
   ```

3. The workflow then:
   - refuses a tag that does not match `package.json`;
   - runs `npm ci`, the build, the format check, the tests and the demo (with `FLOW_CONFORMANCE_LOOPBACK_ONLY=1`);
   - packs `flow-conformance-lab-<version>.tgz`;
   - publishes that tarball to npm with `--provenance`;
   - creates the GitHub release with the same tarball attached.
4. Verify the release:

   ```sh
   npm view flow-conformance-lab version
   npx --package flow-conformance-lab@0.2.0 flow-conformance --version
   ```

   The npm package page should show the provenance badge linking back to the workflow run.

## When something fails

- **Before the publish step:** fix the problem on `main`, then delete and recreate the tag:

  ```sh
  git push --delete origin v0.2.0
  git tag -d v0.2.0
  ```

- **Publish succeeded but the GitHub release failed:** don't re-run the job, because npm rejects a version that already exists. Create the release by hand from the exact published tarball:

  ```sh
  npm pack flow-conformance-lab@0.2.0
  gh release create v0.2.0 flow-conformance-lab-0.2.0.tgz --verify-tag --generate-notes
  ```

- npm versions are immutable. Never reuse a version number; publish a new patch release instead.

## What the package contains

The tarball holds only the built CLI and library (`dist/apps/cli`, `dist/src`, `dist/suites`), the bundled inspector assets, `schemas/run.schema.json`, `examples/target.json`, the README and the licence. Check the list before changing `files` in `package.json`:

```sh
npm pack --dry-run --ignore-scripts
```

The installed CLI has no default config file, so users always pass `--config`. The hosted demo is built separately by `npm run vercel-build` and labelled as a sample report.
