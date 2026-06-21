# ADR-004: Real-time Architecture — Socket.IO with Redis Adapter

## Context

FlowDesk needs real-time updates for:
- Task create/update/move/delete
- New comments and @mentions
- Notifications
- Typing indicators
- User presence (who's viewing a task)

Polling is unacceptable for collaboration. We need a real-time transport.

## Decision

**Socket.IO v4 with Redis Pub/Sub adapter** for horizontal scaling.

### Namespaces

```
/tasks          → Task operations
/notifications  → Notification delivery
/collab         → Comments, typing, presence
```

### Rooms

```
workspace:{id}     → All events for a workspace (everyone subscribed)
/tasks namespace
  task:{id}        → Specific task events (presence, typing)
/notifications
  user:{id}        → Per-user notification stream
/collab
  task:{id}        → Comments + typing for a specific task
```

### Authentication

JWT validated on `connection`:
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const payload = verifyJWT(token);
    socket.data.userId = payload.userId;
    next();
  } catch (e) {
    next(new Error('unauthorized'));
  }
});
```

Failing connection closes immediately. No anonymous sockets.

## Rationale

- **Socket.IO** — Battle-tested, automatic reconnection, rooms, namespaces, fallbacks
- **Redis adapter** — Required when running >1 API instance (sticky sessions don't scale across instances)
- **Namespaces** — Logical separation; auth middleware per namespace if needed
- **Rooms** — Efficient targeted broadcasts (don't send task updates to users not in that workspace)

## Memory Leak Guard

```typescript
socket.on('disconnect', () => {
  socket.rooms.forEach(room => socket.leave(room));
  clearInterval(typingIntervals.get(socket.id));
  typingIntervals.delete(socket.id);
});
```

## Alternatives Rejected

| Alternative | Why Rejected |
|-------------|--------------|
| **Raw WebSocket** | No automatic reconnect, no rooms, no fallback; reinventing the wheel |
| **SSE (Server-Sent Events)** | One-way only; can't send typing indicators back to server efficiently |
| **WebRTC** | P2P only; doesn't fit server-mediated events like notifications |
| **Pusher / Ably (managed)** | SaaS lock-in; defeats self-hosted requirement |
| **Long polling** | Slow; high CPU usage; legacy |

## Consequences

- **Positive**: Scales horizontally, robust reconnection, room-based efficiency
- **Negative**: Requires Redis; more moving parts than raw WS; Socket.IO overhead vs WS (~10%)

## Security

- JWT required on every connection
- Rate limit `connection` events (1 per user per second max)
- Validate `socket.data.userId` matches workspace membership before joining room
- Never trust client-sent data; always re-verify on emit