const CANONICAL_LANGUAGES = [
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'csharp',
  'cpp',
  'sql',
  'json',
  'yaml',
  'xml',
  'html',
  'css',
  'bash',
  'shell',
  'markdown',
  'dockerfile',
] as const

const ALIASES: Record<string, (typeof CANONICAL_LANGUAGES)[number]> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  python3: 'python',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  htm: 'html',
  md: 'markdown',
  docker: 'dockerfile',
}

const CANONICAL_SET = new Set<string>(CANONICAL_LANGUAGES)

export function normalizeCodeLanguage(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const key = raw.trim().toLowerCase()
  if (key === '') return null
  if (CANONICAL_SET.has(key)) return key
  return ALIASES[key] ?? null
}
