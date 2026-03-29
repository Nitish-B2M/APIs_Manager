/**
 * Feature Flags — toggle features per environment without code changes.
 * Flags can be overridden via environment variables: FF_FLAG_NAME=true|false
 */

interface FeatureFlag {
    name: string;
    description: string;
    default: boolean;
    environments?: Record<string, boolean>; // per-env overrides
}

const FLAGS: FeatureFlag[] = [
    { name: 'EMAIL_VERIFICATION', description: 'Require email verification on register', default: true },
    { name: 'AI_FEATURES', description: 'Enable AI-powered documentation generation', default: true },
    { name: 'GRAPHQL_EXECUTION', description: 'Allow server-side GraphQL execution', default: true },
    { name: 'WEBSOCKET_TESTING', description: 'Allow WebSocket protocol testing', default: true },
    { name: 'GIT_MANAGER', description: 'Enable Git repository manager', default: true },
    { name: 'WORKSPACES', description: 'Enable team workspaces', default: true },
    { name: 'SCRIPT_RUNNER', description: 'Allow pre/post request script execution', default: true, environments: { production: false } },
    { name: 'DOC_SITE_GENERATOR', description: 'Enable API doc site generation', default: true },
    { name: 'ACCOUNT_LOCKOUT', description: 'Lock accounts after failed login attempts', default: true },
    { name: 'RATE_LIMITING', description: 'Enable API rate limiting', default: true, environments: { test: false } },
];

const env = process.env.NODE_ENV || 'development';

/**
 * Check if a feature is enabled.
 */
export function isFeatureEnabled(name: string): boolean {
    // Check env var override first: FF_FEATURE_NAME=true|false
    const envOverride = process.env[`FF_${name}`];
    if (envOverride !== undefined) {
        return envOverride === 'true' || envOverride === '1';
    }

    const flag = FLAGS.find(f => f.name === name);
    if (!flag) return false;

    // Check per-environment override
    if (flag.environments?.[env] !== undefined) {
        return flag.environments[env];
    }

    return flag.default;
}

/**
 * Get all feature flags with their current status.
 */
export function getAllFlags(): Array<{ name: string; description: string; enabled: boolean }> {
    return FLAGS.map(f => ({
        name: f.name,
        description: f.description,
        enabled: isFeatureEnabled(f.name),
    }));
}
