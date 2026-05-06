export function Emoji({ text, shortName }: { text?: string; shortName?: string }) {
  return <span>{text ?? shortName ?? ''}</span>
}
