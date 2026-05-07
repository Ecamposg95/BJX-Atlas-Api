import type { CSSProperties } from 'react';

const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace";

const KEYFRAMES = `
@keyframes login-topbar-grid-amber {
  0%, 100% { opacity: 0.35; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  16%, 33% { opacity: 1; box-shadow: 0 0 8px 1px rgba(245, 158, 11, 0.7); }
  50% { opacity: 0.35; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
@keyframes login-topbar-grid-yellow {
  0%, 33%, 100% { opacity: 0.35; box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
  50%, 66% { opacity: 1; box-shadow: 0 0 8px 1px rgba(250, 204, 21, 0.7); }
}
@keyframes login-topbar-grid-green {
  0%, 66%, 100% { opacity: 0.35; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  83%, 99% { opacity: 1; box-shadow: 0 0 8px 1px rgba(16, 185, 129, 0.7); }
}
@keyframes login-topbar-live-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
  50% { opacity: 0.55; box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
}
`;

const barStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 38,
  background: '#0a0a0c',
  borderBottom: '1px solid rgba(208, 162, 75, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 1.25rem',
  zIndex: 2,
};

const dotBase: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  display: 'inline-block',
};

const labelStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#9ca3af',
};

export function LoginTopBar() {
  return (
    <div style={barStyle}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* IZQUIERDA: starting grid lights */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            ...dotBase,
            background: '#f59e0b',
            animation: 'login-topbar-grid-amber 1.5s infinite',
          }}
        />
        <span
          style={{
            ...dotBase,
            background: '#facc15',
            animation: 'login-topbar-grid-yellow 1.5s infinite',
          }}
        />
        <span
          style={{
            ...dotBase,
            background: '#10b981',
            animation: 'login-topbar-grid-green 1.5s infinite',
          }}
        />
      </div>

      {/* CENTRO: title */}
      <div style={labelStyle}>
        BJX MOTORS <span style={{ color: '#d0a24b' }}>·</span> QUALIFYING
      </div>

      {/* DERECHA: live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            ...dotBase,
            background: '#10b981',
            animation: 'login-topbar-live-pulse 2s infinite',
          }}
        />
        <span style={labelStyle}>LIVE · 2026 · MX</span>
      </div>
    </div>
  );
}

export default LoginTopBar;
