/** 壳内部共用的图标。一律 14×14 线性图标，stroke 用 currentColor。 */
interface P {
  size?: number
  className?: string
}
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconChevron = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3.5L10.5 8L6 12.5" />
  </svg>
)

export const IconSearch = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="M10.2 10.2L14 14" />
  </svg>
)

export const IconSend = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" />
  </svg>
)

export const IconStop = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconPlus = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
)

export const IconSun = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.9 3.1l-1 1M4.1 11.9l-1 1M12.9 12.9l-1-1M4.1 4.1l-1-1" />
  </svg>
)

export const IconMoon = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" />
  </svg>
)

export const IconPanel = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M10 2.5v11" />
  </svg>
)

export const IconAttach = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10.5 5.5l-4 4a1.8 1.8 0 002.5 2.5l4.2-4.2a3.3 3.3 0 00-4.7-4.7L3.7 7.9a4.8 4.8 0 006.8 6.8" />
  </svg>
)

export const IconWrench = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10.3 1.9a3.6 3.6 0 00-4.6 4.6L2 10.2 3.8 12l3.7-3.7a3.6 3.6 0 004.6-4.6L10 5.8 8.2 4z" />
  </svg>
)

export const IconError = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.5M8 10.8v.2" />
  </svg>
)

export const IconCheck = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 8.5L6.3 12L13 4.5" />
  </svg>
)
