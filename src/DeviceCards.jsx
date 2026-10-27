import { useEffect, useState } from 'react';
import { isStandalone, isIOS } from './pwa';

/* ---------- little illustrations: what to look for at each step ---------- */

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);
const AddSquareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const DotsIcon = ({ vertical }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="fill">
    {vertical
      ? <><circle cx="12" cy="5.5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="18.5" r="1.9" /></>
      : <><circle cx="5.5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="18.5" cy="12" r="1.9" /></>}
  </svg>
);

/** A phone-shaped tile with the thing to tap and a pulsing "tap here" ring. */
function StepArt({ kind }) {
  return (
    <div className={`step-art kind-${kind}`} aria-hidden="true">
      <div className="art-phone">
        {kind === 'share' && (
          <div className="art-bar">
            <span className="art-ghost" /><span className="art-ghost" />
            <span className="art-target"><ShareIcon /></span>
            <span className="art-ghost" /><span className="art-ghost" />
          </div>
        )}
        {kind === 'menu' && (
          <div className="art-bar art-bar-top">
            <span className="art-url" />
            <span className="art-target"><DotsIcon vertical /></span>
          </div>
        )}
        {kind === 'add' && (
          <div className="art-list">
            <span className="art-row" />
            <span className="art-row" />
            <span className="art-row art-target-row"><AddSquareIcon /><b>Add to Home Screen</b></span>
            <span className="art-row" />
          </div>
        )}
        {kind === 'confirm' && (
          <div className="art-confirm">
            <span className="art-cancel">Cancel</span>
            <span className="art-target art-pill">Add</span>
            <img src="/icons/icon-192.png" alt="" className="art-appicon" />
            <span className="art-name">BCNY Board</span>
          </div>
        )}
        {kind === 'home' && (
          <div className="art-home">
            {Array.from({ length: 11 }).map((_, i) => <span key={i} className="art-app" />)}
            <span className="art-app art-me"><img src="/icons/icon-192.png" alt="" /></span>
          </div>
        )}
      </div>
    </div>
  );
}

function stepsFor(platform) {
  if (platform === 'ios') {
    return [
      {
        art: 'share', title: 'Tap the Share button',
        body: <>It’s the square with an arrow pointing up, in Safari’s toolbar. Don’t see it? Tap <b>⋯</b> first, then <b>Share</b>.</>,
      },
      {
        art: 'add', title: 'Tap “Add to Home Screen”',
        body: <>Scroll down the list until you see it. If it’s hiding, tap <b>View More</b> or <b>Edit Actions</b>.</>,
      },
      {
        art: 'confirm', title: 'Tap “Add”',
        body: <>It’s in the top-right corner. Keep the name as <b>BCNY Board</b>.</>,
      },
      {
        art: 'home', title: 'Open it from your home screen',
        body: <>Find the BCNY Board icon and tap it. From now on it opens like a real app, no browser needed.</>,
      },
    ];
  }
  return [
    {
      art: 'menu', title: 'Tap the menu button',
      body: <>It’s the <b>⋮</b> (three dots) in the top-right corner of Chrome.</>,
    },
    {
      art: 'add', title: 'Tap “Add to Home screen”',
      body: <>Some phones call it <b>Install app</b>. Either one works.</>,
    },
    {
      art: 'confirm', title: 'Tap “Install” or “Add”',
      body: <>Confirm on the pop-up. Your phone might ask once more to place it on the home screen.</>,
    },
    {
      art: 'home', title: 'Open it from your home screen',
      body: <>Find the BCNY Board icon and tap it. It opens full-screen like a real app.</>,
    },
  ];
}

function InstallGuide({ platform, onClose, onDone }) {
  const steps = stepsFor(platform);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const last = i === steps.length - 1;

  const close = () => { setLeaving(true); setTimeout(onClose, 220); };
  const go = (n) => { setDir(n > i ? 1 : -1); setI(n); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && !last) go(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe left/right between steps.
  const [x0, setX0] = useState(null);
  const onTouchStart = (e) => setX0(e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (dx < -40 && !last) go(i + 1);
    if (dx > 40 && i > 0) go(i - 1);
    setX0(null);
  };

  const s = steps[i];
  return (
    <div className={`guide-backdrop ${leaving ? 'is-leaving' : ''}`} onClick={close}>
      <div className="guide" role="dialog" aria-modal="true" aria-label="Add BCNY Board to your home screen"
        onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="guide-grab" aria-hidden="true" />
        <div className="guide-head">
          <span className="guide-count">Step {i + 1} of {steps.length}</span>
          <button className="icon-btn" onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="guide-progress" aria-hidden="true">
          <span style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </div>

        <div key={i} className={`guide-step ${dir > 0 ? 'from-right' : 'from-left'}`} aria-live="polite">
          <StepArt kind={s.art} />
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </div>

        <div className="guide-dots" role="tablist" aria-label="Steps">
          {steps.map((st, n) => (
            <button key={n} role="tab" aria-selected={n === i} aria-label={`Step ${n + 1}: ${st.title}`}
              className={n === i ? 'is-on' : ''} onClick={() => go(n)} />
          ))}
        </div>

        <div className="guide-btns">
          <button className="btn btn-ghost" onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
          {last
            ? <button className="btn btn-primary" onClick={() => { onDone(); close(); }}>Got it</button>
            : <button className="btn btn-primary" onClick={() => go(i + 1)}>Next</button>}
        </div>
      </div>
    </div>
  );
}

export function InstallCard() {
  const [deferred, setDeferred] = useState(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('hideInstall') === '1'; } catch { return false; }
  });
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (isStandalone() || hidden) return null;

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => setHidden(true), 280);
    try { localStorage.setItem('hideInstall', '1'); } catch {}
  };

  const ios = isIOS();
  // Android/desktop Chrome can install in one tap; everyone else gets the walkthrough.
  const oneTap = deferred && !ios;
  const install = async () => {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') dismiss();
  };

  return (
    <>
      <div className={`card install-card ${closing ? 'is-closing' : ''}`}>
        <div className="install-icon" aria-hidden="true">
          <img src="/icons/icon-192.png" alt="" />
          <span className="install-plus">+</span>
        </div>
        <div className="install-text">
          <strong>Put BCNY Board on your home screen</strong>
          <p>Opens like a real app. Takes about 10 seconds.</p>
        </div>
        <div className="install-btns">
          <button className="btn btn-primary btn-sm" onClick={oneTap ? install : () => setOpen(true)}>
            {oneTap ? 'Install' : 'Show me how'}
          </button>
          <button className="link" onClick={dismiss}>Not now</button>
        </div>
      </div>
      {open && (
        <InstallGuide platform={ios ? 'ios' : 'android'} onClose={() => setOpen(false)} onDone={() => {}} />
      )}
    </>
  );
}
