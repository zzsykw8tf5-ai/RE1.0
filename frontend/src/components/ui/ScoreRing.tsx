interface ScoreRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  colorClass?: string;
}

export default function ScoreRing({ score, size = 80, strokeWidth = 6, label, sublabel, colorClass }: ScoreRingProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;

  const color = colorClass ||
    (pct >= 75 ? '#34C759' : pct >= 50 ? '#FF9500' : pct >= 25 ? '#FF6B35' : '#FF3B30');

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#E8E8ED" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-apple-text">{Math.round(pct)}</span>
        </div>
      </div>
      {label && <div className="text-xs font-medium text-apple-text text-center">{label}</div>}
      {sublabel && <div className="text-[10px] text-apple-text-tertiary text-center">{sublabel}</div>}
    </div>
  );
}
