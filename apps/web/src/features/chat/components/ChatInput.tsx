import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useNamespacedSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@flow-desk/shared/socket-events';

interface ChatInputProps {
  channelId: string;
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ channelId, onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { socket } = useNamespacedSocket('/collab');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const emitTypingStart = useCallback(() => {
    if (isTypingRef.current) return;
    isTypingRef.current = true;
    socket.emit(SOCKET_EVENTS.TypingStart, { channelId });
  }, [socket, channelId]);

  const emitTypingStop = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    socket.emit(SOCKET_EVENTS.TypingStop, { channelId });
  }, [socket, channelId]);

  useEffect(() => {
    return () => {
      emitTypingStop();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [emitTypingStop]);

  const handleFocus = () => emitTypingStart();

  const handleBlur = () => emitTypingStop();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    emitTypingStart();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, 3000);
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    emitTypingStop();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-background p-3">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder ?? 'Message #channel'}
        disabled={disabled}
        rows={1}
        aria-label="Message"
        className="max-h-40 min-h-[36px] flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      />
      <Button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="sm"
        className="shrink-0"
      >
        Send
      </Button>
    </div>
  );
}
