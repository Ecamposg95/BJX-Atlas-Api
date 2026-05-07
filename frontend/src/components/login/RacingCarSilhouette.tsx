import type { CSSProperties } from 'react';

export interface RacingCarSilhouetteProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * Stylized side-view silhouette of a GT3 racing car (Porsche 911 GT3 Cup /
 * Audi R8 LMS GT3 inspired). Single-line outline, gold, very low opacity —
 * intended as background decoration.
 */
export function RacingCarSilhouette({ className, style }: RacingCarSilhouetteProps) {
  return (
    <svg
      className={className}
      style={{ width: '100%', height: 'auto', display: 'block', ...style }}
      viewBox="0 0 600 200"
      fill="none"
      stroke="#d0a24b"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.06}
      aria-hidden
    >
      {/* Cuerpo principal: splitter -> capó -> parabrisas -> techo -> luneta -> cola -> alerón -> difusor */}
      <path
        d="
          M 30 150
          L 70 148
          L 90 138
          L 130 132
          L 175 105
          L 230 80
          L 320 70
          L 395 76
          L 445 90
          L 495 95
          L 545 105
          L 555 125
          L 568 130
          L 568 148
          L 540 152
        "
      />

      {/* Línea inferior de la carrocería (sills) entre las dos ruedas */}
      <path d="M 175 158 L 425 158" />

      {/* Fender delantero pronunciado (arco sobre la rueda delantera) */}
      <path d="M 105 152 L 110 130 L 140 118 L 175 122 L 200 145" />

      {/* Fender trasero pronunciado (arco sobre la rueda trasera) */}
      <path d="M 400 145 L 420 120 L 460 115 L 500 122 L 525 145" />

      {/* Línea de cintura / corte de puerta */}
      <path d="M 200 110 L 260 100 L 360 100 L 420 110" />

      {/* Espejo lateral */}
      <path d="M 235 95 L 245 88 L 252 92" />

      {/* Alerón trasero (rear wing) - dos soportes y el plano */}
      <path d="M 500 95 L 500 70 L 600 68 L 600 78 L 510 80" />
      <path d="M 540 80 L 540 95" />

      {/* Splitter delantero */}
      <path d="M 30 150 L 22 158 L 70 158 L 70 148" />

      {/* Rueda delantera */}
      <circle cx={150} cy={160} r={28} />
      <circle cx={150} cy={160} r={14} />

      {/* Rueda trasera */}
      <circle cx={460} cy={160} r={28} />
      <circle cx={460} cy={160} r={14} />

      {/* Detalle: rejilla / entrada de aire lateral */}
      <path d="M 380 130 L 410 128" />
      <path d="M 380 138 L 410 136" />
    </svg>
  );
}

export default RacingCarSilhouette;
