import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WORKBUDDY_CONNECT_VERSION } from '../src/version.ts'

/**
 * Guard the single-source-of-truth version contract:
 * - the build-time define injects package.json's version into src/version.ts;
 * - if that define is ever dropped, version.ts falls back to '0.0.0-dev' and
 *   this test goes red, flagging the regression (and the drift it would cause
 *   in heartbeat / CLI output).
 */
describe('package version sync', () => {
  it('WORKBUDDY_CONNECT_VERSION matches package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(WORKBUDDY_CONNECT_VERSION).toBe(pkg.version)
  })

  it('never leaks a build-define fallback marker', () => {
    expect(WORKBUDDY_CONNECT_VERSION).not.toBe('0.0.0-dev')
  })

  /**
   * The define reads package.json at BUILD time, so a release that bumps the
   * version after building ships artifacts reporting the old one (issue #1:
   * v0.2.2 bundles said 0.2.1). Skipped on a fresh clone before the first build.
   *
   * The version literal may land in `index.js` or in a shared chunk beside it
   * (rollup decides which, and the chunk's hashed filename changes with the
   * module graph), so every emitted `.js` is scanned rather than one guessed
   * filename. Searching all of them is what keeps this guard meaningful: the
   * assertion is "the shipped artifacts carry this version", not "the bundle
   * was laid out this way".
   */
  it('built lib/ artifacts carry the current version when present', () => {
    const libDir = new URL('../lib/', import.meta.url)
    if (!existsSync(libDir)) return
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    const bundles = readdirSync(libDir).filter(name => name.endsWith('.js'))
    expect(bundles.length, 'no built bundles in lib/ — run the build before this test').toBeGreaterThan(0)
    const declaring = bundles.filter(bundle =>
      readFileSync(new URL(`../lib/${bundle}`, import.meta.url), 'utf8')
        .includes(`WORKBUDDY_CONNECT_VERSION = "${pkg.version}"`),
    )
    expect(
      declaring,
      `no built bundle declares WORKBUDDY_CONNECT_VERSION as "${pkg.version}" — rebuild before committing or publishing`,
    ).not.toHaveLength(0)
  })

  it('built bundles need no runtime import of the atomic-write helper', () => {
    const libDir = new URL('../lib/', import.meta.url)
    if (!existsSync(libDir)) return
    for (const name of readdirSync(libDir).filter(name => name.endsWith('.js'))) {
      const source = readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')
      expect(source, `${name} still requires the host atomic-write package`)
        .not.toMatch(/(?:from\s*|import\s*\(|require\s*\()\s*['"]@deepseek-ai\/dsh-atomic-write['"]/)
    }
  })

  /**
   * The browser bundle registers itself with `__ModuleLoader__.load({ id })`,
   * and the host looks that id up by PACKAGE NAME: it builds the bundle URL as
   * `/plugins/<package name>/client.js` and fails with "loaded without
   * registering" when the two disagree.
   *
   * A rename that misses this — the package renamed to a scope while the build
   * config kept the old bare id — reaches the user as a plugin page that cannot
   * load its card, which nothing else here catches: the id is injected by the
   * build config, and the slot specs pass a key of their own.
   */
  it('built client bundle registers under the package name', () => {
    const bundle = new URL('../lib/client.js', import.meta.url)
    if (!existsSync(bundle)) return
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string }
    const source = readFileSync(bundle, 'utf8')
    const id = /__ModuleLoader__\.load\(\{\s*id:\s*"([^"]+)"/.exec(source)?.[1]
    expect(id, 'lib/client.js declares no __ModuleLoader__.load id — rebuild before this test')
      .toBeDefined()
    expect(id).toBe(pkg.name)
  })
})

describe('peer manifest pins the verified DSH cores', () => {
  /**
   * #69's lesson: a caret on a prerelease arm (`^0.2.0-rc.1`) silently
   * admits every later rc of the same tuple — semver auto-extends support
   * nobody verified. Since 0.7.0 the seven DSH service peers are pinned to
   * exactly the cores this release was smoke-tested on; extending support
   * means editing this list after a real run, not letting a caret do it.
   * Since 0.7.7 the list was 0.2.1-rc.1 alone: 0.2.0-rc.2 cannot be
   * smoke-tested anymore alongside it, and an untested arm is support
   * nobody verified. This candidate targets 0.2.1-rc.2 and bundles the
   * official atomic-write helper. Local checks do not replace Desktop
   * acceptance testing.
   *
   * #74's lesson on top of it: pi-ai must NOT be a dual-arm range. An
   * in-place upgrade from a 0.6.x-era pnpm profile keeps satisfying
   * `^0.85.1 || ^0.87.1` with the old 0.85.1 install, reproducing #69's
   * two-generation mixing against an rc.2 host that ships 0.87.1.
   *
   * #92 extended that lesson one step further: even the caret-free `^0.87.1`
   * peer range was not enough, because a peer is only a claim about what the
   * *installer* should provide. pi-ai is therefore a pinned regular
   * dependency now; the assertion below pins that shape.
   */
  const DSH_SERVICE_PEERS = [
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/dsh-home-paths',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-llm-pi-ai',
    '@deepseek-ai/dsh-settings',
  ] as const

  it('each DSH service peer is an exact, caret-free list of verified cores', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { peerDependencies: Record<string, string> }
    for (const name of DSH_SERVICE_PEERS) {
      expect(pkg.peerDependencies[name], `${name} missing from peerDependencies`).toBe('0.2.1-rc.2')
    }
  })

  it('bundles the official atomic-write helper instead of requiring a host peer', () => {
    // The Desktop report could not resolve this peer. Keep the official
    // implementation and include it in lib so runtime resolution is unnecessary.
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { peerDependencies: Record<string, string>, devDependencies: Record<string, string> }
    expect(pkg.devDependencies['@deepseek-ai/dsh-atomic-write']).toBe('0.2.1-rc.2')
    expect(pkg.peerDependencies['@deepseek-ai/dsh-atomic-write']).toBeUndefined()
  })

  it('pi-ai is a pinned runtime dependency, not a peer', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      peerDependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    // #92's lesson, on top of #74's: a peer declaration cannot survive a
    // hoisted profile. With `nodeLinker: hoisted` and `autoInstallPeers:
    // false`, no install claims our peer, so a co-installed plugin's older
    // pi-ai at the profile root wins bare-specifier resolution and the plugin
    // loads the wrong generation. A regular dependency installs beside the
    // plugin and resolves first, whatever the profile root holds.
    expect(pkg.dependencies?.['@earendil-works/pi-ai']).toBe('1.3.0')
    expect(
      pkg.peerDependencies['@earendil-works/pi-ai'],
      'pi-ai must not also be a peer: a peer declaration is what allowed the hoisted copy to win',
    ).toBeUndefined()
    // The dev entry keeps local builds and tests on the same generation, and
    // stays exact so no caret can widen the supported set by itself.
    expect(pkg.devDependencies['@earendil-works/pi-ai']).toBe('1.3.0')
  })
})

describe('package identity is consistent across the files a rename must touch', () => {
  /**
   * A rename has to land in four places that no compiler checks: package.json's
   * name, the browser bundle's __ModuleLoader__ id (injected by tsdown.config),
   * the Plugins-page dispatch key (BUNDLE_NAME), and the loader patch entry.
   *
   * Missing any one fails at runtime, not at build time. The scope rename
   * shipped with the bundle id still bare and the plugin card could not load
   * at all, so this pins all four to package.json as the single source.
   */
  it('matches package.json in the bundle id, the slot key, and the patch entry', async () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string }

    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const patchNames = [...patch.matchAll(/^\s*name:\s*"?([^"\n]+?)"?\s*$/gmu)].map(match => match[1]!.trim())
    expect(patchNames).toContain(pkg.name)

    const buildConfig = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')
    expect(buildConfig, 'tsdown.config.ts PLUGIN_ID must equal package.json name')
      .toContain(`'${pkg.name}'`)

    // Read the declaration as text: this spec lives under the server tsconfig,
    // which does not enable JSX, so importing the .tsx module would not typecheck.
    const clientEntry = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    const bundleName = /export const BUNDLE_NAME = '([^']+)'/.exec(clientEntry)?.[1]
    expect(bundleName, 'src/client/index.tsx declares no BUNDLE_NAME').toBeDefined()
    expect(bundleName).toBe(pkg.name)
  })
})
