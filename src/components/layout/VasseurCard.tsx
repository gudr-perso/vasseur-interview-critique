interface VasseurCardProps {
  name?: string
  text: string
}

export function VasseurCard({ name = 'Étienne Vasseur · Journaliste', text }: VasseurCardProps) {
  return (
    <div className="bg-ink text-paper mx-0 mb-4 px-5 py-4 border-l-4 border-red">
      <div className="font-mono text-[0.6rem] text-red uppercase tracking-[0.1em] mb-1.5">
        ▶ {name}
      </div>
      <div className="font-display italic text-[0.95rem] leading-[1.65] text-[#e8e0d0]">
        {text}
      </div>
    </div>
  )
}
