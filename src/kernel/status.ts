export function normalizeStatus(status: string): string {
  return status.toLowerCase()
}

export function statusesEqual(a: string, b: string): boolean {
  return normalizeStatus(a) === normalizeStatus(b)
}
