export function Mention({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-sky-500/15 px-1 font-medium text-sky-300">
      {text}
    </span>
  )
}
