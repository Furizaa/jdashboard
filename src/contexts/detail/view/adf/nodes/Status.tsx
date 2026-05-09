const STATUS_COLORS: Record<string, string> = {
  neutral: 'bg-slate-500/20 text-slate-200',
  purple: 'bg-purple-500/20 text-purple-200',
  blue: 'bg-blue-500/20 text-blue-200',
  red: 'bg-red-500/20 text-red-200',
  yellow: 'bg-yellow-500/20 text-yellow-200',
  green: 'bg-green-500/20 text-green-200',
}

export function Status({ text, color }: { text: string; color: string }) {
  const cls = STATUS_COLORS[color] ?? STATUS_COLORS.neutral
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium tracking-wide uppercase ${cls}`}
    >
      {text}
    </span>
  )
}
