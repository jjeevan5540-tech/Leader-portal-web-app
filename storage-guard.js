// Leader Portal — storage guard (shared by login.html and index.html)
// The Firebase telemetry ("heartbeat") SDK persists an IndexedDB database
// at this origin, which Lighthouse reports as "stored data affecting
// loading performance". Block that probe for this app and drop any copy
// left behind by earlier visits (or other apps on this GitHub Pages origin).
(function () {
  var HEARTBEAT_DB = "firebase-heartbeat-database";
  function isFirebaseProbe(name) {
    return typeof name === "string" &&
      (name === HEARTBEAT_DB || name.indexOf("validate-browser-context-for-indexeddb") === 0);
  }
  try {
    var originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (name) {
      if (isFirebaseProbe(name)) {
        var err = new Error("Firebase heartbeat IndexedDB storage is disabled");
        err.name = "InvalidStateError";
        throw err;
      }
      return originalOpen.apply(null, arguments);
    };
  } catch (e) {}
  try {
    indexedDB.deleteDatabase(HEARTBEAT_DB);
    indexedDB.deleteDatabase("validate-browser-context-for-indexeddb-analytics-module");
  } catch (e) {}
})();
