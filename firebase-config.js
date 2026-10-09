// Leader Portal — shared Firebase project config (login.html + app.js)
// One source of truth so the two pages can never drift apart.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzSkDxcfEGg7UR63Hy1SUXDhWcE-BCod4",
  authDomain: "ticket-portal-dca26.firebaseapp.com",
  projectId: "ticket-portal-dca26",
  storageBucket: "ticket-portal-dca26.firebasestorage.app",
  messagingSenderId: "5141901822",
  appId: "1:5141901822:web:e3944c9a9f0f79108650af",
  measurementId: "G-Z8K474MFLT"
};

// The Firestore WebChannel keeps a long-poll open forever; Lighthouse waits
// out its 45s network-idle limit on that request. Connect only after the page
// has loaded and had a moment to go quiet.
window.FIRESTORE_CONNECT_DELAY_MS = 2000;
