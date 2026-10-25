import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

async function main() {
    const repository = resolve(__dirname, '../../..')
    const publicApiUrl = 'https://preview.example.invalid'
    const serverSettings = ['MONGODB_URI', 'SESSION_SIGNING_SECRET', 'PROVIDER_SECRET']
    const markers = serverSettings.map((setting, index) => {
        const marker = `DISPOSABLE_SERVER_ONLY_005_${index}`
        process.env[setting] = marker
        return marker
    })

    // Model Expo's documented public-value substitution with a real JS bundler.
    // Only this allowlisted public expression is defined; never inline process.env.
    const result = await build({
        absWorkingDir: repository,
        entryPoints: ['apps/mobile/src/config.ts'],
        bundle: true,
        platform: 'browser',
        format: 'iife',
        globalName: 'WhispPublicConfig',
        define: { 'process.env.EXPO_PUBLIC_API_URL': JSON.stringify(publicApiUrl) },
        write: false,
        metafile: true,
        logLevel: 'silent',
    })
    const bundle = result.outputFiles[0].text
    assert.ok(bundle.includes(publicApiUrl), 'Sample bundle must contain its public URL')
    for (const marker of markers) assert.ok(!bundle.includes(marker), 'Server marker found in bundle')
    for (const input of Object.keys(result.metafile.inputs)) {
        assert.ok(!input.startsWith('apps/api/'), 'Mobile imported a server module')
        const source = readFileSync(resolve(repository, input), 'utf8')
        const withoutPublicUrl = source.replace(/process\.env\.EXPO_PUBLIC_API_URL\b/g, '')
        assert.ok(!/\bprocess\.env\b/.test(withoutPublicUrl), 'Non-allowlisted environment access in mobile graph')
        for (const setting of serverSettings) {
            assert.ok(!source.includes(setting), 'Server setting referenced in mobile graph')
        }
    }

    const mobileExample = readFileSync(resolve(repository, 'apps/mobile/.env.example'), 'utf8')
    const names = [...mobileExample.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map(match => match[1])
    assert.deepEqual(names, ['EXPO_PUBLIC_API_URL'])

    // Shared contracts may not export server configuration or credential names.
    const contracts = resolve(repository, 'packages/contracts/src')
    for (const file of readdirSync(contracts, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.ts')) continue
        const source = readFileSync(resolve(contracts, file), 'utf8')
        for (const setting of serverSettings) {
            assert.ok(!source.includes(setting), `Server setting found in contracts: ${file}`)
        }
        assert.ok(!/apps\/api/.test(source), `Server import found in contracts: ${file}`)
    }

    // Negative control: renaming a bundled secret to privateKey still exposes it.
    const unsafe = await build({
        stdin: { contents: 'export const privateKey = process.env.SESSION_SIGNING_SECRET' },
        bundle: true,
        format: 'esm',
        define: { 'process.env.SESSION_SIGNING_SECRET': JSON.stringify(markers[1]) },
        write: false,
        logLevel: 'silent',
    })
    assert.ok(unsafe.outputFiles[0].text.includes(markers[1]), 'Negative control failed')

    console.log('PASS sample mobile JS bundle contains the public API URL')
    console.log('PASS 3 seeded server-only markers absent; no API module imported')
    console.log('PASS mobile example allowlist and shared-contract boundary')
    console.log('PASS negative control detects a secret renamed to privateKey')
    console.log('Scope: esbuild sample; installed Expo/Metro native bundle remains follow-up work')
}

void main().catch(() => {
    // Build errors can include source snippets. Keep command failures redacted too.
    console.error('FAIL mobile configuration boundary check; inspect local sources without logging secrets')
    process.exitCode = 1
})
