interface AgentIconProps {
  kind?: string;
  className?: string;
}

export function AgentIcon({ kind, className = 'h-6 w-6' }: AgentIconProps) {
  const common = { className, fill: 'none', viewBox: '0 0 24 24', strokeWidth: 1.6, stroke: 'currentColor' };
  switch (kind) {
    case 'lineage':
      return (
        <svg {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="12" r="2" />
          <path d="M7 6h6a3 3 0 0 1 3 3v0M7 18h6a3 3 0 0 0 3-3v0" strokeLinecap="round" />
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          <path d="M9 8 4 12l5 4M15 8l5 4-5 4M13 6l-2 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'graph':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M7.5 7.5 11 16.5M16.5 7.5 13 16.5M8 6h8" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
}
