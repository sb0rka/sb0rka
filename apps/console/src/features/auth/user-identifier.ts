export function userIdentifier(value: string): { email: string } | { username: string } {
  return value.includes("@") ? { email: value } : { username: value }
}
