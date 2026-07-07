import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

const sockets = new Map<FlowDeskNamespace, Socket>();

function getSocket(ns: FlowDeskNamespace): Socket {
  const existing = sockets.get(ns);
  if (existing && (existing.connected || (!existing.connected && !existing.disconnected)))
    return existing;
  if (existing) {
    existing.removeAllListeners();
    existing.disconnect();
  }

  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  const accessToken = (() => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]!) : '';
  })();
  const socket = io(`${apiUrl}${ns}`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
    auth: accessToken ? { token: accessToken } : undefined,
    extraHeaders: accessToken ? { Cookie: `access_token=${accessToken}` } : undefined,
  });
  sockets.set(ns, socket);
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
