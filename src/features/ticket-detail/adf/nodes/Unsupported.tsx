export function Unsupported({ type }: { type: string }) {
  return <span className="text-muted-foreground/50 italic">[unsupported: {type}]</span>
}
