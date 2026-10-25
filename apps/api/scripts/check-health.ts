import assert from 'node:assert/strict'

async function main() {
    const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000'
    const cases = [
        { path: '/api/health', status: 200, body: { status: 'ok', service: 'whisp-api', contractVersion: 1 } },
        { path: '/api/unknown', status: 404, body: { error: 'not_found' } },
    ]

    for (const expected of cases) {
        const response = await fetch(new URL(expected.path, baseUrl))
        const body: unknown = await response.json()
        assert.equal(response.status, expected.status)
        assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/)
        assert.deepEqual(body, expected.body)
        console.log(`GET ${expected.path} -> ${response.status} ${JSON.stringify(body)}`)
    }
}

void main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
