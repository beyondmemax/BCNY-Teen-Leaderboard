import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import Leaderboard, { useLeaderboard } from './Leaderboard';
import { InstallCard } from './DeviceCards';
import { timeAgo } from './ui';

const millis = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

/** Announcements feed + when this student last opened it (stored on their profile, so it syncs across devices). */
function useAnnouncements(uid, onNew) {
  const [posts, setPosts] = useState(null);
  const [seenAt, setSeenAt] = useState(undefined); // undefined = loading, null = never opened
  const known = useRef(null);

  useEffect(
    () =>
      onSnapshot(doc(db, 'users', uid), (snap) =>
        setSeenAt(snap.get('announcementsSeenAt', { serverTimestamps: 'estimate' }) || null)
      ),
    [uid]
  );

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30)), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        // Pop a toast for anything posted while the app is open (skip the first load).
        if (known.current) list.filter((p) => !known.current.has(p.id)).forEach(onNew);
        known.current = new Set(list.map((p) => p.id));
        setPosts(list);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const unread = posts && seenAt !== undefined
    ? posts.filter((p) => millis(p.createdAt) > millis(seenAt)).length
    : 0;
  const markSeen = () =>
    setDoc(doc(db, 'users', uid), { announcementsSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});

  return { posts, unread, seenAt, markSeen };
}

export default function StudentHome({ user, notify }) {
  const [tab, setTab] = useState('Leaderboard');
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const { rows, error } = useLeaderboard();
  const { posts, unread, seenAt, markSeen } = useAnnouncements(user.uid, (p) => {
    if (tabRef.current !== 'Announcements') notify({ title: 'New announcement', body: p.title });
  });
  // The "new" highlight should survive while you read, so freeze what was unread when you opened the tab.
  const [openedSeenAt, setOpenedSeenAt] = useState(null);

  useEffect(() => {
    if (tab === 'Announcements' && unread > 0) markSeen();
  }, [tab, unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAnnouncements = () => {
    setOpenedSeenAt(seenAt || null);
    setTab('Announcements');
  };

  return (
    <main className="page">
      <nav className="tabs" aria-label="Sections">
        <button className={`tab ${tab === 'Leaderboard' ? 'is-active' : ''}`} aria-current={tab === 'Leaderboard' ? 'page' : undefined}
          onClick={() => setTab('Leaderboard')}>
          Leaderboard
        </button>
        <button className={`tab ${tab === 'Announcements' ? 'is-active' : ''}`} aria-current={tab === 'Announcements' ? 'page' : undefined}
          onClick={openAnnouncements}>
          Announcements
          {unread > 0 && tab !== 'Announcements' && (
            <span className="badge" aria-label={`${unread} new`}>{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      </nav>

      {tab === 'Leaderboard' ? (
        <LeaderboardTab user={user} rows={rows} error={error} />
      ) : (
        <AnnouncementsTab posts={posts} newSince={openedSeenAt} />
      )}
    </main>
  );
}

function LeaderboardTab({ user, rows, error }) {
  const me = rows?.find((r) => r.id === user.uid);
  const ahead = me && rows.filter((r) => r.points > me.points).at(-1);
  const firstName = (user.displayName || '').split(' ')[0];

  return (
    <>
      <section className="hero">
        {me ? (
          <>
            <p className="hero-hi">{firstName ? `Hey ${firstName}, you're` : "You're"}</p>
            <p className="hero-rank">
              <span className="hash">#</span>{me.rank}
            </p>
            <p className="hero-sub">
              <b>{me.points.toLocaleString()}</b> points
              {ahead ? <>, {ahead.points - me.points} behind {ahead.name.split(' ')[0]}</> : rows.length > 1 ? <>, top of the board</> : null}
            </p>
          </>
        ) : (
          <>
            <p className="hero-hi">{firstName ? `Hey ${firstName}` : 'Welcome'}</p>
            <p className="hero-wait">You’re not on the board yet.</p>
            <p className="hero-sub">Your teacher adds people — you’ll show up here once they do.</p>
          </>
        )}
      </section>

      <InstallCard />

      {error ? <p className="error">{error}</p> : (
        <Leaderboard rows={rows} meId={user.uid} emptyText="The board’s empty for now. Check back soon." />
      )}
    </>
  );
}

function AnnouncementsTab({ posts, newSince }) {
  if (!posts) return <div className="loading-rows" aria-label="Loading"><span /><span /><span /></div>;
  if (!posts.length) return <p className="empty">No announcements yet. When your teacher posts something, it shows up here.</p>;
  return (
    <ul className="posts posts-student">
      {posts.map((p) => {
        const isNew = millis(p.createdAt) > millis(newSince);
        return (
          <li key={p.id} className={`post ${isNew ? 'is-new' : ''}`}>
            <div>
              <strong>{p.title}</strong>
              {isNew && <span className="new-tag">New</span>}
              {p.body && <p>{p.body}</p>}
              <span className="muted">{p.authorName ? `${p.authorName}, ` : ''}{timeAgo(p.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
