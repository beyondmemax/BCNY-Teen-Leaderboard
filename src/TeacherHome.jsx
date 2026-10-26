import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, onSnapshot, query, orderBy, limit, runTransaction,
  setDoc, deleteDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import Leaderboard, { useLeaderboard } from './Leaderboard';
import { InstallCard } from './DeviceCards';
import { Avatar, Sheet, timeAgo } from './ui';

const TABS = ['Board', 'Students', 'Announce'];

export default function TeacherHome({ user, notify }) {
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('tTab') || 'Board'; } catch { return 'Board'; }
  });
  const go = (t) => { setTab(t); try { sessionStorage.setItem('tTab', t); } catch {} };
  const { rows, error } = useLeaderboard();
  const users = useUsers();

  return (
    <main className="page">
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'is-active' : ''}`} aria-current={tab === t ? 'page' : undefined}
            onClick={() => go(t)}>
            {t}
          </button>
        ))}
      </nav>
      <InstallCard />
      {error && <p className="error">{error}</p>}
      {tab === 'Board' && <BoardTab rows={rows} user={user} notify={notify} onAddPeople={() => go('Students')} />}
      {tab === 'Students' && <StudentsTab users={users} rows={rows} notify={notify} />}
      {tab === 'Announce' && <AnnounceTab user={user} notify={notify} />}
    </main>
  );
}

function useUsers() {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    let teacherEmails = new Set();
    let latest = null;
    const publish = () => latest && setUsers(
      latest.filter((u) => !teacherEmails.has(u.email)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    );
    // Teachers aren't students, so keep them off the roster.
    getDocs(collection(db, 'teachers'))
      .then((snap) => { teacherEmails = new Set(snap.docs.map((d) => d.id)); publish(); })
      .catch(() => {});
    return onSnapshot(collection(db, 'users'), (snap) => {
      latest = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish();
    });
  }, []);
  return users;
}

/* ---------- Board: give / take points ---------- */

async function changePoints(row, delta, reason, teacher) {
  const ref = doc(db, 'leaderboard', row.id);
  const logRef = doc(collection(db, 'pointsLog'));
  let applied = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('gone');
    const current = snap.data().points || 0;
    const next = Math.max(0, current + delta); // never below zero
    applied = next - current;
    tx.update(ref, { points: next, updatedAt: serverTimestamp() });
    tx.set(logRef, {
      uid: row.id, name: row.name, delta: applied, reason: reason || null,
      at: serverTimestamp(), by: teacher.email,
    });
  });
  return applied;
}

function BoardTab({ rows, user, notify, onAddPeople }) {
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState({});

  const bump = async (row, delta, reason) => {
    setPending((p) => ({ ...p, [row.id]: true }));
    try {
      const applied = await changePoints(row, delta, reason, user);
      if (applied !== delta) notify({ title: `${row.name} is at 0`, body: 'Points can’t go below zero.' });
    } catch {
      notify({ title: 'Points didn’t save', body: 'Check your connection and try again.' });
    } finally {
      setPending((p) => ({ ...p, [row.id]: false }));
    }
  };

  return (
    <>
      <Leaderboard
        rows={rows}
        meId={null}
        emptyText={
          <>Nobody’s on the board yet. <button className="link" onClick={onAddPeople}>Add students</button></>
        }
        actions={(r) => (
          <>
            <button className="pt pt-minus" disabled={pending[r.id] || r.points === 0} onClick={() => bump(r, -1)}
              aria-label={`Take 1 point from ${r.name}`}>−1</button>
            <button className="pt pt-plus" disabled={pending[r.id]} onClick={() => bump(r, 1)}
              aria-label={`Give 1 point to ${r.name}`}>+1</button>
            <button className="pt pt-plus" disabled={pending[r.id]} onClick={() => bump(r, 5)}
              aria-label={`Give 5 points to ${r.name}`}>+5</button>
            <button className="pt pt-more" onClick={() => setEditing(r)} aria-label={`Custom points for ${r.name}`}>⋯</button>
          </>
        )}
      />
      {editing && (
        <PointsSheet row={editing} onClose={() => setEditing(null)}
          onSave={async (delta, reason) => { setEditing(null); await bump(editing, delta, reason); }} />
      )}
    </>
  );
}

function PointsSheet({ row, onClose, onSave }) {
  const [amount, setAmount] = useState('10');
  const [reason, setReason] = useState('');
  const [log, setLog] = useState(null);
  const n = Math.abs(parseInt(amount, 10) || 0);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'pointsLog'), orderBy('at', 'desc'), limit(100)),
        (snap) => setLog(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.uid === row.id).slice(0, 8))
      ),
    [row.id]
  );

  return (
    <Sheet title={row.name} onClose={onClose}>
      <p className="sheet-sub">{row.points.toLocaleString()} points right now</p>
      <div className="stack">
        <label>
          Points
          <input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Reason <span className="muted">(optional, only you see this)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Helped clean up, finished homework…" />
        </label>
        <div className="sheet-btns">
          <button className="btn btn-minus" disabled={!n} onClick={() => onSave(-n, reason)}>Take {n || ''}</button>
          <button className="btn btn-plus" disabled={!n} onClick={() => onSave(n, reason)}>Give {n || ''}</button>
        </div>
      </div>
      {log?.length > 0 && (
        <div className="history">
          <h3>Recent</h3>
          <ul>
            {log.map((l) => (
              <li key={l.id}>
                <span className={l.delta >= 0 ? 'up' : 'down'}>{l.delta >= 0 ? `+${l.delta}` : l.delta}</span>
                <span className="history-reason">{l.reason || 'No reason'}</span>
                <span className="muted">{timeAgo(l.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Students: who's on the board ---------- */

function StudentsTab({ users, rows, notify }) {
  const [q, setQ] = useState('');
  const onBoard = useMemo(() => new Map((rows || []).map((r) => [r.id, r])), [rows]);
  const list = (users || []).filter(
    (u) => !q || (u.name || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').includes(q.toLowerCase())
  );

  const add = async (u) => {
    try {
      await setDoc(doc(db, 'leaderboard', u.id), {
        name: u.name || u.email, photoURL: u.photoURL || null, points: 0,
        addedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    } catch {
      notify({ title: 'Couldn’t add them', body: 'Check your connection and try again.' });
    }
  };
  const remove = async (u) => {
    const pts = onBoard.get(u.id)?.points || 0;
    if (!confirm(`Take ${u.name} off the board? Their ${pts} points will be erased.`)) return;
    try {
      await deleteDoc(doc(db, 'leaderboard', u.id));
    } catch {
      notify({ title: 'Couldn’t remove them', body: 'Check your connection and try again.' });
    }
  };

  if (!users) return <div className="loading-rows"><span /><span /><span /></div>;

  return (
    <section>
      <p className="section-meta">
        {users.length} joined, {onBoard.size} on the board
      </p>
      {users.length > 6 && (
        <input className="search" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {users.length === 0 ? (
        <p className="empty">No students have joined yet. Share the app link — they’ll show up here after they sign in.</p>
      ) : (
        <ul className="rows">
          {list.map((u) => {
            const on = onBoard.has(u.id);
            return (
              <li key={u.id} className="row">
                <Avatar name={u.name || u.email} photo={u.photoURL} size={36} />
                <span className="row-name">
                  {u.name}
                  <small>{u.email}</small>
                </span>
                <button className={`btn btn-sm ${on ? 'btn-ghost' : 'btn-primary'}`} onClick={() => (on ? remove(u) : add(u))}>
                  {on ? 'Remove' : 'Add to board'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Announcements ---------- */

function AnnounceTab({ user, notify }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30)), (snap) =>
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    []
  );

  const post = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: title.trim(), body: body.trim(),
        authorName: user.displayName || 'Your teacher', createdAt: serverTimestamp(),
      });
      setTitle(''); setBody('');
      notify({ title: 'Announcement posted', body: 'Students will see it in their Announcements tab.' });
    } catch {
      notify({ title: 'Announcement didn’t post', body: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <form className="card stack" onSubmit={post}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Pizza Friday is on" required />
        </label>
        <label>
          Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3}
            placeholder="Top 3 on the board by Friday pick the toppings." />
        </label>
        <p className="muted">Shows up in every student’s Announcements tab with a “new” badge.</p>
        <button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? 'Posting…' : 'Post announcement'}</button>
      </form>

      <h3 className="list-head">Posted</h3>
      {posts?.length === 0 && <p className="empty">Nothing posted yet.</p>}
      <ul className="posts">
        {posts?.map((p) => (
          <li key={p.id} className="post">
            <div>
              <strong>{p.title}</strong>
              {p.body && <p>{p.body}</p>}
              <span className="muted">{timeAgo(p.createdAt)}</span>
            </div>
            <button className="icon-btn" aria-label={`Delete “${p.title}”`}
              onClick={() => confirm('Delete this announcement? Students won’t see it anymore.') && deleteDoc(doc(db, 'announcements', p.id))}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
