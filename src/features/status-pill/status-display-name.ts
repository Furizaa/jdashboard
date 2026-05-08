const DISPLAY_OVERRIDES: Record<string, string> = {
  reviewed: 'READY TO PICK',
}

export function displayNameForStatus(status: string): string {
  return DISPLAY_OVERRIDES[status.toLowerCase()] ?? status
}
