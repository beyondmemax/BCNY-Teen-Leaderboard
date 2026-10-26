import { useEffect } from 'react';

const HUES = [218, 152, 28, 340, 265, 190, 8, 45];

export function Avatar({ name = '?', photo, size = 40 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const hue = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  if (photo) {
    return (
      <img className="avatar" src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="avatar" aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 70% 88%)`, color: `hsl(${hue} 60% 28%)` }}>
      {initials}
    </span>
  );
}

export function Toast({ title, body, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [title, body, onClose]);
  return (
    <div className="toast" role="status" onClick={onClose}>
      {title && <strong>{title}</strong>}
      {body && <p>{body}</p>}
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Competition ranking: ties share a rank (1, 1, 3). */
export function withRanks(rows) {
  let rank = 0;
  let prev = null;
  return rows.map((r, i) => {
    if (r.points !== prev) rank = i + 1;
    prev = r.points;
    return { ...r, rank };
  });
}

export function timeAgo(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d) return 'just now';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
