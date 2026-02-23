/** Generate a UUID using the native crypto API */
export function generateId(): string {
  return crypto.randomUUID();
}
