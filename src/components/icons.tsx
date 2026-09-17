/** Small inline glyphs for the four task cards. Decorative: always aria-hidden. */
export function TaskIcon({ name, className = '' }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'star':
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="m19 3 .8 1.9L21.7 5.7l-1.9.8L19 8.4l-.8-1.9-1.9-.8 1.9-.8Z" />
        </svg>
      );
    case 'product':
      return (
        <svg {...common}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case 'character':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M18.5 9.5a4 4 0 0 0 0-3M21 11a7 7 0 0 0 0-6" />
        </svg>
      );
    case 'cinema':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m16 10 6-3v10l-6-3" />
        </svg>
      );
    case 'photo':
    default:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m5 16 4.5-4.5L13 15l2.5-2.5L21 18" />
        </svg>
      );
  }
}
