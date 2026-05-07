import { useEffect, useState, type CSSProperties } from 'react';

const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY_FONT = "'Inter Tight', system-ui, sans-serif";

const ACCENTS = {
  gold: '#d0a24b',
  red: '#dc2626',
  green: '#10b981',
} as const;

type AccentKey = keyof typeof ACCENTS;

export interface TelemetryGaugeProps {
  label: string;
  value: number | string;
  unit?: string;
  max?: number;
  accent?: AccentKey;
}

// Geometry for a 270° arc (sweep 7:30 to 4:30 clockwise).
// SVG viewBox: 100x100, arc center at (50, 50), radius 38.
const SIZE = 100;
const CENTER = 50;
const RADIUS = 38;
const SWEEP_DEG = 270;
const START_DEG = 135; // 7:30 position (bottom-left)

// arc length for stroke-dasharray (270° of circumference)
const FULL_ARC_LEN = (2 * Math.PI * RADIUS * SWEEP_DEG) / 360;

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  };
}

function describeArc(startAngle: number, endAngle: number, r: number) {
  const start = polar(startAngle, r);
  const end = polar(endAngle, r);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const cardStyle: CSSProperties = {
  width: 110,
  height: 110,
  border: '1px solid #1a1d23',
  borderRadius: 8,
  padding: '0.7rem 0.5rem 0.5rem',
  background: 'linear-gradient(135deg, #14171d 0%, #0d0f14 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: '0.55rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#9ca3af',
  marginBottom: 4,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  width: '100%',
};

const gaugeWrapperStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const valueWrapperStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};

const valueStyle: CSSProperties = {
  fontFamily: DISPLAY_FONT,
  fontSize: '1.4rem',
  fontWeight: 900,
  fontStyle: 'italic',
  color: '#fff',
  lineHeight: 1,
};

const unitStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: '0.5rem',
  color: '#9ca3af',
  marginTop: 2,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

export function TelemetryGauge({
  label,
  value,
  unit,
  max,
  accent = 'gold',
}: TelemetryGaugeProps) {
  const accentColor = ACCENTS[accent];

  const isNumeric = typeof value === 'number' && typeof max === 'number' && max > 0;
  const ratioTarget = isNumeric
    ? Math.max(0, Math.min(1, (value as number) / (max as number)))
    : 0.75;

  const [animatedRatio, setAnimatedRatio] = useState(0);

  useEffect(() => {
    // Trigger sweep animation on mount / when target changes.
    const start = performance.now();
    const duration = 1400;
    // cubic-bezier(0.16, 1, 0.3, 1) approximation via easing function
    const ease = (t: number) => {
      // expo-out-ish: matches the spec curve closely
      return 1 - Math.pow(1 - t, 4);
    };
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setAnimatedRatio(ratioTarget * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ratioTarget]);

  const endAngle = START_DEG + SWEEP_DEG * animatedRatio;
  const bgPath = describeArc(START_DEG, START_DEG + SWEEP_DEG, RADIUS);
  const activeLen = FULL_ARC_LEN * animatedRatio;
  // Needle endpoint
  const needle = polar(endAngle, RADIUS);

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>

      <div style={gaugeWrapperStyle}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          height="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* background arc */}
          <path
            d={bgPath}
            fill="none"
            stroke="#1a1d23"
            strokeWidth={4}
            strokeLinecap="round"
          />
          {/* active arc (uses dasharray to grow) */}
          <path
            d={bgPath}
            fill="none"
            stroke={accentColor}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${activeLen} ${FULL_ARC_LEN}`}
          />
          {/* needle */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={needle.x}
            y2={needle.y}
            stroke={accentColor}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* center hub */}
          <circle cx={CENTER} cy={CENTER} r={2} fill={accentColor} />
        </svg>

        <div style={valueWrapperStyle}>
          <div style={valueStyle}>{value}</div>
          {unit ? <div style={unitStyle}>{unit}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default TelemetryGauge;
