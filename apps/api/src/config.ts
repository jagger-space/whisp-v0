/** Server-only configuration. Never import this module into mobile or contracts. */
export type Environment = Readonly<Record<string, string | undefined>>
export type ApiEnvironment = 'development' | 'preview' | 'production'

type ConfigIssue = {
    setting: 'WHISP_ENV' | 'ENABLE_DATABASE' | 'MONGODB_URI'
        | 'ENABLE_SESSION_SIGNING' | 'SESSION_SIGNING_SECRET'
    rule: 'must_be_development_preview_or_production' | 'must_be_true_or_false'
        | 'required_when_database_enabled' | 'must_use_mongodb_scheme'
        | 'required_when_session_signing_enabled'
}

export class ConfigurationError extends Error {
    constructor(readonly issues: readonly ConfigIssue[]) {
        // Neither the message nor issues contain supplied environment values.
        super('API configuration is invalid')
        this.name = 'ConfigurationError'
    }
}

export type ApiConfig = {
    environment: ApiEnvironment
    database: { enabled: false } | { enabled: true, uri: string }
    sessionSigning: { enabled: false } | { enabled: true, secret: string }
}
export function loadApiConfig(env: Environment): ApiConfig {
    const issues: ConfigIssue[] = []
    const environment = env.WHISP_ENV
    if (environment !== 'development' && environment !== 'preview' && environment !== 'production') {
        issues.push({ setting: 'WHISP_ENV', rule: 'must_be_development_preview_or_production' })
    }

    function enabled(setting: 'ENABLE_DATABASE' | 'ENABLE_SESSION_SIGNING'): boolean {
        const value = env[setting]
        if (value === undefined || value === 'false') return false
        if (value === 'true') return true
        issues.push({ setting, rule: 'must_be_true_or_false' })
        return false
    }

    let database: ApiConfig['database'] = { enabled: false }
    if (enabled('ENABLE_DATABASE')) {
        const uri = env.MONGODB_URI
        if (!uri?.trim()) {
            issues.push({ setting: 'MONGODB_URI', rule: 'required_when_database_enabled' })
        } else if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(uri)) {
            issues.push({ setting: 'MONGODB_URI', rule: 'must_use_mongodb_scheme' })
        } else {
            database = { enabled: true, uri }
        }
    }

    let sessionSigning: ApiConfig['sessionSigning'] = { enabled: false }
    if (enabled('ENABLE_SESSION_SIGNING')) {
        const secret = env.SESSION_SIGNING_SECRET
        if (!secret?.trim()) {
            issues.push({ setting: 'SESSION_SIGNING_SECRET', rule: 'required_when_session_signing_enabled' })
        } else {
            sessionSigning = { enabled: true, secret }
        }
    }

    if (issues.length) throw new ConfigurationError(issues)
    return { environment: environment as ApiEnvironment, database, sessionSigning }
}
