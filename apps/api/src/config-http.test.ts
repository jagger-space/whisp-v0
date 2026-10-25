import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { it } from 'node:test'
import type { Environment } from './config'
import { createApp } from './index'

async function request(environment: Environment, path = '/api/health') {
    const logs: object[] = []
    const app = createApp({ environment, logError: entry => logs.push(entry) })
    const server = createServer(app)
    try {
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        assert.ok(address && typeof address !== 'string')
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
        return {
            status: response.status,
            contentType: response.headers.get('content-type'),
            body: await response.json(),
            logs,
        }
    } finally {
        if (server.listening) {
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve())
            })
        }
    }
}

for (const environment of ['development', 'preview', 'production']) {
    it(`serves the unchanged public health contract in ${environment}`, async () => {
        const result = await request({ WHISP_ENV: environment })
        assert.equal(result.status, 200)
        assert.deepEqual(result.body, { status: 'ok', service: 'whisp-api', contractVersion: 1 })
        assert.deepEqual(result.logs, [])
    })
}

it('returns a generic 503 and useful redacted operator rules for missing enabled-feature secrets', async () => {
    const result = await request({
        WHISP_ENV: 'preview',
        ENABLE_DATABASE: 'true',
        ENABLE_SESSION_SIGNING: 'true',
    })
    assert.equal(result.status, 503)
    assert.match(result.contentType ?? '', /^application\/json\b/)
    assert.deepEqual(result.body, { error: 'service_unavailable' })
    assert.deepEqual(result.logs, [{
        event: 'configuration_error',
        issues: [
            { setting: 'MONGODB_URI', rule: 'required_when_database_enabled' },
            { setting: 'SESSION_SIGNING_SECRET', rule: 'required_when_session_signing_enabled' },
        ],
    }])
})

it('rejects a missing environment through the same JSON path, including unknown routes', async () => {
    const result = await request({ NODE_ENV: 'production' }, '/api/unknown')
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'service_unavailable' })
    assert.deepEqual(result.logs, [{
        event: 'configuration_error',
        issues: [{ setting: 'WHISP_ENV', rule: 'must_be_development_preview_or_production' }],
    }])
})

it('does not expose seeded values in responses or operator logs', async () => {
    const marker = 'DISPOSABLE_SERVER_SECRET_HTTP_005'
    const result = await request({
        WHISP_ENV: marker,
        ENABLE_DATABASE: 'true',
        MONGODB_URI: `https://user:${marker}@invalid.example/db`,
        ENABLE_SESSION_SIGNING: 'true',
        SESSION_SIGNING_SECRET: marker,
        PROVIDER_SECRET: marker,
    }, `/api/health?token=${marker}`)
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'service_unavailable' })
    assert.ok(!JSON.stringify(result).includes(marker))
    assert.ok(!JSON.stringify(result).includes('https://'))
})

it('does not serialize an unexpected error containing a secret', async () => {
    const marker = 'DISPOSABLE_UNEXPECTED_SECRET_005'
    const result = await request({
        get WHISP_ENV(): string { throw new Error(marker) },
    })
    assert.equal(result.status, 500)
    assert.deepEqual(result.body, { error: 'internal_error' })
    assert.deepEqual(result.logs, [{ event: 'internal_error' }])
    assert.ok(!JSON.stringify(result).includes(marker))
})
