import { authorizeEvent } from './access.mjs';

// Framework-neutral boundary for the future Socket.IO adapter.
// It never accepts a client-supplied broadcast destination.
export function bindRoom({ key, token, scope, journal, revoked, clock = Date.now }) {
  const bound = Object.freeze({ workspace: scope.workspace, board: scope.board });
  function check(event) {
    return authorizeEvent(key, token, bound, event, { now: clock(), revoked });
  }
  check('replay');
  return Object.freeze({
    async submit(frame) {
      const claims = check('scene');
      return journal.append(bound, { ...frame, user: claims.user });
    },
    async replay(after = 0) {
      check('replay');
      return journal.replay(bound, after);
    },
  });
}
