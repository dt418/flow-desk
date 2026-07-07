import { useEffect, useState, useRef, useCallback } from 'react';
import { useNamespacedSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@flow-desk/shared/socket-events';

interface TypingUser {
  userId: string;
  userName: string;
}

interface TypingIndicatorProps {
  channelId: string;
  currentUserId: string;
}

const CLEAR_TIMEOUT_MS = 3000;

export function TypingIndicator({ channelId, currentUserId }: TypingIndicatorProps) {
  const { socket } = useNamespacedSocket('/collab');
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeUser = useCallback((userId: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  useEffect(() => {
    const onStart = (data: { channelId: string; userId: string; userName: string }) => {
      if (data.channelId !== channelId || data.userId === currentUserId) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userName: data.userName }];
      });
      const existing = timersRef.current.get(data.userId);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        data.userId,
        setTimeout(() => {
          removeUser(data.userId);
          timersRef.current.delete(data.userId);
        }, CLEAR_TIMEOUT_MS),
      );
    };

    const onStop = (data: { channelId: string; userId: string }) => {
      if (data.channelId !== channelId) return;
      const timer = timersRef.current.get(data.userId);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(data.userId);
      }
      removeUser(data.userId);
    };

    socket.on(SOCKET_EVENTS.TypingStart, onStart);
    socket.on(SOCKET_EVENTS.TypingStop, onStop);
    return () => {
      socket.off(SOCKET_EVENTS.TypingStart, onStart);
      socket.off(SOCKET_EVENTS.TypingStop, onStop);
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [socket, channelId, currentUserId, removeUser]);

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.userName);
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing...`;
  }

  return (
    <div className="px-4 py-1">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
