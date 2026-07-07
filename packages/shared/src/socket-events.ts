export const SOCKET_EVENTS = {
  Connection: 'connection',
  Authenticated: 'authenticated',
  Error: 'error:emit',
  ConversationJoin: 'conversation:join',
  ConversationLeave: 'conversation:leave',
  ConversationUpdated: 'conversation:updated',
  WorkspaceJoin: 'workspace:join',
  WorkspaceLeave: 'workspace:leave',
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  MessageUpdate: 'message:update',
  MessageDelete: 'message:delete',
  MessageRead: 'message:read',
  PresenceUpdate: 'presence:update',
  UserOnline: 'user:online',
  UserOffline: 'user:offline',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  Ack: 'ack',
} as const;

export const SOCKET_ROOMS = {
  workspace: (wid: string) => `workspace:${wid}`,
  conversation: (cid: string) => `conversation:${cid}`,
  user: (uid: string) => `user:${uid}`,
  task: (tid: string) => `task:${tid}`,
} as const;
