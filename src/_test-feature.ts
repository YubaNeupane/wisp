// Audit logging configuration
export const WISP_AUDIT_LOG = process.env.WISP_AUDIT_LOG === "true"
export const WISP_AUDIT_LOG_PATH = process.env.WISP_AUDIT_LOG_PATH ?? ".wisp/audit.log"
