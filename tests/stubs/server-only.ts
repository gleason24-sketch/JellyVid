/**
 * Stub for Next's `server-only` guard.
 *
 * In a Next build that import is what makes a client-side import of a server
 * module a hard error. Vitest runs in Node with no such boundary, so the
 * guard has nothing to do and resolves here instead.
 */
export {};
