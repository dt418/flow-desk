import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const apiUrl = import.meta.env.VITE_API_URL ?? '';
    socket = io(apiUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket?.disconnect();
      socket = null;
      startedRef.current = false;
    };
  }, []);

  return { socket, connected };
}
