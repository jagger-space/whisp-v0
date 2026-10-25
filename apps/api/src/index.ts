import express, { type ErrorRequestHandler, type Response } from 'express'
import type { HealthResponse } from '../../../packages/contracts/src/health'
import { ConfigurationError, loadApiConfig, type ApiConfig, type Environment } from './config'

export function createApp({
    environment = process.env,
    logError = (entry: object) => console.error(JSON.stringify(entry)),
}: {
    environment?: Environment
    logError?: (entry: object) => void
} = {}) {
    const app = express()
    let config: ApiConfig | undefined

    app.disable('x-powered-by')

    // Validate on first request so configuration failures reach the JSON error path.
    // A valid configuration is reused for this app instance; restart after changes.
    app.use((_request, _response, next) => {
        config ??= loadApiConfig(environment)
        next()
    })

    app.get('/api/health', (_request, response: Response<HealthResponse>) => {
        response.status(200).json({
            status: 'ok',
            service: 'whisp-api',
            contractVersion: 1,
        })
    })

    // Keep this after the routes so unmatched requests receive JSON as well.
    app.use((_request, response) => {
        response.status(404).json({ error: 'not_found' })
    })

    const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
        if (response.headersSent) return next(error)
        if (error instanceof ConfigurationError) {
            logError({ event: 'configuration_error', issues: error.issues })
            response.status(503).json({ error: 'service_unavailable' })
        } else {
            // Do not serialize arbitrary errors, stacks, requests or process.env.
            logError({ event: 'internal_error' })
            response.status(500).json({ error: 'internal_error' })
        }
    }
    app.use(handleError)

    return app
}

export default createApp()
