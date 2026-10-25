import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { describe, it } from 'node:test'
import { ConfigurationError, loadApiConfig, type Environment } from './config'

function configurationError(env: Environment) {
    try {
        loadApiConfig(env)
        assert.fail('Expected configuration to fail')
    } catch (error) {
        assert.ok(error instanceof ConfigurationError)
        return error
    }
}

describe('server configuration rules', () => {
    for (const environment of ['development', 'preview', 'production']) {
        it(`requires an explicit ${environment} environment with no database fallback`, () => {
            assert.deepEqual(loadApiConfig({ WHISP_ENV: environment }), {
                environment,
                database: { enabled: false },
                sessionSigning: { enabled: false },
            })
            const error = configurationError({ WHISP_ENV: environment, ENABLE_DATABASE: 'true' })
            assert.deepEqual(error.issues, [
                { setting: 'MONGODB_URI', rule: 'required_when_database_enabled' },
            ])
        })
    }

    for (const environment of [undefined, '', 'staging', 'PRODUCTION']) {
        it(`rejects environment ${String(environment)} even with NODE_ENV=production`, () => {
            assert.deepEqual(configurationError({ WHISP_ENV: environment, NODE_ENV: 'production' }).issues, [
                { setting: 'WHISP_ENV', rule: 'must_be_development_preview_or_production' },
            ])
        })
    }

    it('accepts explicit credentials only for enabled features', () => {
        const config = loadApiConfig({
            WHISP_ENV: 'preview',
            ENABLE_DATABASE: 'true',
            MONGODB_URI: 'mongodb://placeholder:placeholder@localhost:27017/whisp_preview',
            ENABLE_SESSION_SIGNING: 'true',
            SESSION_SIGNING_SECRET: 'disposable-test-signing-material',
        })
        assert.deepEqual(config, {
            environment: 'preview',
            database: { enabled: true, uri: 'mongodb://placeholder:placeholder@localhost:27017/whisp_preview' },
            sessionSigning: { enabled: true, secret: 'disposable-test-signing-material' },
        })
    })

    it('does not retain credentials for disabled features', () => {
        assert.deepEqual(loadApiConfig({
            WHISP_ENV: 'development',
            ENABLE_DATABASE: 'false',
            ENABLE_SESSION_SIGNING: 'false',
            MONGODB_URI: 'unused',
            SESSION_SIGNING_SECRET: 'unused',
        }), {
            environment: 'development',
            database: { enabled: false },
            sessionSigning: { enabled: false },
        })
    })

    for (const value of [undefined, '', ' \t ']) {
        it(`rejects missing or blank credentials (${String(value)}) for both enabled features`, () => {
            assert.deepEqual(configurationError({
                WHISP_ENV: 'preview',
                ENABLE_DATABASE: 'true',
                ENABLE_SESSION_SIGNING: 'true',
                MONGODB_URI: value,
                SESSION_SIGNING_SECRET: value,
            }).issues, [
                { setting: 'MONGODB_URI', rule: 'required_when_database_enabled' },
                { setting: 'SESSION_SIGNING_SECRET', rule: 'required_when_session_signing_enabled' },
            ])
        })
    }

    it('does not accept public-prefixed credentials as server credentials', () => {
        const error = configurationError({
            WHISP_ENV: 'preview',
            ENABLE_DATABASE: 'true',
            ENABLE_SESSION_SIGNING: 'true',
            EXPO_PUBLIC_MONGODB_URI: 'disposable-public-mistake',
            EXPO_PUBLIC_SESSION_SIGNING_SECRET: 'disposable-public-mistake',
        })
        assert.equal(error.issues.length, 2)
    })

    for (const value of ['', 'TRUE', '1', 'yes']) {
        it(`rejects ambiguous feature flags (${JSON.stringify(value)})`, () => {
            assert.deepEqual(configurationError({
                WHISP_ENV: 'development',
                ENABLE_DATABASE: value,
                ENABLE_SESSION_SIGNING: value,
            }).issues, [
                { setting: 'ENABLE_DATABASE', rule: 'must_be_true_or_false' },
                { setting: 'ENABLE_SESSION_SIGNING', rule: 'must_be_true_or_false' },
            ])
        })
    }

    it('reports invalid values using only fixed setting names and rule identifiers', () => {
        const marker = 'DISPOSABLE_SERVER_SECRET_005'
        const error = configurationError({
            WHISP_ENV: marker,
            ENABLE_DATABASE: 'true',
            MONGODB_URI: `https://user:${marker}@invalid.example/db`,
            ENABLE_SESSION_SIGNING: marker,
        })
        assert.deepEqual(error.issues, [
            { setting: 'WHISP_ENV', rule: 'must_be_development_preview_or_production' },
            { setting: 'MONGODB_URI', rule: 'must_use_mongodb_scheme' },
            { setting: 'ENABLE_SESSION_SIGNING', rule: 'must_be_true_or_false' },
        ])
        assert.ok(!inspect(error).includes(marker))
        assert.ok(!JSON.stringify(error).includes(marker))
    })
})
