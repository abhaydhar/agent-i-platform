export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value || defaultValue || '';
}

export function getEnvInt(key: string, defaultValue?: number): number {
  const value = getEnv(key, defaultValue?.toString());
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return num;
}

export function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvInt('PORT', 5000),
  databaseUrl: getEnv('DATABASE_URL'),
  anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),
  neo4jUri: getEnv('NEO4J_URI', 'neo4j://localhost:7687'),
  neo4jUser: getEnv('NEO4J_USER', 'neo4j'),
  neo4jPassword: getEnv('NEO4J_PASSWORD', 'password'),
  debug: getEnvBool('DEBUG'),
};
