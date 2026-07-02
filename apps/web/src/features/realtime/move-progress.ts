/**
 * Shared flag that prevents Socket.IO `task:moved` events from
 * invalidating the board query while a local move mutation is in flight.
 *
 * Board page sets this before calling mutate(); useRealtime skips
 * invalidation for `task:moved` when the flag is true.
 * onSettled clears it and issues its own invalidation.
 */

let _moveInProgress = false;
let _listeners: Array<() => void> = [];

export function isMoveInProgress() {
  return _moveInProgress;
}

export function setMoveInProgress(v: boolean) {
  _moveInProgress = v;
  for (const fn of _listeners) fn();
}

export function onMoveProgressChange(fn: () => void) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
