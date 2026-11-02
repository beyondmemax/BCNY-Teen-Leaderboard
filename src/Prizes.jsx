import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { compressImage, imageError } from './images';
import { CYCLE, PRIZE_TIERS } from './config';
import { Avatar, timeAgo } from './ui';

const EMPTY = { link: '', item: '', price: '', photo: null };

const cleanLink = (s) => {
  const t = s.trim();
  if (!t) return '';
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
};
const hostOf = (href) => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return href; } };

/* ======================= Student ======================= */

export function StudentPrize({ user, rank, notify }) {
  const [saved, setSaved] = useState(undefined);
  const [form, setForm] = useState({ top: EMPTY, third: EMPTY });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(db, 'prizes', user.uid), (snap) => {
        const d = snap.exists() && snap.data().cycle === CYCLE.id ? snap.data() : null;
        setSaved(d);
        if (!dirty) {
          setForm({
            top: { ...EMPTY, ...(d?.top || {}), price: d?.top?.price ?? '' },
            third: { ...EMPTY, ...(d?.third || {}), price: d?.third?.price ?? '' },
          });
        }
      }, () => setSaved(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.uid]
  );

  const set = (tier, patch) => {
    setDirty(true);
    setErrors((e) => ({ ...e, [tier]: '' }));
    setForm((f) => ({ ...f, [tier]: { ...f[tier], ...patch } }));
  };

  const save = async (e) => {
    e.preventDefault();
    const out = {};
    const errs = {};
    for (const t of PRIZE_TIERS) {
      const v = form[t.key];
      const link = cleanLink(v.link);
      const price = v.price === '' ? null : Number(v.price);
      if (link === null) errs[t.key] = 'That link doesn’t look right. Copy it straight from the store’s page.';
      else if (price !== null && (Number.isNaN(price) || price < 0)) errs[t.key] = 'Enter the price as a number, like 39.99.';
      else if (price !== null && price > t.limit) errs[t.key] = `That’s over the $${t.limit} limit. Pick something $${t.limit} or less.`;
      else if (!link && !v.item.trim() && !v.photo) errs[t.key] = 'Add a link, a name, or a picture so we know what you want.';
      else out[t.key] = { link: link || '', item: v.item.trim(), price, photo: v.photo || null };
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'prizes', user.uid), {
        name: user.displayName || user.email.split('@')[0],
        cycle: CYCLE.id, top: out.top, third: out.third, updatedAt: serverTimestamp(),
      });
      setDirty(false);
      notify({ title: 'Prize picks saved', body: 'You can change them any time before the cycle ends.' });
    } catch (err) {
      console.error(err);
      notify({ title: 'Didn’t save', body: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (saved === undefined) return <div className="loading-rows"><span /><span /></div>;

  const inTop3 = rank && rank <= 3;
  return (
    <section className="prize">
      <div className="prize-hero">
        <h2>Finish top 3, win a prize.</h2>
        <p>
          When the {CYCLE.name} ends, the top three on the board get a prize. Pick yours now so it’s ready.
          {inTop3 && <> You’re <b>#{rank}</b> right now, keep it up.</>}
        </p>
      </div>

      <form className="stack" onSubmit={save} noValidate>
        {PRIZE_TIERS.map((t) => (
          <PrizeCard key={t.key} tier={t} value={form[t.key]} error={errors[t.key]}
            onChange={(patch) => set(t.key, patch)} />
        ))}
        <button className="btn btn-primary" disabled={busy || (!dirty && !!saved)}>
          {busy ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save my picks'}
        </button>
        {saved?.updatedAt && !dirty && <p className="muted center">Last saved {timeAgo(saved.updatedAt)}</p>}
      </form>
    </section>
  );
}

function PrizeCard({ tier, value, error, onChange }) {
  const fileRef = useRef(null);
  const [photoErr, setPhotoErr] = useState('');
  const [loading, setLoading] = useState(false);

  const pick = async (file) => {
    if (!file) return;
    setPhotoErr(''); setLoading(true);
    try {
      onChange({ photo: await compressImage(file, { maxSide: 900, maxChars: 180_000 }) });
    } catch (e) {
      setPhotoErr(imageError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <fieldset className={`card prize-card tier-${tier.key}`}>
      <legend className="prize-legend">
        <span className="prize-place">{tier.label}</span>
        <span className="prize-limit">up to ${tier.limit}</span>
      </legend>

      <label>
        <span>Link to it <span className="muted">(best)</span></span>
        <input type="text" inputMode="url" value={value.link} onChange={(e) => onChange({ link: e.target.value })}
          placeholder="Paste a link from Amazon, Target, Nike…" autoComplete="off" />
      </label>
      <div className="prize-row">
        <label className="prize-item">
          What is it?
          <input value={value.item} onChange={(e) => onChange({ item: e.target.value })} maxLength={80} placeholder="Wireless earbuds" />
        </label>
        <label className="prize-price">
          Price
          <span className="money">
            <span aria-hidden="true">$</span>
            <input type="number" inputMode="decimal" min="0" max={tier.limit} step="0.01" value={value.price}
              onChange={(e) => onChange({ price: e.target.value })} placeholder={String(tier.limit)} />
          </span>
        </label>
      </div>

      <div className="prize-photo">
        {value.photo ? (
          <div className="proof-thumb">
            <img src={value.photo} alt="Your prize" />
            <button type="button" className="proof-x" onClick={() => onChange({ photo: null })} aria-label="Remove picture">✕</button>
          </div>
        ) : (
          <button type="button" className="proof-add proof-add-wide" onClick={() => fileRef.current?.click()} disabled={loading}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="m20 15-4.5-4.5L6 20" /></svg>
            {loading ? 'Adding…' : 'Add a picture (optional)'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {(error || photoErr) && <p className="error" role="alert">{error || photoErr}</p>}
    </fieldset>
  );
}

/* ======================= Teacher ======================= */

export function TeacherPrizes({ rows }) {
  const [picks, setPicks] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(
    () =>
      onSnapshot(collection(db, 'prizes'), (snap) =>
        setPicks(new Map(snap.docs.filter((d) => d.data().cycle === CYCLE.id).map((d) => [d.id, d.data()])))
      ),
    []
  );

  if (!picks || !rows) return <div className="loading-rows"><span /><span /><span /></div>;

  const ranked = rows.map((r) => ({ ...r, pick: picks.get(r.id) }));
  const offBoard = [...picks.entries()].filter(([id]) => !rows.some((r) => r.id === id));

  const clearAll = async () => {
    if (!confirm(`Clear every student’s prize picks? Do this after prizes are handed out for the ${CYCLE.name}.`)) return;
    await Promise.all([...picks.keys()].map((id) => deleteDoc(doc(db, 'prizes', id))));
  };

  return (
    <section>
      <p className="section-meta">
        {CYCLE.name}: {picks.size} of {rows.length} on the board picked a prize. The top 3 are highlighted.
      </p>
      <ul className="prize-list">
        {ranked.map((r) => {
          const tier = r.rank <= 2 ? 'top' : r.rank === 3 ? 'third' : null;
          return (
            <li key={r.id} className={`prize-entry ${tier ? 'is-winning' : ''}`}>
              <div className="prize-entry-head">
                <span className="row-rank">{r.rank}</span>
                <Avatar name={r.name} photo={r.photoURL} size={34} />
                <span className="row-name">{r.name}</span>
                <span className="row-pts">{r.points}</span>
              </div>
              {!r.pick ? (
                <p className="muted prize-none">No prize picked yet.</p>
              ) : (
                <div className="prize-picks">
                  {PRIZE_TIERS.map((t) => (
                    <PickLine key={t.key} tier={t} pick={r.pick[t.key]} active={tier === t.key} onZoom={setZoom} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {offBoard.length > 0 && (
        <p className="muted">{offBoard.length} student{offBoard.length === 1 ? '' : 's'} not on the board also picked prizes.</p>
      )}
      {picks.size > 0 && (
        <button className="btn btn-ghost prize-clear" onClick={clearAll}>Clear all picks for the next cycle</button>
      )}
      {zoom && (
        <button className="zoom" onClick={() => setZoom(null)} aria-label="Close picture">
          <img src={zoom} alt="Prize picture, full size" />
        </button>
      )}
    </section>
  );
}

function PickLine({ tier, pick, active, onZoom }) {
  if (!pick) return null;
  return (
    <div className={`pick ${active ? 'is-active' : ''}`}>
      <span className="pick-tier">${tier.limit}</span>
      <div className="pick-body">
        <strong>{pick.item || (pick.link ? hostOf(pick.link) : 'Picture only')}</strong>
        <span className="muted">
          {pick.price != null ? `$${Number(pick.price).toFixed(2)}` : 'No price given'}
          {pick.link && <> · <a href={pick.link} target="_blank" rel="noopener noreferrer">Open link</a></>}
        </span>
      </div>
      {pick.photo && (
        <button className="pick-photo" onClick={() => onZoom(pick.photo)} aria-label="View picture">
          <img src={pick.photo} alt="" />
        </button>
      )}
    </div>
  );
}
