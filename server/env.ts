export interface Env {
  ANTHROPIC_API_KEY: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
  /** Jeton d'accès au serveur MCP. Absent : le serveur MCP répond 500. */
  MCP_TOKEN?: string
  DB: D1Database
}
