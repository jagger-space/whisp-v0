/** Process liveness only; this response makes no database-readiness claim. */
export type HealthResponse = {
    status: 'ok'
    service: 'whisp-api'
    contractVersion: 1
}
