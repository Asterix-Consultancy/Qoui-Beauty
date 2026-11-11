// A makeup brush, drawn upright with the bristle tip at the bottom centre (60, 520).
// Cocoa handle, gold ferrule, cream bristles dipped in rose blush.
export function BrushArt({ id = "b" }: { id?: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-handle`} x1="0" x2="1">
          <stop offset="0" stopColor="#1f1512" />
          <stop offset="0.35" stopColor="#4a342c" />
          <stop offset="0.55" stopColor="#6b4a3d" />
          <stop offset="1" stopColor="#231814" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" x2="1">
          <stop offset="0" stopColor="#9c7231" />
          <stop offset="0.3" stopColor="#f3dfb0" />
          <stop offset="0.55" stopColor="#d4a24c" />
          <stop offset="1" stopColor="#8a6328" />
        </linearGradient>
        <linearGradient id={`${id}-bristle`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6ece0" />
          <stop offset="0.45" stopColor="#ecd8c6" />
          <stop offset="0.78" stopColor="#d98a78" />
          <stop offset="1" stopColor="#b85f4f" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* handle */}
      <path d="M50 8 Q60 -2 70 8 L78 318 Q60 326 42 318 Z" fill={`url(#${id}-handle)`} />
      <path d="M55 20 L59 300" stroke="#fff" strokeOpacity="0.18" strokeWidth="3" strokeLinecap="round" />
      {/* ferrule */}
      <rect x="38" y="316" width="44" height="78" rx="6" fill={`url(#${id}-gold)`} />
      <rect x="38" y="330" width="44" height="3" fill="#8a6328" opacity="0.5" />
      <rect x="38" y="378" width="44" height="3" fill="#8a6328" opacity="0.5" />
      {/* bristles */}
      <path d="M40 392 C26 430 14 472 30 500 Q60 532 90 500 C106 472 94 430 80 392 Z" fill={`url(#${id}-bristle)`} />
      <path d="M40 392 C26 430 14 472 30 500 Q60 532 90 500 C106 472 94 430 80 392 Z" fill={`url(#${id}-sheen)`} />
      <g stroke="#b88f78" strokeOpacity="0.35" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <path d="M48 400 C42 440 38 470 44 500" />
        <path d="M60 400 L60 512" />
        <path d="M72 400 C78 440 82 470 76 500" />
      </g>
    </>
  );
}

export function Brush({ className = "", id = "brush" }: { className?: string; id?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 530" aria-hidden="true" focusable="false">
      <BrushArt id={id} />
    </svg>
  );
}
