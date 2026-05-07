import type { CSSProperties } from 'react';

const KEYFRAMES = `
@keyframes login-streak-sweep {
  from {
    transform: scaleX(0) translateX(-10%);
    opacity: 0;
  }
  to {
    transform: scaleX(1.1) translateX(0);
    opacity: 1;
  }
}
`;

type StreakLine = {
  top: string;
  height: number;
  opacity: number;
  delay: number;
};

const LINES: StreakLine[] = [
  { top: '18%', height: 1, opacity: 0.18, delay: 0 },
  { top: '35%', height: 0.5, opacity: 0.1, delay: 120 },
  { top: '62%', height: 2, opacity: 0.18, delay: 240 },
  { top: '81%', height: 0.5, opacity: 0.1, delay: 360 },
];

const containerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 0,
};

export function RacingStreaks() {
  return (
    <div style={containerStyle} aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      {LINES.map((line, i) => {
        const style: CSSProperties = {
          position: 'absolute',
          left: 0,
          top: line.top,
          width: '100%',
          height: line.height,
          background:
            'linear-gradient(90deg, transparent 0%, #d0a24b 25%, #d0a24b 60%, transparent 100%)',
          opacity: line.opacity,
          transformOrigin: 'left',
          animation: `login-streak-sweep 1.2s ease-out ${line.delay}ms both`,
        };
        return <div key={i} style={style} />;
      })}
    </div>
  );
}

export default RacingStreaks;
