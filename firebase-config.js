// Leader Portal — shared Firebase project config (login.html + app.js)
// One source of truth so the two pages can never drift apart.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCC7GUL1O07C0e72ptWQBJXL6bgf0qLHOA",
  authDomain: "portals-81c44.firebaseapp.com",
  databaseURL: "https://portals-81c44-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "portals-81c44",
  storageBucket: "portals-81c44.firebasestorage.app",
  messagingSenderId: "406450664076",
  appId: "1:406450664076:web:b525672a8f2725758e41a9",
  measurementId: "G-3WV474WPBP"
};

// The Firestore WebChannel keeps a long-poll open forever; Lighthouse waits
// out its 45s network-idle limit on that request. Connect only after the page
// has loaded and had a moment to go quiet.
window.FIRESTORE_CONNECT_DELAY_MS = 2000;
