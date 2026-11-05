// Paste your Firebase web app's settings here. SETUP.md shows where to find them.
//
// These values are safe in a public repository. They only identify your
// project; your data is protected by Google sign-in and firestore.rules.
// Never put a service account key (a file containing "private_key") in this project.

export const firebaseConfig = {
  apiKey: 'AIzaSyB0wLGjlHodx66ttDQ9hFSQAeH2foDVBSM',
  authDomain: 'nclex-daily.firebaseapp.com',
  projectId: 'nclex-daily',
  appId: '1:334638042182:web:97aa5600af96e9d48e0e47',
};

export const isConfigured = !Object.values(firebaseConfig).some((value) => value.startsWith('PASTE_'));
