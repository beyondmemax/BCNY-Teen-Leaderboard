import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Avatar, withRanks } from './ui';

export function useLeaderboard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'leaderboard'),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data(), points: d.data().points || 0 }))
            .sort((a, b) => b.points - a.points || (a.name || '').localeCompare(b.name || ''));
          setRows(withRanks(list));
          setError('');
        },
        (e) => setError(e.code === 'permission-denied' ? 'You don’t have access to the board.' : 'Couldn’t load the board. Check your connection.')
      ),
    []
  );
  return { rows, error };
}

const first = (name = '') => name.trim().split(/\s+/)[0] || name;

function Podium({ top, meId }) {
  // Visual order: 2nd, 1st, 3rd.
  const order = [top[1], top[0], top[2]];
  return (
    <div className="podium" aria-label="Top three">
      {order.map((r, i) =>
        r ? (
          <div key={r.id} className={`step step-${r.rank <= 3 ? r.rank : 3} ${r.id === meId ? 'is-me' : ''}`}>
            <Avatar name={r.name} photo={r.photoURL} size={i === 1 ? 64 : 52} />
            <span className="step-name">{first(r.name)}</span>
            <span className="step-pts">{r.points.toLocaleString()} pts</span>
            <div className="step-block">
              <span className="step-rank">{r.rank}</span>
            </div>
          </div>
        ) : (
          <div key={`empty-${i}`} className="step step-empty" />
        )
      )}
    </div>
  );
}

/**
 * rows: ranked leaderboard rows. meId highlights the viewer.
 * actions(row) optional: teacher controls rendered on each row.
 */
export default function Leaderboard({ rows, meId, actions, emptyText }) {
  if (!rows) return <div className="loading-rows" aria-label="Loading"><span /><span /><span /></div>;
  if (!rows.length) return <p className="empty">{emptyText}</p>;

  const showPodium = !actions && rows.length >= 1;
  const rest = showPodium ? rows.slice(3) : rows;

  return (
    <div className="board">
      {showPodium && <Podium top={rows.slice(0, 3)} meId={meId} />}
      {rest.length > 0 && (
        <ol className="rows">
          {rest.map((r) => (
            <li key={r.id} className={`row ${r.id === meId ? 'is-me' : ''} ${r.rank <= 3 ? `medal-${r.rank}` : ''}`}>
              <span className="row-rank">{r.rank}</span>
              <Avatar name={r.name} photo={r.photoURL} size={36} />
              <span className="row-name">
                {r.name}
                {r.id === meId && <em> (you)</em>}
              </span>
              <span className="row-pts">{r.points.toLocaleString()}</span>
              {actions && <div className="row-actions">{actions(r)}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
