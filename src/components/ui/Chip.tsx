interface ChipProps {
  label: string
}

export function Chip({ label }: ChipProps) {
  return (
    <span className="font-mono text-[0.57rem] px-1.5 py-0.5 bg-flag-bg border border-red text-red inline-block mr-1 mt-1">
      {label.replace(/_/g, ' ')}
    </span>
  )
}
