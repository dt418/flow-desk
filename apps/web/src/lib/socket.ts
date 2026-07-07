import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

const sockets = new Map<FlowDeskNamespace, Socket>();

// ponytail: per-namespace timestamp marking when a socket first entered a
// reconnecting state. If it stays reconnecting past the threshold we treat it
// as stuck (never connects, never reaches a clean disconnect) and replace it.
const reconnectingSince = new Map<FlowDeskNamespace, number>();

const STUCK_RECONNECT_TIMEOUT_MS = 15000;

// Access token TTL is 15m (JWT_ACCESS_TTL). Refresh well before expiry so a
// long-lived socket never handshakes with a stale token. Refresh cookies are
// httpOnly and re-issued by POST /api/auth/refresh (sent via withCredentials).
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // every 10m → leaves ≥5m margin
let lastRefreshAt = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function readAccessToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : '';
}

// Refresh the access_token cookie before it expires. Credentials: 'include'
// lets the browser attach the httpOnly refresh_token cookie; the response
// re-issues a fresh access_token cookie that the socket picks up on reconnect.
async function refreshSocketToken(): Promise<void> {
  const now = Date.now();
  if (now - lastRefreshAt < REFRESH_INTERVAL_MS) return;
  lastRefreshAt = now;

  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  try {
    await fetch(`${apiUrl}/api/auth/refresh`, {
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
    void refreshSocketToken();
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
      // Not connected and not actively reconnecting: clean disconnect/connecting.
      return existing;
    }
  }

  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  const accessToken = readAccessToken();
  const socket = io(`${apiUrl}${ns}`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
    // Dynamic auth: re-read the latest token on every (re)connect so a
    // refreshed cookie is used instead of the value captured at creation.
    auth: () => {
      const token = readAccessToken();
      return token ? { token } : {};
    },
    extraHeaders: accessToken ? { Cookie: `access_token=${accessToken}` } : undefined,
  });
  socket.io.on('reconnect', () => reconnectingSince.delete(ns));
  socket.on('connect', () => reconnectingSince.delete(ns));
  sockets.set(ns, socket);
  ensureRefreshLoop();
  return socket;
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
