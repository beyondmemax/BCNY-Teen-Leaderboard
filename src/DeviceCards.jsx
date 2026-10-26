import { useEffect, useState } from 'react';
import { isStandalone, isIOS } from './pwa';

export function InstallCard() {
  const [deferred, setDeferred] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('hideInstall') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (isStandalone() || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem('hideInstall', '1'); } catch {}
  };

  const ios = isIOS();
  return (
    <div className="card card-install">
      <div>
        <strong>Add it to your home screen</strong>
        {ios ? (
          <p>
            In Safari, tap <b>Share</b> <span aria-hidden="true">⬆︎</span>, then <b>Add to Home Screen</b>.
          </p>
        ) : deferred ? (
          <p>Install it like an app so the board is one tap away.</p>
        ) : (
          <p>Open your browser menu <span aria-hidden="true">⋮</span> and pick <b>Add to Home screen</b> or <b>Install app</b>.</p>
        )}
      </div>
      <div className="card-btns">
        {deferred && !ios && (
          <button className="btn btn-primary" onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null); }}>
            Install
          </button>
        )}
        <button className="link" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
