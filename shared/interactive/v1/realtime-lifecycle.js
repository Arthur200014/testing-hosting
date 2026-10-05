import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getDatabase, ref, onValue, onDisconnect, set, update, serverTimestamp, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

export function createRealtimeLifecycle({ config, namespace, appId, sessionId }) {
  const app = initializeApp(config);
  const database = getDatabase(app);
  // The package-wide hook is preferred for new consumers; the EGA/6 name is
  // retained so existing browser smoke tests and pages keep identical behavior.
  const genericEmulator = globalThis.__INTERACTIVE_RTDB_EMULATOR__;
  const emulator = genericEmulator ?? globalThis.__EGA6_RTDB_EMULATOR__;
  if (emulator !== undefined) {
    if (typeof emulator?.host !== "string" || !emulator.host || !Number.isInteger(emulator.port) || emulator.port < 1 || emulator.port > 65535) {
      const setting = genericEmulator !== undefined ? "__INTERACTIVE_RTDB_EMULATOR__" : "__EGA6_RTDB_EMULATOR__";
      throw new TypeError(`Invalid ${setting} host/port configuration`);
    }
    connectDatabaseEmulator(database, emulator.host, emulator.port);
  }

  const rootPath = `${namespace}/${appId}/${sessionId}`;
  const path = (child = "") => child ? `${rootPath}/${child}` : rootPath;
  const databaseRef = (child = "") => ref(database, path(child));

  return {
    database,
    rootPath,
    path,
    ref: databaseRef,
    subscribeValue(child, callback, errorCallback) {
      return onValue(databaseRef(child), callback, errorCallback);
    },
    presence(memberId, heartbeatMs = 0) {
      const memberRef = databaseRef(`members/${memberId}`);
      let disconnectHandle = null;
      let heartbeatTimer = null;

      return {
        async afterWrite() {
          try { await disconnectHandle?.cancel?.(); } catch {}
          disconnectHandle = onDisconnect(memberRef);
          await disconnectHandle.update({ online: false, lastSeen: serverTimestamp() });
          clearInterval(heartbeatTimer);
          heartbeatTimer = heartbeatMs > 0
            ? setInterval(() => update(memberRef, { online: true, lastSeen: serverTimestamp() }).catch(() => {}), heartbeatMs)
            : null;
        },
        async stop() {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          try { await disconnectHandle?.cancel?.(); } catch {}
          try { await update(memberRef, { online: false, lastSeen: serverTimestamp() }); } catch {}
        }
      };
    }
  };
}
