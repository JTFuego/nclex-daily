// The only file that talks to Firebase. Everything else uses these functions,
// so a different backend would mean changing just this file.
//
// Each person's data lives at users/{their user ID}/days/{date}.
// firestore.rules makes sure only that person can read or write it.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  reauthenticateWithPopup,
  deleteUser,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocsFromServer,
  writeBatch,
  waitForPendingWrites,
  terminate,
  clearIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// The offline cache keeps answers on this device until the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' }); // makes switching accounts easy

const DELETE_BATCH_SIZE = 400;

const daysOf = (uid) => collection(db, 'users', uid, 'days');

export function onUserChange(callback) {
  return onAuthStateChanged(auth, (user) =>
    callback(user ? { uid: user.uid, name: user.displayName, email: user.email } : null),
  );
}

// A popup, because redirect sign-in fails in Safari on sites like GitHub Pages.
export function signIn() {
  return signInWithPopup(auth, provider);
}

// Calls back with { changes: [{ type, date, doc }], fromCache } on every update.
export function listenDays(uid, onUpdate, onError) {
  return onSnapshot(
    daysOf(uid),
    { includeMetadataChanges: true },
    (snapshot) =>
      onUpdate({
        changes: snapshot.docChanges({ includeMetadataChanges: true }).map((change) => ({
          type: change.type,
          date: change.doc.id,
          doc: change.doc.data(),
        })),
        fromCache: snapshot.metadata.fromCache,
      }),
    onError,
  );
}

// Merging means two devices' answers for the same day combine rather than overwrite.
export function writeDay(uid, date, data) {
  return setDoc(doc(daysOf(uid), date), data, { merge: true });
}

// True once this device's answers have reached the cloud.
export async function allSynced(timeoutMs) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([waitForPendingWrites(db).then(() => true), timeout]);
}

export function confirmIdentity() {
  return reauthenticateWithPopup(auth.currentUser, provider);
}

export async function deleteAllDays(uid) {
  const snapshot = await getDocsFromServer(daysOf(uid));
  for (let i = 0; i < snapshot.docs.length; i += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    snapshot.docs.slice(i, i + DELETE_BATCH_SIZE).forEach((day) => batch.delete(day.ref));
    await batch.commit();
  }
}

export function deleteSignInRecord() {
  return deleteUser(auth.currentUser);
}

// Signs out and removes this account's cached copy, which matters on a shared computer.
export async function signOutAndClear() {
  await signOut(auth);
  await terminate(db);
  try {
    await clearIndexedDbPersistence(db);
  } catch (error) {
    console.warn('Close other tabs of this app to fully clear its cached data.', error);
  }
}
