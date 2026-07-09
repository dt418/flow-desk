import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  getSocketToken,
  ensureSocketTokenPrefetch,
  clearSocketToken,
  SOCKET_API_URL,
} from './socket-token';

type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

const sockets = new Map<FlowDeskNamespace, Socket>();

// ponytail: per-namespace timestamp marking when a socket first entered a
// reconnecting state. If it stays reconnecting past the threshold we treat it
// as stuck (never connects, never reaches a clean disconnect) and replace it.
const reconnectingSince = new Map<FlowDeskNamespace, number>();

const STUCK_RECONNECT_TIMEOUT_MS = 15000;

// Access token TTL is 15m (JWT_ACCESS_TTL). Refresh the httpOnly access cookie
// well before expiry so REST calls (which use credentials:'include') never 401.
// The socket itself no longer depends on this cookie — it uses the JS-readable
// socket token from /api/auth/socket-token passed via `auth:{ token }`.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // every 10m → leaves ≥5m margin
let lastRefreshAt = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAccessTokenCookie(): Promise<void> {
  const now = Date.now();
  if (now - lastRefreshAt < REFRESH_INTERVAL_MS) return;
  lastRefreshAt = now;

  try {
    await fetch(`${SOCKET_API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Network blip — next tick retries. Don't throw into the interval.
    lastRefreshAt = 0;
  }
}

function ensureRefreshLoop(): void {
  if (refreshTimer !== null) return;
  refreshTimer = setInterval(() => {
    void refreshAccessTokenCookie();
  }, REFRESH_INTERVAL_MS);
}

export function getSocket(ns: FlowDeskNamespace): Socket {
  const existing = sockets.get(ns);
  if (existing) {
    if (existing.connected) {
      reconnectingSince.delete(ns);
      return existing;
    }

    const manager = existing.io as unknown as { reconnecting?: boolean; _reconnecting?: boolean };
    const reconnecting = manager.reconnecting === true || manager._reconnecting === true;
    if (reconnecting) {
      const since = reconnectingSince.get(ns);
      if (since === undefined) {
        reconnectingSince.set(ns, Date.now());
        return existing;
      } else if (Date.now() - since > STUCK_RECONNECT_TIMEOUT_MS) {
        existing.removeAllListeners();
        existing.io.removeAllListeners();
        existing.disconnect();
        sockets.delete(ns);
        reconnectingSince.delete(ns);
      } else {
        return existing;
      }
    } else {
      // Not connected and not actively reconnecting. This is the normal
      // initial-connect window (engine readyState 'opening') or a transient
      // between attempts. The manager owns reconnection, so just return the
      // existing socket — never recreate here, or we delete the in-flight
      // socket on every getSocket() call and it never stays connected.
      return existing;
    }
  }

  const socket = io(`${SOCKET_API_URL}${ns}`, {
    withCredentials: false,
    // ponytail: polling only — socket token auth via `auth:{}` handshake,
    // no httpOnly cookie needed. Add 'websocket' back if latency matters.
    transports: ['polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
    // Dynamic auth: async so we can resolve the latest JS-readable socket token
    // on every (re)connect. No cookie — the token comes from /api/auth/socket-token.
    auth: async () => {
      const token = await getSocketToken();
      return { token };
    },
  });
  socket.io.on('reconnect', () => reconnectingSince.delete(ns));
  socket.on('connect', () => reconnectingSince.delete(ns));
  sockets.set(ns, socket);
  ensureRefreshLoop();
  ensureSocketTokenPrefetch();
  return socket;
}

export function disconnectAllSockets(): void {
  for (const ns of Array.from(sockets.keys())) {
    const socket = sockets.get(ns);
    if (socket) {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    }
    sockets.delete(ns);
    reconnectingSince.delete(ns);
  }
  clearSocketToken();
}

export function useNamespacedSocket(ns: FlowDeskNamespace) {
  const [connected, setConnected] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const socket = getSocket(ns);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setConnected(true);

    return () => {
      startedRef.current = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [ns]);

  return { socket: getSocket(ns), connected };
}

export function useSocket() {
  return useNamespacedSocket('/tasks');
}

/**
 * Track socket connection state including reconnection attempts.
 * Returns one of: 'connected' | 'connecting' | 'disconnected' | 'reconnecting'.
 *
 * Reconnection is driven by socket.io's manager with exponential backoff
 * (1s -> 30s, 0.5 randomization) configured in `getSocket` above.
 */
export function useSocketStatus(ns: FlowDeskNamespace = '/tasks'): SocketStatus {
  const socket = getSocket(ns);
  const [status, setStatus] = useState<SocketStatus>(() =>
    socket.connected ? 'connected' : 'connecting',
  );

  useEffect(() => {
    const recompute = () => {
      if (socket.connected) {
        setStatus('connected');
      } else if (socket.disconnected) {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    };

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onReconnectAttempt = () => setStatus('reconnecting');
    const onReconnect = () => setStatus('connected');
    const onReconnectFailed = () => setStatus('disconnected');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);

    recompute();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
    };
  }, [socket]);

  return status;
}
