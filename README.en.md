# @54145a/dsh-workbuddy-connect — patch branch with CodeBuddy CLI sign-in

English | [中文](./README.md)

This repository is a **patch branch** of
[dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)
(upstream), published to npm as `@54145a/dsh-workbuddy-connect` and based on
upstream **v0.7.8**.

Upstream reads the sign-in only from the **WorkBuddy / WorkBuddy AI desktop
app**. This patch adds a second source: the **CodeBuddy CLI sign-in**. What used
to require the desktop app now also works with just the CLI installed and
logged in.

> For upstream documentation (install, version-compatibility table, known
> limitations, disclaimer) see
> <https://github.com/corrinehu/dsh-workbuddy-connect>.
> This file only covers **what the patch changes, how to install it, and its
> boundaries**.

## Install

```sh
# Web profile (core 0.2.1-rc.2 -> this package 0.7.8-cli.1)
dsh plugin --profile web add @54145a/dsh-workbuddy-connect
dsh web

# Or straight from the repository
dsh plugin --profile web add github:54145a/dsh-workbuddy-connect
```

Sign in once — **the desktop app or the CodeBuddy CLI both work**:

```sh
codebuddy login          # or sign in to the WorkBuddy desktop app
```

## What the patch does

The CodeBuddy CLI and the WorkBuddy desktop app write their credentials into the
**same directory**, differing only by filename:

| Source | File (in the shared directory) |
|---|---|
| WorkBuddy desktop app (CN) | `workbuddy-desktop.info` |
| WorkBuddy AI desktop app (global) | `workbuddy-desktop-ai.info` |
| **CodeBuddy CLI (added by this patch)** | `Tencent-Cloud.coding-copilot.info` |

The directory itself (`CodeBuddyExtension/Data/Public/auth/`) and the
per-platform probe order are reused verbatim from upstream: macOS
`Application Support`, Windows Local→Roaming AppData, Linux XDG config→data
home, WSL's mounted Windows profile first. The patch only **appends the CLI
filename after every desktop candidate**, so it introduces no new path rules.

**The desktop app remains the identity authority**: the CLI file is consulted
only when no desktop candidate yields a credential.

## Behavioral contract

In order of importance, these are the boundaries the patch deliberately draws:

1. **Desktop first, CLI as fallback.** When the desktop app is signed in, the
   desktop credential is always used and the CLI file is not even read. The CLI
   is reached only after the desktop app signs out (its file stays valid JSON
   but carries no token).
2. **A corrupt desktop file still fails loudly and is not papered over by the
   CLI.** An unparsable file, or a failed decryption of an encrypted credential,
   **throws** exactly as upstream does. The desktop file is the identity
   authority; a broken one is a problem to fix, not a reason to quietly switch
   sign-ins.
3. **Cross-region is skipped, never an error.** Because both products share one
   directory, "the global plugin meets a CN CLI sign-in" is **coexistence**, not
   misconfiguration: a region-mismatched CLI file is silently skipped. The
   `credential-region-mismatch` throw in `current()` is reserved for a
   **desktop** file pointed at the wrong product. Each variant honors only its
   own region's CLI sign-in.
4. **An explicit path is never widened.** A path given via the `authFile`
   setting or the `WORKBUDDY_AUTH_FILE` env var (international:
   `WORKBUDDY_AI_AUTH_FILE`) is used **verbatim** and does not pick up the CLI
   file alongside it. Even when that path names the CLI's file, it is treated
   with desktop semantics.
5. **The CLI file is never written back to.** The CLI owns its file. Refreshed
   credentials go to the plugin-owned copy under `$DSH_HOME`, exactly as
   upstream treats the desktop file.
6. **Status still reports `desktop`.** The patch does **not** add a `cli` source
   label — a CLI credential enters the desktop slot on read, so the `source`
   field in `status` / `doctor` still prints `desktop` for a CLI sign-in. This
   is deliberate: a smaller diff is easier to rebase across upstream releases.

## Differences from upstream

Against upstream v0.7.8:

| File | Change |
|---|---|
| `src/auth.ts` | Core: `CLI_AUTH_FILENAME` constant, CLI file appended to the candidate list, `readDesktop()` split into the upstream desktop probe (verbatim) plus a region-filtered CLI segment |
| `src/bin.ts` | Copy only: doctor hints mention the CLI |
| `src/client/index.tsx` | Copy only: overrides the four `intro` / `signedOutHint` keys at `locale.register`; `locales.ts` is left untouched |
| `package.json` | Renamed to `@54145a/dsh-workbuddy-connect`; author/repository point at this fork |
| `cordis.patch.yml` | The patch entry's `name` follows the package name, now scoped |
| `tests/*.spec.ts` | Two assertions invalidated by the candidate append rewritten; CLI fallback and copy-override cases added |
| `.github/workflows/release.yml` | Added: publishes to npm on a tag push |
| `.gitattributes` | Declares both READMEs as `merge=ours` when syncing upstream |

**Unchanged**: `src/client/locales.ts` (byte-identical to upstream),
`upstream.ts`, `variants.ts`, `status-paths.ts`,
`desktop-credential-protection.ts`, `catalog.ts`, `web-status.ts`. The routes
under `/plugins/dsh-workbuddy-connect/...` are hard-coded literals unrelated to
the package name, so scoping does not affect them.

## Syncing upstream

The changes here are deliberately concentrated in files upstream rarely touches.
Measured on a simulated release, a sync needs **one manual merge** — `package.json`:

```sh
git remote add upstream https://github.com/corrinehu/dsh-workbuddy-connect.git
git fetch upstream --tags
git merge upstream/main          # or a specific tag
# merge package.json by hand (version + @deepseek-ai peer range); the rest is automatic
pnpm check                       # regenerates lib/ and verifies
```

Why only one:

- **`src/auth.ts` is the only core file changed**, and recent upstream releases
  have not touched it at all (v0.7.7 -> v0.7.8 changed it zero times).
- **`locales.ts` is byte-identical to upstream** — the copy is overridden at the
  registration site in `index.tsx`. Upstream rewrites those very keys often
  (v0.7.8 changed `intro` and `signedOutHint`), so leaving the copy in
  `locales.ts` would make every release a manual merge.
- **Both READMEs are declared `merge=ours`** in `.gitattributes`: they were
  rewritten as this fork's documentation, so upstream's edits are not merged.

Two caveats worth knowing:

1. **`merge=ours` needs a local git setting.** The driver is a built-in git
   convention, but its definition lives in `.git/config` and **does not travel
   with a clone**, so on a new machine run this once:
   ```sh
   git config merge.ours.driver true
   ```
   Without it git does not recognize the driver and the attribute **degrades to
   an ordinary conflict** — a safe failure, nothing is silently lost.
2. **`package.json` must never be added to `.gitattributes`.** Measured: with
   `merge=ours` on it, a merge resolved with **zero conflicts** while upstream's
   version and `@deepseek-ai` peer range were **silently discarded** (left at the
   old values) — and that range is exactly what decides whether the plugin loads
   on the next DSH core line. It stays a manual merge.

## Releasing (maintainer)

### Version scheme

The version is **upstream baseline + `-cli.N`**, so the mapping stays obvious
when upstream ships a new release:

| Upstream | This package |
|---|---|
| 0.7.8 | `0.7.8-cli.1`, `0.7.8-cli.2`, … |
| 0.7.9 | `0.7.9-cli.1`, … |

`-cli.1` is a valid semver **prerelease**, which sorts below `0.7.8`:

```
0.7.8-cli.1 < 0.7.8-cli.2 < 0.7.8 < 0.7.9-cli.1 < 0.7.9
```

Do **not** use `0.7.8+cli.1`: semver treats that as build metadata, so it is
*equal* to `0.7.8` and cannot distinguish the two packages.

### Steps

```sh
# 1. Bump the version and rebuild (edit by hand; `pnpm pkg set` reorders devDependencies)
sed -i 's/^  "version": ".*",$/  "version": "0.7.8-cli.2",/' package.json
pnpm check                               # typecheck + tests + build, regenerates lib/
git commit -am "chore: release 0.7.8-cli.2"
git push

# 2. Tag and push — this is what triggers the publish
git tag v0.7.8-cli.2
git push origin v0.7.8-cli.2
```

On a `v*` tag the workflow installs dependencies, runs `pnpm check`, verifies the
tag against `package.json`, then runs
`pnpm publish --access public --provenance --no-git-checks --tag latest` using
the repository secret `NPM_TOKEN`.

### Points that must be explicit

- **`--tag latest` must be spelled out.** The version is a prerelease and the two
  tools disagree on what that implies: npm **refuses** to publish one without
  `--tag` (`You must specify a tag using --tag`), while pnpm publishes it
  silently. Leaving it to pnpm's default would make the dist-tag depend on
  undocumented behaviour. `latest` is deliberate so a plain
  `dsh plugin add @54145a/dsh-workbuddy-connect` resolves to this build.
- **A semver RANGE will not match a prerelease**: `^0.7.8` and `>=0.7.8` both fail
  against `0.7.8-cli.1`. Installs must therefore be untagged or exact, never a
  range.
- **pnpm 12 is required**: `--provenance` needs pnpm >= 12 (pnpm 10/11's `publish`
  has no such flag). Upstream's `diagnostics.yml` pins pnpm 10 — that is a
  *testing* version and must not be copied for publishing.
- **Registry auth**: pnpm **refuses** to expand `${NODE_AUTH_TOKEN}` from a
  *project*-level `.npmrc`, because a repository-controlled file must not be able
  to read credentials. Auth therefore depends on `actions/setup-node` writing its
  `.npmrc` to `$RUNNER_TEMP` (outside the repo) and exporting
  `NPM_CONFIG_USERCONFIG`, which pnpm treats as user-level.
- **`NPM_CONFIG_REGISTRY` is set explicitly**: publishing is the one operation
  where silently landing on a configured mirror is not a performance question.
- **`--no-git-checks` is required**, not a shortcut: `actions/checkout` leaves a
  detached HEAD on a tag, and pnpm's default `publish-branch` check
  (`master|main`) needs an attached branch name, so the publish would fail with
  `ERR_PNPM_GIT_UNKNOWN_BRANCH`. Working-tree cleanliness is already enforced by
  the preceding `pnpm check`, which leaves the tree clean.

**One-time setup**: add `NPM_TOKEN` under the GitHub repository's Settings →
Secrets and variables → Actions, holding an npm **Automation** token (that type
skips OTP, which is what CI needs). The token must be allowed to publish in the
`@54145a` scope.

## Usage

```sh
dsh plugin --profile web exec dsh-workbuddy-connect doctor --json
dsh plugin --profile web exec dsh-workbuddy-connect status --json
```

The command after `exec` is the package's **bin name**
(`dsh-workbuddy-connect`), independent of whether the package name is scoped.

With only the CodeBuddy CLI signed in, `doctor` reports:

```json
{
  "desktopAuthFile": {
    "path": "/home/<user>/.local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info",
    "present": true,
    "format": "plaintext"
  },
  "signIn": "signed-in"
}
```

`path` names **the file actually hit** (here, the CLI file), which is upstream's
existing diagnostic semantics.

## Known boundaries and risks

- **refresh_token rotation race (real; not handled by this patch).** The CLI and
  WorkBuddy share the same refresh endpoint, and refreshing **rotates** the
  refresh_token: in one live run it went from 1088 to 700 characters. If the
  plugin, the real CodeBuddy CLI, or `dsh-codebuddy-cli` hold the same account's
  refresh chain concurrently, whichever refreshes first invalidates the other's
  refresh_token. This is **the same level as upstream's status quo** (upstream
  likewise shares the chain with the desktop app), so the patch changes no code
  and only warns here: on a mysterious "sign-in expired", sign in again.
- **The CLI file format is verified against a real install only.** A live
  CodeBuddy CLI 2.63.x CN account writes **plaintext JSON** (`auth.domain =
  "www.codebuddy.cn"`), which upstream's existing parser reads directly. If the
  CLI later switches to an encrypted envelope or another schema, that file is
  classified `unrecognized`/`encrypted` and **silently skipped** (the fallback
  segment never throws), surfacing as "the CLI sign-in doesn't work" rather than
  an error.
- **XDG edge cases.** On the test machine the CLI writes under `~/.local/share`
  (data home), and upstream's Linux candidates probe both, so it is found. But
  with a non-default `XDG_CONFIG_HOME`/`XDG_DATA_HOME`, if the CLI binary honors
  only one of `~/.config` or `~/.local/share`, the fallback can miss — point
  `WORKBUDDY_AUTH_FILE` straight at the CLI file (it is then handled with
  desktop semantics; see contract 4).
- **The global variant's `doctor` `present` flag is optimistic.** With only a CN
  CLI file present, the global variant still reports `present: true` (the file
  does exist) while the credential is region-skipped and `signIn` stays
  `signed-out`. A display-only imprecision, accepted.
- **Peer dependencies are bound to a core line.** This package targets DSH core
  **0.2.1-rc.2**. On core 0.2.1-rc.1 use upstream 0.7.7; on 0.2.0-rc.2 use
  upstream 0.7.6. Installing across core lines makes DSH fail to start.
- **Other CLI capabilities are out of scope.** Only the sign-in is reused; the
  CLI's `X-IDE-Type: cli` client identity, multi-account support, daily
  check-in, and the credits panel are untouched.

## Verification

- Unit tests: `pnpm check` (typecheck + 804 tests + build) is green; the new CLI
  fallback cases **fail** against the unpatched code, so they are not vacuous.
- Live (this machine has no WorkBuddy desktop app, only a CodeBuddy CLI
  sign-in): installed into a real DSH Web profile,
  `GET /plugins/dsh-workbuddy-connect/status` returned `signed-in` with the real
  account and `catalog.source: live`; the auth directory held **only** the CLI
  file — no desktop file and no plugin-owned copy — so that sign-in could only
  have come from the CLI.
- Refresh path: a CLI credential successfully exchanged for a new access token
  through WorkBuddy's refresh endpoint, and the **original CLI file was left
  byte-identical** (matching sha256 before and after).

## License

Same as upstream, [MIT](./LICENSE).
