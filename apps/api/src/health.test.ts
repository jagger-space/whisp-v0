import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from './index'

describe('HTTP health contract using the exported app', () => {
    const server = createServer(createApp({ environment: { WHISP_ENV: 'development' } }))
    let baseUrl: string

    before(async () => {
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        assert.ok(address && typeof address !== 'string')
        baseUrl = `http://127.0.0.1:${address.port}`
    })

    after(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve())
        })
    })

    it('returns only the documented public fields with 200 and JSON', async () => {
        const response = await fetch(`${baseUrl}/api/health`)

        assert.equal(response.status, 200)
        assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/)
        assert.deepEqual(await response.json(), {
            status: 'ok',
            service: 'whisp-api',
            contractVersion: 1,
        })
    })

    for (const path of ['/api/unknown', '/']) {
        it(`returns a deliberate JSON 404 for ${path}`, async () => {
            const response = await fetch(`${baseUrl}${path}`)

            assert.equal(response.status, 404)
            assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/)
            assert.deepEqual(await response.json(), { error: 'not_found' })
        })
    }

    it('does not treat POST as GET /api/health', async () => {
        const response = await fetch(`${baseUrl}/api/health`, { method: 'POST' })

        assert.equal(response.status, 404)
        assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/)
        assert.deepEqual(await response.json(), { error: 'not_found' })
    })
})
