import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

const sockets = new Map<FlowDeskNamespace, Socket>();

function getSocket(ns: FlowDeskNamespace): Socket {
  const existing = sockets.get(ns);
  if (existing && existing.connected) return existing;

  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  const socket = io(`${apiUrl}${ns}`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
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
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [ns]);

  return { socket: getSocket(ns), connected };
}

export function useSocket() {
  return useNamespacedSocket('/tasks');
}