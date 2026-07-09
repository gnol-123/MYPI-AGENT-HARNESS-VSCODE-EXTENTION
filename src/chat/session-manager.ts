import { ConversationHistory } from '../agent/history';
import { Message } from '../providers/types';

const STORAGE_KEY = 'mypi-sessions-v2';
const LEGACY_KEY = 'mypi-sessions';
const MAX_SAVED_MESSAGES = 50;

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  messages: DisplayMessage[];
  history: ConversationHistory;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface SerializedSession {
  id: string;
  name: string;
  messages: DisplayMessage[];
  historyMessages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface SerializedState {
  sessions: SerializedSession[];
  activeId: string;
}

interface LegacySession {
  id: string;
  name: string;
  messages: DisplayMessage[];
  createdAt: number;
}

/** Minimal Memento shape so tests can pass a plain object. */
export interface StateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private _activeId = '';
  private lastStamp = 0;

  constructor(private state?: StateStore) {}

  get activeId(): string {
    return this._activeId;
  }

  setActive(id: string): void {
    if (this.sessions.has(id)) {
      this._activeId = id;
    }
  }

  private now(): number {
    // Monotonic: guarantees stable most-recent-first ordering even within one ms.
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  create(name?: string): Session {
    const stamp = this.now();
    const session: Session = {
      id: this.generateId(),
      name: name || `Chat ${this.sessions.size + 1}`,
      messages: [],
      history: new ConversationHistory(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.sessions.set(session.id, session);
    this._activeId = session.id;
    this.save();
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    if (this.sessions.size <= 1) return;
    this.sessions.delete(id);
    if (this._activeId === id) {
      this._activeId = this.list()[0].id;
    }
    this.save();
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({
        id: s.id,
        name: s.name,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages.push({
      id: this.generateId(),
      role,
      content,
      timestamp: Date.now(),
    });
    if (role === 'user' && session.messages.filter((m) => m.role === 'user').length === 1) {
      session.name = content.slice(0, 30) + (content.length > 30 ? '...' : '');
    }
    session.updatedAt = this.now();
    this.save();
  }

  clear(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages = [];
    session.history.clear();
    session.updatedAt = this.now();
    this.save();
  }

  save(): void {
    if (!this.state) return;
    const serialized: SerializedState = {
      activeId: this._activeId,
      sessions: Array.from(this.sessions.values()).map((s) => ({
        id: s.id,
        name: s.name,
        messages: s.messages.slice(-MAX_SAVED_MESSAGES),
        historyMessages: s.history.toJSON(),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    };
    try {
      this.state.update(STORAGE_KEY, serialized);
    } catch {
      // Non-fatal: continue in memory.
    }
  }

  load(): void {
    if (!this.state) return;
    const stored = this.state.get<SerializedState>(STORAGE_KEY);
    if (stored && stored.sessions.length > 0) {
      this.sessions = new Map(
        stored.sessions.map((s) => [
          s.id,
          {
            id: s.id,
            name: s.name,
            messages: s.messages,
            history: ConversationHistory.fromJSON(s.historyMessages),
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          },
        ]),
      );
      this._activeId = this.sessions.has(stored.activeId)
        ? stored.activeId
        : this.list()[0].id;
      this.lastStamp = Math.max(...stored.sessions.map((s) => s.updatedAt), 0);
      return;
    }

    const legacy = this.state.get<Record<string, LegacySession>>(LEGACY_KEY);
    if (legacy && Object.keys(legacy).length > 0) {
      for (const old of Object.values(legacy)) {
        const history = new ConversationHistory();
        for (const m of old.messages) {
          if (m.role === 'user') history.addUserMessage(m.content);
          else history.addAssistantMessage(m.content);
        }
        this.sessions.set(old.id, {
          id: old.id,
          name: old.name,
          messages: old.messages,
          history,
          createdAt: old.createdAt,
          updatedAt: old.createdAt,
        });
      }
      this._activeId = this.list()[0].id;
      this.save();
      return;
    }

    this.create('Chat 1');
  }
}
