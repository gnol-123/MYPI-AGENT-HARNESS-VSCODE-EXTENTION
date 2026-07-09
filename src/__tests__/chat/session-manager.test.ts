import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../chat/session-manager';

function fakeMemento() {
  const store: Record<string, unknown> = {};
  return {
    store,
    get: <T>(key: string) => store[key] as T | undefined,
    update: (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    },
  };
}

describe('SessionManager', () => {
  it('creates a session and makes it active', () => {
    const mgr = new SessionManager();
    const s = mgr.create('Chat 1');
    expect(mgr.activeId).toBe(s.id);
    expect(mgr.get(s.id)?.name).toBe('Chat 1');
  });

  it('auto-names a session from the first user message', () => {
    const mgr = new SessionManager();
    const s = mgr.create();
    mgr.addMessage(s.id, 'user', 'fix the icon in the activity bar please');
    expect(mgr.get(s.id)?.name).toBe('fix the icon in the activity b...');
  });

  it('keeps histories isolated between sessions', () => {
    const mgr = new SessionManager();
    const a = mgr.create('A');
    const b = mgr.create('B');
    a.history.addUserMessage('question in A');
    expect(a.history.getMessages()).toHaveLength(1);
    expect(b.history.getMessages()).toHaveLength(0);
  });

  it('reassigns active when the active session is deleted', () => {
    const mgr = new SessionManager();
    const a = mgr.create('A');
    const b = mgr.create('B');
    mgr.delete(b.id);
    expect(mgr.activeId).toBe(a.id);
    expect(mgr.get(b.id)).toBeUndefined();
  });

  it('refuses to delete the last session', () => {
    const mgr = new SessionManager();
    const a = mgr.create('A');
    mgr.delete(a.id);
    expect(mgr.get(a.id)).toBeDefined();
  });

  it('clear wipes messages and history', () => {
    const mgr = new SessionManager();
    const s = mgr.create('A');
    mgr.addMessage(s.id, 'user', 'hello');
    s.history.addUserMessage('hello');
    mgr.clear(s.id);
    expect(mgr.get(s.id)?.messages).toHaveLength(0);
    expect(mgr.get(s.id)?.history.getMessages()).toHaveLength(0);
  });

  it('persists and restores sessions including history', () => {
    const memento = fakeMemento();
    const mgr = new SessionManager(memento);
    const s = mgr.create('A');
    mgr.addMessage(s.id, 'user', 'remember me');
    s.history.addUserMessage('remember me');
    s.history.addAssistantMessage('I will');
    mgr.save();

    const restored = new SessionManager(memento);
    restored.load();
    const rs = restored.get(s.id);
    expect(rs).toBeDefined();
    expect(rs!.messages).toHaveLength(1);
    expect(rs!.history.getMessages()).toHaveLength(2);
    expect(restored.activeId).toBe(s.id);
  });

  it('migrates the old mypi-sessions shape, rebuilding history', () => {
    const memento = fakeMemento();
    memento.store['mypi-sessions'] = {
      old1: {
        id: 'old1',
        name: 'legacy chat',
        createdAt: 123,
        messages: [
          { id: 'm1', role: 'user', content: 'hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'hello', timestamp: 2 },
        ],
      },
    };
    const mgr = new SessionManager(memento);
    mgr.load();
    const s = mgr.get('old1');
    expect(s).toBeDefined();
    expect(s!.messages).toHaveLength(2);
    expect(s!.history.getMessages()).toHaveLength(2);
    expect(s!.history.getMessages()[0].role).toBe('user');
  });

  it('caps serialized messages at 50 per session', () => {
    const memento = fakeMemento();
    const mgr = new SessionManager(memento);
    const s = mgr.create('big');
    for (let i = 0; i < 60; i++) {
      mgr.addMessage(s.id, 'user', `msg ${i}`);
    }
    mgr.save();
    const restored = new SessionManager(memento);
    restored.load();
    expect(restored.get(s.id)!.messages).toHaveLength(50);
    expect(restored.get(s.id)!.messages[49].content).toBe('msg 59');
  });

  it('lists sessions most recently updated first', () => {
    const mgr = new SessionManager();
    const a = mgr.create('A');
    const b = mgr.create('B');
    mgr.addMessage(a.id, 'user', 'bump A');
    const list = mgr.list();
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
    expect(list[0].messageCount).toBe(1);
  });
});
