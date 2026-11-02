import { useEffect, useRef, useState } from 'react';
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query, where,
  runTransaction, serverTimestamp, writeBatch, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { compressImage, imageError, todayISO, prettyDate } from './images';
import { MAX_HOMEWORK_PER_DAY, MAX_PROOF_PHOTOS } from './config';
import { Avatar, Sheet, timeAgo } from './ui';

const STATUS = {
  pending: { label: 'Waiting for review', cls: 'pill-wait' },
  approved: { label: 'Approved', cls: 'pill-ok' },
  rejected: { label: 'Not approved', cls: 'pill-no' },
};

/* ======================= Student ======================= */

export function StudentHomework({ user, notify }) {
  const [date, setDate] = useState(todayISO);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]); // data URLs
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(null);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'homework'), where('uid', '==', user.uid)),
        (snap) => setMine(
          snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        ),
        () => setMine([])
      ),
    [user.uid]
  );

  const addFiles = async (files) => {
    setError('');
    const room = MAX_PROOF_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) setError(`You can attach up to ${MAX_PROOF_PHOTOS} photos.`);
    if (!picked.length) return;
    setAdding(true);
    try {
      const out = [];
      for (const f of picked) out.push(await compressImage(f));
      setPhotos((p) => [...p, ...out].slice(0, MAX_PROOF_PHOTOS));
    } catch (e) {
      setError(imageError(e));
    } finally {
      setAdding(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!photos.length) return setError('Add at least one photo or screenshot as proof.');
    if (date > todayISO()) return setError('That date is in the future. Pick today or an earlier day.');
    setBusy(true);
    try {
      const ref = doc(collection(db, 'homework'));
      const batch = writeBatch(db);
      batch.set(ref, {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        date, count, note: note.trim(), photoCount: photos.length,
        status: 'pending', createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'homeworkProof', ref.id), { uid: user.uid, photos });
      await batch.commit();
      setCount(1); setNote(''); setPhotos([]); setDate(todayISO());
      notify({ title: 'Homework sent', body: 'Your teacher will review it and add your points.' });
    } catch (err) {
      console.error(err);
      setError('Couldn’t send it. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h) => {
    if (!confirm('Delete this submission?')) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'homework', h.id));
    batch.delete(doc(db, 'homeworkProof', h.id));
    await batch.commit().catch(() => notify({ title: 'Couldn’t delete it', body: 'Try again in a moment.' }));
  };

  const approvedPts = (mine || []).filter((h) => h.status === 'approved').reduce((s, h) => s + (h.points || 0), 0);

  return (
    <section className="hw">
      <form className="card stack hw-form" onSubmit={submit} noValidate>
        <h2 className="card-title">Log your homework</h2>

        <div className="hw-row">
          <label className="hw-date">
            Day
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <div className="hw-count">
            <span className="field-label" id="hw-count-label">How many?</span>
            <div className="stepper" role="group" aria-labelledby="hw-count-label">
              <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="One less">−</button>
              <output aria-live="polite">{count}</output>
              <button type="button" onClick={() => setCount((c) => Math.min(MAX_HOMEWORK_PER_DAY, c + 1))}
                disabled={count >= MAX_HOMEWORK_PER_DAY} aria-label="One more">+</button>
            </div>
          </div>
        </div>

        <label>
          <span>What did you do? <span className="muted">(optional)</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Math worksheet, reading log…" />
        </label>

        <div>
          <span className="field-label">Proof</span>
          <div className="proof-grid">
            {photos.map((p, i) => (
              <div key={i} className="proof-thumb">
                <img src={p} alt={`Proof photo ${i + 1}`} />
                <button type="button" className="proof-x" onClick={() => setPhotos((ps) => ps.filter((_, n) => n !== i))}
                  aria-label={`Remove photo ${i + 1}`}>✕</button>
              </div>
            ))}
            {photos.length < MAX_PROOF_PHOTOS && (
              <>
                <button type="button" className="proof-add" onClick={() => cameraRef.current?.click()} disabled={adding}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  Take photo
                </button>
                <button type="button" className="proof-add" onClick={() => uploadRef.current?.click()} disabled={adding}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="m20 15-4.5-4.5L6 20" /></svg>
                  Upload
                </button>
              </>
            )}
          </div>
          {adding && <p className="muted">Getting your photo ready…</p>}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={uploadRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || adding}>
          {busy ? 'Sending…' : `Send ${count} homework${count === 1 ? '' : 's'} for review`}
        </button>
      </form>

      <div className="list-head-row">
        <h3 className="list-head">Your submissions</h3>
        {approvedPts > 0 && <span className="muted">{approvedPts} points earned</span>}
      </div>
      {mine === null && <div className="loading-rows"><span /><span /></div>}
      {mine?.length === 0 && <p className="empty">Nothing sent yet. Log your first homework above.</p>}
      <ul className="hw-list">
        {mine?.map((h) => (
          <li key={h.id} className="hw-item">
            <div className="hw-item-main">
              <strong>{prettyDate(h.date)}</strong>
              <span>{h.count} homework{h.count === 1 ? '' : 's'}{h.note ? `, ${h.note}` : ''}</span>
            </div>
            <div className="hw-item-side">
              <span className={`pill ${STATUS[h.status]?.cls}`}>
                {h.status === 'approved' ? `+${h.points || 0} pts` : STATUS[h.status]?.label}
              </span>
              {h.status === 'pending' && (
                <button className="icon-btn" onClick={() => remove(h)} aria-label="Delete this submission">✕</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ======================= Teacher ======================= */

async function review(h, approve, points, teacher) {
  const hwRef = doc(db, 'homework', h.id);
  await runTransaction(db, async (tx) => {
    const hw = await tx.get(hwRef);
    if (!hw.exists() || hw.data().status !== 'pending') throw new Error('already-reviewed');
    if (approve && points > 0) {
      const boardRef = doc(db, 'leaderboard', h.uid);
      const board = await tx.get(boardRef);
      const current = board.exists() ? board.data().points || 0 : 0;
      if (board.exists()) tx.update(boardRef, { points: current + points, updatedAt: serverTimestamp() });
      else tx.set(boardRef, { name: h.name, photoURL: null, points, addedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.set(doc(collection(db, 'pointsLog')), {
        uid: h.uid, name: h.name, delta: points, reason: `Homework: ${h.count} on ${h.date}`,
        at: serverTimestamp(), by: teacher.email,
      });
    }
    tx.update(hwRef, {
      status: approve ? 'approved' : 'rejected',
      points: approve ? points : 0,
      reviewedAt: serverTimestamp(), reviewedBy: teacher.email,
    });
  });
  // Photos are only needed for review; deleting them keeps the database inside the free tier.
  await deleteDoc(doc(db, 'homeworkProof', h.id)).catch(() => {});
}

export function TeacherHomework({ user, notify }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'homework'), orderBy('createdAt', 'desc'), limit(80)), (snap) =>
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))
      ),
    []
  );

  if (!items) return <div className="loading-rows"><span /><span /><span /></div>;
  const pending = items.filter((h) => h.status === 'pending');
  const done = items.filter((h) => h.status !== 'pending').slice(0, 20);

  return (
    <section>
      <p className="section-meta">{pending.length ? `${pending.length} waiting for review` : 'All caught up.'}</p>
      {pending.length === 0 && <p className="empty">No homework to review. New submissions show up here.</p>}
      <ul className="hw-list">
        {pending.map((h) => (
          <li key={h.id}>
            <button className="hw-item hw-item-btn" onClick={() => setOpen(h)}>
              <Avatar name={h.name} size={36} />
              <div className="hw-item-main">
                <strong>{h.name}</strong>
                <span>{h.count} homework{h.count === 1 ? '' : 's'} · {prettyDate(h.date)}</span>
              </div>
              <span className="pill pill-wait">Review</span>
            </button>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h3 className="list-head">Recently reviewed</h3>
          <ul className="hw-list">
            {done.map((h) => (
              <li key={h.id} className="hw-item">
                <div className="hw-item-main">
                  <strong>{h.name}</strong>
                  <span>{h.count} on {prettyDate(h.date)} · {timeAgo(h.reviewedAt)}</span>
                </div>
                <span className={`pill ${STATUS[h.status].cls}`}>
                  {h.status === 'approved' ? `+${h.points || 0} pts` : 'Not approved'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <ReviewSheet h={open} onClose={() => setOpen(null)} onDone={async (approve, pts) => {
          setOpen(null);
          try {
            await review(open, approve, pts, user);
            notify({ title: approve ? `Approved for ${open.name}` : 'Marked not approved', body: approve ? `+${pts} points added.` : 'They’ll see it in their list.' });
          } catch (e) {
            notify({ title: 'Didn’t save', body: e.message === 'already-reviewed' ? 'Another teacher already reviewed it.' : 'Check your connection and try again.' });
          }
        }} />
      )}
    </section>
  );
}

function ReviewSheet({ h, onClose, onDone }) {
  const [photos, setPhotos] = useState(null);
  const [points, setPoints] = useState(String(h.count));
  const [zoom, setZoom] = useState(null);
  const n = Math.max(0, parseInt(points, 10) || 0);

  useEffect(() => {
    getDoc(doc(db, 'homeworkProof', h.id))
      .then((s) => setPhotos(s.exists() ? s.data().photos || [] : []))
      .catch(() => setPhotos([]));
  }, [h.id]);

  return (
    <Sheet title={h.name} onClose={onClose}>
      <p className="sheet-sub">{h.count} homework{h.count === 1 ? '' : 's'} on {prettyDate(h.date)} · sent {timeAgo(h.createdAt)}</p>
      {h.note && <p className="hw-note">“{h.note}”</p>}
      <div className="proof-review">
        {photos === null && <div className="loading-rows"><span /></div>}
        {photos?.length === 0 && <p className="muted">No photos found for this one.</p>}
        {photos?.map((p, i) => (
          <button key={i} className="proof-big" onClick={() => setZoom(p)} aria-label={`Open proof photo ${i + 1} full size`}>
            <img src={p} alt={`Proof photo ${i + 1}`} />
          </button>
        ))}
      </div>
      <label>
        Points to give
        <input type="number" inputMode="numeric" min="0" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <p className="muted hw-hint">Photos are deleted after you review, to keep the app free.</p>
      <div className="sheet-btns">
        <button className="btn btn-minus" onClick={() => onDone(false, 0)}>Not approved</button>
        <button className="btn btn-plus" onClick={() => onDone(true, n)}>Approve +{n}</button>
      </div>
      {zoom && (
        <button className="zoom" onClick={() => setZoom(null)} aria-label="Close photo">
          <img src={zoom} alt="Proof photo, full size" />
        </button>
      )}
    </Sheet>
  );
}
