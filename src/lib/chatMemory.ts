/**
 * Stacy AI — Conversation Memory System
 * Persists chat sessions to localStorage with structured facts extraction.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ExtractedFact {
  type: 'decision' | 'preference' | 'insight' | 'alert';
  key: string;
  value: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  summary: string;
  messages: ChatMessage[];
  extractedFacts: ExtractedFact[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'stacy_chat_sessions';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;

function getUserId(): string {
  try {
    const token = sessionStorage.getItem('token');
    if (!token) return 'anonymous';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.sub || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getStorageKey(): string {
  return `${STORAGE_KEY}_${getUserId()}`;
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(sessions));
  } catch (e) {
    // If quota exceeded, prune oldest sessions
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      const trimmed = sessions.slice(-20);
      localStorage.setItem(getStorageKey(), JSON.stringify(trimmed));
    }
  }
}

function createSessionTitle(firstUserMessage: string): string {
  const text = firstUserMessage.slice(0, 60);
  return text.length >= 60 ? text + '...' : text;
}

function generateSummary(messages: ChatMessage[]): string {
  // Simple heuristic: pick first user message and assistant's key response
  const firstUser = messages.find(m => m.role === 'user');
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  if (!firstUser) return 'General inquiry';
  const topic = firstUser.content.slice(0, 40);
  if (lastAssistant) {
    const action = lastAssistant.content.slice(0, 60).replace(/\n/g, ' ');
    return `${topic} → ${action}`;
  }
  return topic;
}

function extractFacts(messages: ChatMessage[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const lower = msg.content.toLowerCase();

    // Detect decisions
    if (/\b(decide|decision|choose|chosen|picked|went with|opted for|will use|plan to)\b/i.test(lower)) {
      facts.push({
        type: 'decision',
        key: 'user_decision',
        value: msg.content.slice(0, 120),
        createdAt: now,
      });
    }

    // Detect preferences
    if (/\b(prefer|like|want|don't want|hate|favorite|usually|always|never)\b/i.test(lower)) {
      facts.push({
        type: 'preference',
        key: 'user_preference',
        value: msg.content.slice(0, 120),
        createdAt: now,
      });
    }

    // Detect insights/requests about data
    if (/\b(show me|chart|graph|report|compare|analyze|trend|forecast)\b/i.test(lower)) {
      facts.push({
        type: 'insight',
        key: 'data_request',
        value: msg.content.slice(0, 120),
        createdAt: now,
      });
    }
  }

  return facts.slice(-10); // Keep last 10 facts max
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export const chatMemory = {
  /** Start or continue a session. Returns the active session ID. */
  getOrCreateSession(): { sessionId: string; messages: ChatMessage[] } {
    const sessions = loadSessions();
    const userId = getUserId();

    // Find the most recent non-empty session from today
    const today = new Date().toDateString();
    const recent = sessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .find(s => new Date(s.updatedAt).toDateString() === today && s.messages.length > 1);

    if (recent) {
      return { sessionId: recent.id, messages: recent.messages };
    }

    const newSession: ChatSession = {
      id: generateId(),
      userId,
      title: 'New conversation',
      summary: '',
      messages: [],
      extractedFacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sessions.push(newSession);
    saveSessions(sessions);
    return { sessionId: newSession.id, messages: [] };
  },

  /** Append messages to the active session. */
  appendMessages(sessionId: string, messages: ChatMessage[]): void {
    const sessions = loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    session.messages.push(...messages);

    // Trim if too long
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }

    // Auto-generate title from first user message
    if (session.title === 'New conversation') {
      const firstUser = session.messages.find(m => m.role === 'user');
      if (firstUser) {
        session.title = createSessionTitle(firstUser.content);
      }
    }

    session.summary = generateSummary(session.messages);
    session.extractedFacts = extractFacts(session.messages);
    session.updatedAt = new Date().toISOString();

    // Keep only recent sessions
    const userSessions = sessions.filter(s => s.userId === session.userId);
    const otherSessions = sessions.filter(s => s.userId !== session.userId);
    const trimmed = [...otherSessions, ...userSessions.slice(-MAX_SESSIONS)];

    saveSessions(trimmed);
  },

  /** Get memory context to inject into LLM prompts. */
  getMemoryContext(sessionId: string): string {
    const sessions = loadSessions();
    const userId = getUserId();

    // Current session (excluding last few messages to avoid duplication)
    const current = sessions.find(s => s.id === sessionId);
    const currentSummary = current ? current.summary : '';
    const currentFacts = current ? current.extractedFacts : [];

    // Previous sessions from this user (last 3)
    const previous = sessions
      .filter(s => s.userId === userId && s.id !== sessionId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)
      .map(s => `- ${s.title}: ${s.summary}`)
      .join('\n');

    const parts: string[] = [];

    if (currentSummary) {
      parts.push(`CONV:${currentSummary.slice(0, 120)}`);
    }

    if (currentFacts.length > 0) {
      parts.push(`FACTS:${currentFacts.map(f => `${f.type}=${f.value.slice(0, 60)}`).join(';')}`);
    }

    if (previous) {
      parts.push(`PREV:${previous.replace(/\n/g, '|').slice(0, 200)}`);
    }

    return parts.join(' ');
  },

  /** Get all sessions for the current user (for a future session picker UI). */
  getSessions(): ChatSession[] {
    const sessions = loadSessions();
    const userId = getUserId();
    return sessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  /** Clear all memory for current user. */
  clear(): void {
    localStorage.removeItem(getStorageKey());
  },
};
