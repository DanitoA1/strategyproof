export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line/70 pb-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/40">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 17l5-5 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight">StrategyProof</div>
          <div className="text-xs text-muted">Turn trading ideas into historical evidence</div>
        </div>
      </div>
      <div className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
        <Pill>Kimi · parser</Pill>
        <Pill>Daytona · sandbox</Pill>
        <Pill>Nosana · reviewer</Pill>
      </div>
    </header>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line bg-panel px-2.5 py-1">{children}</span>;
}
