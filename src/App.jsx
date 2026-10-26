import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, checkTeacher } from './firebase';
import Login from './Login';
import StudentHome from './StudentHome';
import TeacherHome from './TeacherHome';
import { Toast, Avatar } from './ui';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [teacher, setTeacher] = useState(null); // null = role not loaded yet
  const [toast, setToast] = useState(null);
  const [, rerender] = useState(0);

  // Re-read displayName after an email signup sets it.
  useEffect(() => {
    const bump = () => rerender((n) => n + 1);
    window.addEventListener('profile-updated', bump);
    return () => window.removeEventListener('profile-updated', bump);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setTeacher(null);
        setUser(u);
        if (u) {
          checkTeacher(u).then(setTeacher);
          // Keep a profile doc so the teacher can see who joined.
          await setDoc(
            doc(db, 'users', u.uid),
            {
              name: u.displayName || u.email.split('@')[0],
              email: u.email.toLowerCase(),
              photoURL: u.photoURL || null,
              lastSeen: serverTimestamp(),
            },
            { merge: true }
          ).catch((e) => console.warn('Profile save failed', e));
        }
      }),
    []
  );

  if (user === undefined || (user && teacher === null)) {
    return (
      <div className="splash">
        <img src="/icons/icon-192.png" alt="" width="72" height="72" />
      </div>
    );
  }
  if (!user) return <Login />;

  const name = user.displayName || user.email.split('@')[0];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/icons/icon-192.png" alt="" width="28" height="28" />
          <span>BCNY Board</span>
          {teacher && <span className="role-pill">Teacher</span>}
        </div>
        <button className="me" onClick={() => confirm('Sign out?') && signOut(auth)} aria-label="Sign out">
          <Avatar name={name} photo={user.photoURL} size={32} />
        </button>
      </header>
      {teacher ? <TeacherHome user={user} notify={setToast} /> : <StudentHome user={user} notify={setToast} />}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
