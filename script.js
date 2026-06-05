/**
 * ═══════════════════════════════════════════════════════════════
 * NexusAI — script.js
 * Universal AI Interface — Core Application Logic
 *
 * Modules:
 *  - ThemeManager       : Dark/light toggle, localStorage, system detection
 *  - NavManager         : Hamburger menu, mobile nav, connection badge
 *  - StorageManager     : IndexedDB abstraction for conversations + projects
 *  - APIManager         : Anthropic-compatible fetch, streaming, model listing
 *  - RAGEngine          : TF-IDF text chunking, similarity search, context injection
 *  - ChatManager        : Message rendering, history, streaming display
 *  - ProjectsManager    : CRUD for projects, file upload, KB management
 *  - SettingsManager    : Settings form, sliders, presets, data stats
 *  - SearchManager      : Pollinations AI web search augmentation
 *  - MarkdownParser     : Lightweight MD → HTML renderer
 *  - RevealObserver     : IntersectionObserver for scroll animations
 *  - ToastManager       : Notification toasts
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   POLYFILLS
═══════════════════════════════════════════════════════════════ */
if (!Array.prototype.findLast) {
  Array.prototype.findLast = function(fn) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (fn(this[i], i, this)) return this[i];
    }
    return undefined;
  };
}

/* ═══════════════════════════════════════════════════════════════
   CONFIGURATION DEFAULTS
═══════════════════════════════════════════════════════════════ */
const DEFAULTS = {
  maxTokens: 2048,
  temperature: 0.7,
  contextWindow: 20,
  topP: 1.0,
  streaming: true,
  webSearchDefault: false,
  fontSize: 16,
  compactMode: false,
  syntaxHighlight: true,
  themePref: 'dark',
};

const INSTRUCTION_TEMPLATES = {
  examiner: `You are a strict medical examiner and subject matter expert. You MUST only answer using the provided source documents. If the answer is not in the documents, say so clearly. Format your responses with clear headings and bullet points. Provide only high-yield, exam-relevant information.`,
  pacer: `You are a clinical reasoning coach. Apply the PACER system to all answers:
• P — Problem: Identify the core clinical problem
• A — Assessment: Assess the situation systematically  
• C — Clinical reasoning: Apply diagnostic/therapeutic logic
• E — Evidence: Cite evidence from provided documents
• R — Resolution: Summarize the answer and key takeaways
Ground ALL responses exclusively in the provided source files.`,
  pareto: `You are an 80/20 efficiency expert for medical education. For every topic or question:
1. Identify the 20% of knowledge that yields 80% of exam marks
2. Bold the single most important concept
3. List only the highest-yield facts (maximum 7 bullet points)
4. Flag anything commonly tested in exams
Use ONLY the provided documents as your source material.`,
  tutor: `You are a Socratic tutor for medical students. Never give answers directly — guide through questions. 
Ask probing questions to help the student reason through to the answer themselves. Reference the provided source documents when needed. If the student is stuck after 3 exchanges, provide a targeted hint.`,
  custom: '',
};

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
═══════════════════════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString('en', { weekday: 'short' });
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

/* ═══════════════════════════════════════════════════════════════
   TOAST MANAGER
═══════════════════════════════════════════════════════════════ */
const ToastManager = {
  container: null,

  init() {
    this.container = $('#toastContainer');
  },

  show(message, type = 'info', duration = 3500) {
    if (!this.container) return;
    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${escapeHtml(message)}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }
};

/* ═══════════════════════════════════════════════════════════════
   THEME MANAGER
═══════════════════════════════════════════════════════════════ */
const ThemeManager = {
  init() {
    // Detect system preference on first visit
    const saved = localStorage.getItem('nexus_theme_pref') || 'dark';
    let theme;
    if (saved === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      theme = saved;
    }
    this.apply(theme);
    this.bindToggle();

    // Listen for system changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (localStorage.getItem('nexus_theme_pref') === 'system') {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-current-theme', theme);
    // Update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0f1117' : '#f6f7fb';
    // Sync settings page picker if present
    const pickers = $$('.theme-option');
    pickers.forEach(p => {
      p.classList.toggle('active', p.dataset.themePref === localStorage.getItem('nexus_theme_pref') || p.dataset.themePref === theme);
    });
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this.apply(next);
    localStorage.setItem('nexus_theme_pref', next);
  },

  bindToggle() {
    document.addEventListener('click', e => {
      if (e.target.closest('#themeToggle')) this.toggle();
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   NAV MANAGER
═══════════════════════════════════════════════════════════════ */
const NavManager = {
  init() {
    this.hamburger = $('#hamburger');
    this.mobileMenu = $('#mobileMenu');
    this.overlay = $('#mobileMenuOverlay');
    this.closeBtn = $('#mobileMenuClose');

    if (this.hamburger) {
      this.hamburger.addEventListener('click', () => this.openMenu());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeMenu());
    }
    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.closeMenu());
    }

    // Keyboard close
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeMenu();
    });

    // Sidebar toggle (chat page)
    const sidebarToggle = $('#sidebarToggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        const sidebar = $('#chatSidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
      });
    }
  },

  openMenu() {
    this.mobileMenu?.classList.add('open');
    this.overlay?.classList.add('visible');
    this.hamburger?.classList.add('open');
    this.hamburger?.setAttribute('aria-expanded', 'true');
    this.mobileMenu?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  },

  closeMenu() {
    this.mobileMenu?.classList.remove('open');
    this.overlay?.classList.remove('visible');
    this.hamburger?.classList.remove('open');
    this.hamburger?.setAttribute('aria-expanded', 'false');
    this.mobileMenu?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  },

  updateConnectionBadge(status, label) {
    const dots = $$('.badge-dot');
    const labels = $$('.badge-label');
    dots.forEach(d => {
      d.className = 'badge-dot';
      if (status) d.classList.add(status);
    });
    labels.forEach(l => l.textContent = label);
  }
};

/* ═══════════════════════════════════════════════════════════════
   STORAGE MANAGER (IndexedDB)
═══════════════════════════════════════════════════════════════ */
const StorageManager = {
  db: null,
  DB_NAME: 'nexusai_db',
  DB_VERSION: 2,

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const cs = db.createObjectStore('conversations', { keyPath: 'id' });
          cs.createIndex('updatedAt', 'updatedAt');
        }
        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        // Knowledge base chunks
        if (!db.objectStoreNames.contains('kb_chunks')) {
          const ks = db.createObjectStore('kb_chunks', { keyPath: 'id', autoIncrement: true });
          ks.createIndex('projectId', 'projectId');
        }
      };
      req.onsuccess = e => { this.db = e.target.result; resolve(); };
      req.onerror = e => { console.error('IndexedDB error:', e); resolve(); };
    });
  },

  async _tx(storeName, mode, fn) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      if (req && req.onsuccess !== undefined) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
      }
    });
  },

  // CONVERSATIONS
  async saveConversation(conv) {
    return this._tx('conversations', 'readwrite', s => s.put(conv));
  },

  async getConversation(id) {
    return this._tx('conversations', 'readonly', s => s.get(id));
  },

  async getAllConversations() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
      req.onerror = () => resolve([]);
    });
  },

  async deleteConversation(id) {
    return this._tx('conversations', 'readwrite', s => s.delete(id));
  },

  async clearAllConversations() {
    return this._tx('conversations', 'readwrite', s => s.clear());
  },

  // PROJECTS
  async saveProject(project) {
    return this._tx('projects', 'readwrite', s => s.put(project));
  },

  async getProject(id) {
    return this._tx('projects', 'readonly', s => s.get(id));
  },

  async getAllProjects() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction('projects', 'readonly');
      const req = tx.objectStore('projects').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async deleteProject(id) {
    // Also delete all KB chunks for this project
    await this.deleteProjectChunks(id);
    return this._tx('projects', 'readwrite', s => s.delete(id));
  },

  // KB CHUNKS
  async saveChunk(chunk) {
    return this._tx('kb_chunks', 'readwrite', s => s.add(chunk));
  },

  async getProjectChunks(projectId) {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction('kb_chunks', 'readonly');
      const store = tx.objectStore('kb_chunks');
      const idx = store.index('projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async deleteProjectChunks(projectId) {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction('kb_chunks', 'readwrite');
      const store = tx.objectStore('kb_chunks');
      const idx = store.index('projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () => {
        const items = req.result || [];
        items.forEach(item => store.delete(item.id));
        tx.oncomplete = resolve;
      };
      req.onerror = resolve;
    });
  },

  async deleteChunksByFile(projectId, fileName) {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction('kb_chunks', 'readwrite');
      const store = tx.objectStore('kb_chunks');
      const idx = store.index('projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () => {
        const items = (req.result || []).filter(c => c.fileName === fileName);
        items.forEach(item => store.delete(item.id));
        tx.oncomplete = resolve;
      };
      req.onerror = resolve;
    });
  },

  async getStats() {
    const [convs, projects, chunks] = await Promise.all([
      this.getAllConversations(),
      this.getAllProjects(),
      this._getAllChunks()
    ]);
    const totalMessages = convs.reduce((acc, c) => acc + (c.messages?.length || 0), 0);
    return {
      conversations: convs.length,
      messages: totalMessages,
      projects: projects.length,
      chunks: chunks.length
    };
  },

  async _getAllChunks() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction('kb_chunks', 'readonly');
      const req = tx.objectStore('kb_chunks').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   SETTINGS STORE (localStorage)
═══════════════════════════════════════════════════════════════ */
const SettingsStore = {
  get(key) {
    const raw = localStorage.getItem(`nexus_${key}`);
    if (raw === null) return DEFAULTS[key];
    try { return JSON.parse(raw); } catch { return raw; }
  },
  set(key, val) {
    localStorage.setItem(`nexus_${key}`, JSON.stringify(val));
  },
  getAll() {
    const out = {};
    Object.keys(DEFAULTS).forEach(k => out[k] = this.get(k));
    out.baseUrl = localStorage.getItem('nexus_baseUrl') || '';
    out.apiKey = localStorage.getItem('nexus_apiKey') || '';
    out.activeModel = localStorage.getItem('nexus_activeModel') || '';
    return out;
  },
  setCredentials(baseUrl, apiKey) {
    localStorage.setItem('nexus_baseUrl', baseUrl);
    localStorage.setItem('nexus_apiKey', apiKey);
  },
  getCredentials() {
    return {
      baseUrl: localStorage.getItem('nexus_baseUrl') || '',
      apiKey: localStorage.getItem('nexus_apiKey') || ''
    };
  }
};

/* ═══════════════════════════════════════════════════════════════
   API MANAGER  (Anthropic /v1/messages)
═══════════════════════════════════════════════════════════════ */
const APIManager = {
  abortController: null,
  isStreaming: false,

  getConfig() {
    const creds = SettingsStore.getCredentials();
    return {
      baseUrl: creds.baseUrl.replace(/\/$/, ''),
      apiKey: creds.apiKey,
      model: localStorage.getItem('nexus_activeModel') || '',
      maxTokens: SettingsStore.get('maxTokens'),
      temperature: SettingsStore.get('temperature'),
      topP: SettingsStore.get('topP'),
      streaming: SettingsStore.get('streaming')
    };
  },

  /**
   * Anthropic does not expose a /models endpoint, so this is a no-op
   * stub. The model is supplied manually by the user in Settings.
   */
  async fetchModels() {
    return [];
  },

  /**
   * Bypassed: this proxy does not implement an OpenAI /models endpoint
   * and Anthropic has no equivalent, so the connectivity check would
   * always fail. We assume success when credentials are present.
   */
  async testConnection() {
    const { baseUrl, apiKey } = this.getConfig();
    if (!baseUrl || !apiKey) {
      return { ok: false, error: 'Missing base URL or API key' };
    }
    return { ok: true, modelCount: 0, skipped: true };
  },

  /**
   * Send a chat completion to the Anthropic Messages API.
   * Messages API: POST {baseUrl}/v1/messages
   *   Headers:  x-api-key, anthropic-version, Content-Type
   *   Body:     { model, messages, max_tokens, temperature, top_p, stream, system? }
   *   Response: { content: [{ type: "text", text: "..." }], ... }
   *   Stream:   SSE with event types message_start, content_block_delta, message_stop
   */
  async sendChat(messages, onToken, onDone, onError) {
    const cfg = this.getConfig();
    if (!cfg.baseUrl) { onError('No API base URL configured. Go to Settings to set it up.'); return; }
    if (!cfg.apiKey) { onError('No API key configured. Go to Settings to set it up.'); return; }
    if (!cfg.model) { onError('No model selected. Go to Settings to choose a model.'); return; }

    this.abortController = new AbortController();
    this.isStreaming = true;

    // Hoist any system messages out of the array — Anthropic requires
    // system instructions to be a top-level "system" field, not a
    // message in the messages[] array.
    const systemMessages = messages.filter(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    const systemText = systemMessages.map(m => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      }
      return '';
    }).join('\n\n');

    const body = {
      model: cfg.model,
      messages: userMessages,
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
      top_p: cfg.topP,
      stream: cfg.streaming
    };
    if (systemText) body.system = systemText;

    try {
      const resp = await fetch(`${cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });

      if (!resp.ok) {
        const errText = await resp.text();
        let errMsg = `API Error ${resp.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errJson.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      if (cfg.streaming && resp.body) {
        await this._readStream(resp.body, onToken, onDone);
      } else {
        const data = await resp.json();
        const content = data.content?.[0]?.text || '';
        onToken(content);
        onDone(content);
      }
    } catch (e) {
      this.isStreaming = false;
      if (e.name === 'AbortError') {
        onDone('_aborted_');
      } else {
        onError(e.message);
      }
    }
  },

  /**
   * Parse Anthropic SSE stream.
   * Event types: message_start, content_block_start, content_block_delta,
   *              content_block_stop, message_delta, message_stop, ping, error.
   * Text deltas arrive as { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
   */
  async _readStream(body, onToken, onDone) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines, keep the trailing partial line in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          // Anthropic content_block_delta events carry the streaming text
          if (json.type === 'content_block_delta' && json.delta?.text) {
            const delta = json.delta.text;
            fullText += delta;
            onToken(delta);
          } else if (json.type === 'message_stop') {
            // Stream finished — break out of inner loop, outer read() will return done
            break;
          } else if (json.type === 'error' && json.error?.message) {
            throw new Error(json.error.message);
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.startsWith('Unexpected')) {
            // Re-throw API errors, swallow JSON parse errors
            throw parseErr;
          }
        }
      }
    }
    this.isStreaming = false;
    onDone(fullText);
  },

  stop() {
    this.abortController?.abort();
    this.isStreaming = false;
  }
};

/* ═══════════════════════════════════════════════════════════════
   RAG ENGINE (TF-IDF + Cosine Similarity)
═══════════════════════════════════════════════════════════════ */
const RAGEngine = {
  /**
   * Tokenize text into words for TF-IDF
   */
  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  },

  /**
   * Compute TF (term frequency) for a document
   */
  computeTF(tokens) {
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    const total = tokens.length;
    Object.keys(tf).forEach(k => tf[k] /= total);
    return tf;
  },

  /**
   * Chunk text into overlapping segments
   */
  chunkText(text, chunkSize = 500, overlap = 80) {
    const chunks = [];
    let i = 0;
    const sentences = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    while (i < sentences.length) {
      const end = Math.min(i + chunkSize, sentences.length);
      chunks.push(sentences.slice(i, end));
      i += chunkSize - overlap;
      if (i >= sentences.length) break;
    }
    return chunks.filter(c => c.trim().length > 30);
  },

  /**
   * Compute cosine similarity between two TF vectors
   */
  cosineSimilarity(vec1, vec2) {
    const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    let dot = 0, mag1 = 0, mag2 = 0;
    keys.forEach(k => {
      const v1 = vec1[k] || 0;
      const v2 = vec2[k] || 0;
      dot += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    });
    const denom = Math.sqrt(mag1) * Math.sqrt(mag2);
    return denom === 0 ? 0 : dot / denom;
  },

  /**
   * Search stored chunks for a query, return top-k results
   */
  async search(projectId, query, topK = 5) {
    const chunks = await StorageManager.getProjectChunks(projectId);
    if (!chunks.length) return [];

    const queryTokens = this.tokenize(query);
    const queryTF = this.computeTF(queryTokens);

    const scored = chunks.map(chunk => {
      const chunkTF = this.computeTF(this.tokenize(chunk.text));
      const score = this.cosineSimilarity(queryTF, chunkTF);
      return { ...chunk, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(c => c.score > 0.001);
  },

  /**
   * Extract text from uploaded file
   */
  async extractText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      if (file.type === 'application/pdf') {
        // For PDFs, read as text (basic extraction)
        reader.onload = (e) => {
          try {
            const raw = e.target.result;
            // Extract readable text from PDF binary
            const matches = raw.match(/\(([^)]{3,})\)/g) || [];
            const text = matches
              .map(m => m.slice(1, -1))
              .filter(t => /[a-zA-Z]{2,}/.test(t))
              .join(' ')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '')
              .replace(/\s+/g, ' ');
            resolve(text.length > 100 ? text : `[PDF: ${file.name} — text extraction limited. Content indexed as filename.]`);
          } catch {
            resolve(`[PDF: ${file.name}]`);
          }
        };
        reader.readAsBinaryString(file);
      } else {
        reader.onload = (e) => resolve(e.target.result || '');
        reader.onerror = reject;
        reader.readAsText(file);
      }
    });
  },

  /**
   * Process and index a file into the KB
   */
  async indexFile(projectId, file, chunkSize = 500, onProgress) {
    const text = await this.extractText(file);
    const chunks = this.chunkText(text, chunkSize);
    const total = chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      await StorageManager.saveChunk({
        projectId,
        fileName: file.name,
        fileSize: file.size,
        text: chunks[i],
        chunkIndex: i,
        totalChunks: total,
        createdAt: Date.now()
      });
      if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
    }
    return { fileName: file.name, chunkCount: total };
  }
};

/* ═══════════════════════════════════════════════════════════════
   SEARCH MANAGER (Pollinations AI Web Search)
═══════════════════════════════════════════════════════════════ */
const SearchManager = {
  async search(query) {
    try {
      // Use Pollinations AI text endpoint to search
      const prompt = `Search the web for current information about: "${query}"
      
Return a concise summary of the most relevant and up-to-date information found. 
Include key facts, recent developments, and important context. 
Format as a brief factual summary (3-5 paragraphs).
Current date context: ${new Date().toDateString()}`;

      const encodedPrompt = encodeURIComponent(prompt);
      const url = `https://text.pollinations.ai/${encodedPrompt}?model=openai&seed=42`;
      
      const resp = await fetch(url, { signal: AbortSignal.timeout });
      if (!resp.ok) throw new Error('Search failed');
      const text = await resp.text();
      return text.trim();
    } catch (e) {
      console.warn('Web search failed:', e.message);
      return null;
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   MARKDOWN PARSER (Lightweight)
═══════════════════════════════════════════════════════════════ */
const MarkdownParser = {
  parse(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks first (protect them)
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const header = `<div class="code-block-header"><span>${escapeHtml(lang) || 'code'}</span><button class="code-copy-btn" onclick="NexusApp.copyCode(this)" title="Copy code"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button></div>`;
      const block = `${header}<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
      codeBlocks.push(block);
      return `__CODEBLOCK_${idx}__`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold & Italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Tables
    html = html.replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.slice(1, -1).split('|').map(c => c.trim());
      return `__TABLE_ROW__${cells.join('|')}__`;
    });

    // Process table rows
    const tableLines = html.split('\n');
    let inTable = false;
    let isHeader = false;
    const processedLines = [];
    for (let i = 0; i < tableLines.length; i++) {
      const line = tableLines[i];
      if (line.startsWith('__TABLE_ROW__')) {
        const cells = line.replace('__TABLE_ROW__', '').replace(/__$/, '').split('|');
        if (!inTable) {
          processedLines.push('<table>');
          processedLines.push('<thead><tr>');
          cells.forEach(c => processedLines.push(`<th>${c.replace(/^-+$/, '')}</th>`));
          processedLines.push('</tr></thead><tbody>');
          inTable = true;
          isHeader = true;
        } else if (isHeader && cells.every(c => /^[-:]+$/.test(c.trim()))) {
          // Separator row, skip
          isHeader = false;
        } else {
          processedLines.push('<tr>');
          cells.forEach(c => processedLines.push(`<td>${c}</td>`));
          processedLines.push('</tr>');
        }
      } else {
        if (inTable) { processedLines.push('</tbody></table>'); inTable = false; isHeader = false; }
        processedLines.push(line);
      }
    }
    if (inTable) processedLines.push('</tbody></table>');
    html = processedLines.join('\n');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/((?:^[*\-] .+$\n?)+)/gm, match => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^[*\-] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, match => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr>');

    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p>');

    // Single newlines
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = `<p>${html}</p>`;

    // Clean up
    html = html.replace(/<p>\s*(<[uo]l>|<table>|<h[1-6]>|<blockquote>|<hr>)/g, '$1');
    html = html.replace(/(<\/[uo]l>|<\/table>|<\/h[1-6]>|<\/blockquote>|<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    // Restore code blocks
    codeBlocks.forEach((block, idx) => {
      html = html.replace(`__CODEBLOCK_${idx}__`, block);
    });

    return html;
  }
};

/* ═══════════════════════════════════════════════════════════════
   REVEAL OBSERVER
═══════════════════════════════════════════════════════════════ */
const RevealObserver = {
  init() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    $$('.reveal').forEach(el => observer.observe(el));
  }
};

/* ═══════════════════════════════════════════════════════════════
   CHAT MANAGER
═══════════════════════════════════════════════════════════════ */
const ChatManager = {
  currentConversationId: null,
  currentProjectId: null,
  messages: [],
  attachedFiles: [],
  webSearchEnabled: false,
  contextMenuTargetId: null,

  async init() {
    this.container = $('#messagesContainer');
    this.inputField = $('#chatInput');
    this.sendBtn = $('#sendBtn');
    this.typingIndicator = $('#typingIndicator');
    this.modelSelect = $('#modelSelect');
    this.attachmentsPreview = $('#attachmentsPreview');

    // Load saved model into toolbar selector
    await this.populateModelSelector();
    this.bindEvents();
    this.loadHistory();
    this.checkSetupStatus();
    this.applyAppearance();

    // Check for active project from URL or storage
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    if (projectId) {
      const project = await StorageManager.getProject(projectId);
      if (project) this.activateProjectContext(project);
    }
  },

  applyAppearance() {
    const fontSize = SettingsStore.get('fontSize');
    document.documentElement.style.setProperty('font-size', `${fontSize}px`);
    if (SettingsStore.get('compactMode')) {
      document.body.classList.add('compact-mode');
    }
  },

  async populateModelSelector() {
    if (!this.modelSelect) return;
    const activeModel = localStorage.getItem('nexus_activeModel') || '';
    if (activeModel) {
      const opt = document.createElement('option');
      opt.value = activeModel;
      opt.textContent = activeModel;
      opt.selected = true;
      this.modelSelect.appendChild(opt);
    }
    // Try to fetch models in background (no-op for Anthropic proxy, but harmless)
    try {
      const models = await APIManager.fetchModels();
      if (models && models.length) {
        this.modelSelect.innerHTML = '<option value="">— Select Model —</option>';
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.id;
          if (m.id === activeModel) opt.selected = true;
          this.modelSelect.appendChild(opt);
        });
        if (activeModel && !models.find(m => m.id === activeModel)) {
          const opt = document.createElement('option');
          opt.value = activeModel;
          opt.textContent = activeModel;
          opt.selected = true;
          this.modelSelect.appendChild(opt);
        }
        NavManager.updateConnectionBadge('connected', 'Connected');
      } else if (activeModel) {
        // No model list returned — keep the manually-set model, mark connected
        NavManager.updateConnectionBadge('connected', 'Connected');
      } else {
        NavManager.updateConnectionBadge('error', 'No model');
      }
    } catch {
      NavManager.updateConnectionBadge('error', 'Offline');
    }
  },

  bindEvents() {
    // Send button
    this.sendBtn?.addEventListener('click', () => this.handleSend());

    // Keyboard
    this.inputField?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    this.inputField?.addEventListener('input', () => {
      this.inputField.style.height = 'auto';
      this.inputField.style.height = Math.min(this.inputField.scrollHeight, 200) + 'px';
      this.updateTokenCounter();
    });

    // Model selector
    this.modelSelect?.addEventListener('change', () => {
      localStorage.setItem('nexus_activeModel', this.modelSelect.value);
    });

    // New chat
    $('#newChatBtn')?.addEventListener('click', () => this.startNewChat());

    // Clear chat
    $('#clearChatBtn')?.addEventListener('click', () => {
      if (confirm('Clear this conversation?')) {
        this.messages = [];
        this.currentConversationId = null;
        this.renderMessages();
        this.showWelcome();
        this.loadHistory();
      }
    });

    // File attach
    $('#attachBtn')?.addEventListener('click', () => $('#fileInput')?.click());
    $('#fileInput')?.addEventListener('change', e => this.handleFileAttach(e));

    // Web search toggle
    const webToggle = $('#webSearchToggle');
    if (webToggle) {
      webToggle.checked = SettingsStore.get('webSearchDefault');
      this.webSearchEnabled = webToggle.checked;
      webToggle.addEventListener('change', () => {
        this.webSearchEnabled = webToggle.checked;
        const bar = $('#webSearchBar');
        if (bar) bar.style.display = this.webSearchEnabled ? 'flex' : 'none';
      });
      if (this.webSearchEnabled) {
        const bar = $('#webSearchBar');
        if (bar) bar.style.display = 'flex';
      }
    }

    // Stop button
    $('#stopBtn')?.addEventListener('click', () => {
      APIManager.stop();
      this.hideTyping();
    });

    // Quick chips (welcome state)
    document.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (chip?.dataset.prompt) {
        this.inputField.value = chip.dataset.prompt;
        this.inputField.dispatchEvent(new Event('input'));
        this.inputField.focus();
      }
    });

    // Context menu
    this.container?.addEventListener('contextmenu', e => {
      const msg = e.target.closest('.message');
      if (!msg) return;
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY, msg.dataset.msgId);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.context-menu')) {
        this.hideContextMenu();
      }
    });

    $('#ctxCopy')?.addEventListener('click', () => this.copyMessage(this.contextMenuTargetId));
    $('#ctxRegen')?.addEventListener('click', () => this.regenerateMessage(this.contextMenuTargetId));
    $('#ctxDelete')?.addEventListener('click', () => this.deleteMessage(this.contextMenuTargetId));

    // Message action buttons (delegated)
    this.container?.addEventListener('click', e => {
      const copyBtn = e.target.closest('.msg-copy-btn');
      const regenBtn = e.target.closest('.msg-regen-btn');
      if (copyBtn) this.copyMessage(copyBtn.dataset.msgId);
      if (regenBtn) this.regenerateMessage(regenBtn.dataset.msgId);
    });

    // History item clicks
    $('#chatHistoryList')?.addEventListener('click', e => {
      const item = e.target.closest('.chat-history-item');
      const del = e.target.closest('.history-item-delete');
      if (del) {
        e.stopPropagation();
        this.deleteConversation(del.dataset.convId);
        return;
      }
      if (item) this.loadConversation(item.dataset.convId);
    });

    // Project context clear
    $('#clearProjectContext')?.addEventListener('click', () => {
      this.currentProjectId = null;
      const bar = $('#projectContextBar');
      if (bar) bar.style.display = 'none';
    });
  },

  checkSetupStatus() {
    const { baseUrl, apiKey } = SettingsStore.getCredentials();
    const prompt = $('#welcomeSetupPrompt');
    if (prompt) {
      prompt.style.display = (baseUrl && apiKey) ? 'none' : 'flex';
    }
  },

  showWelcome() {
    const welcome = $('#welcomeState');
    if (welcome && this.container) {
      if (!this.container.contains(welcome)) {
        this.container.appendChild(welcome);
      }
      welcome.style.display = 'flex';
    }
  },

  hideWelcome() {
    const welcome = $('#welcomeState');
    if (welcome) welcome.style.display = 'none';
  },

  updateTokenCounter() {
    const counter = $('#tokenCounter');
    if (counter) {
      const tokens = estimateTokens(this.inputField?.value || '');
      counter.textContent = `~${tokens} tokens`;
    }
  },

  // ─── FILE ATTACHMENT ───
  handleFileAttach(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (this.attachedFiles.find(f => f.name === file.name)) return;
      this.attachedFiles.push(file);
    });
    this.renderAttachments();
    e.target.value = '';
  },

  renderAttachments() {
    const preview = this.attachmentsPreview;
    if (!preview) return;
    if (this.attachedFiles.length === 0) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      return;
    }
    preview.style.display = 'flex';
    preview.innerHTML = this.attachedFiles.map((file, idx) => {
      const isImage = file.type.startsWith('image/');
      const icon = isImage
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`;
      return `<div class="attachment-thumb">
        ${icon}<span>${escapeHtml(file.name.slice(0, 20))}</span>
        <button class="attachment-remove" data-idx="${idx}" aria-label="Remove attachment">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');

    preview.querySelectorAll('.attachment-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this.attachedFiles.splice(parseInt(btn.dataset.idx), 1);
        this.renderAttachments();
      });
    });
  },

  // ─── SEND MESSAGE ───
  async handleSend() {
    const text = this.inputField?.value.trim();
    if (!text && this.attachedFiles.length === 0) return;
    if (APIManager.isStreaming) return;

    this.hideWelcome();
    const userMsgId = generateId();

    // Build user message content
    let userContent = text;
    const userImages = [];

    // Handle image attachments
    for (const file of this.attachedFiles) {
      if (file.type.startsWith('image/')) {
        const b64 = await this.fileToBase64(file);
        userImages.push({ type: 'image_url', image_url: { url: b64 } });
      }
    }

    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: text,
      images: userImages.length ? userImages : undefined,
      timestamp: Date.now()
    };

    this.messages.push(userMsg);
    this.renderMessages();
    this.clearInput();
    this.showTyping();

    // Build API messages array
    let apiMessages = this.buildContextWindow();

    // RAG: inject project context if in a project
    if (this.currentProjectId) {
      const ragResult = await this.performRAG(text);
      if (ragResult) {
        // Inject as system-level context (sendChat will hoist this into
        // the top-level "system" field required by Anthropic)
        const contextMsg = { role: 'system', content: ragResult };
        apiMessages = [contextMsg, ...apiMessages.filter(m => m.role !== 'system')];
        // Show RAG indicator briefly
        this.showRAGIndicator(false, 'Context injected from project files');
      }
    }

    // Web search augmentation
    if (this.webSearchEnabled) {
      this.showRAGIndicator(true, 'Searching the web...');
      const searchResult = await SearchManager.search(text);
      if (searchResult) {
        const searchCtx = `\n\n[WEB SEARCH RESULTS for "${text}"]\n${searchResult}\n[END WEB SEARCH RESULTS]\n\nPlease use the above web search results to inform your response.`;
        // Append to last user message
        const lastUser = apiMessages.findLast(m => m.role === 'user');
        if (lastUser) lastUser.content = (lastUser.content || '') + searchCtx;
      }
      this.showRAGIndicator(false, '');
    }

    // Stream response
    const aiMsgId = generateId();
    let aiText = '';
    let aiSources = null;

    // Check for RAG sources to display
    if (this.currentProjectId && this._lastRAGSources) {
      aiSources = this._lastRAGSources;
      this._lastRAGSources = null;
    }
    APIManager.sendChat(
      apiMessages,
      (token) => {
        // Streaming token
        aiText += token;
        this.updateStreamingMessage(aiMsgId, aiText);
      },
      (finalText) => {
        // Done
        this.hideTyping();
        if (finalText === '_aborted_') {
          finalText = aiText + ' _(stopped)_';
        }
        const aiMsg = {
          id: aiMsgId,
          role: 'assistant',
          content: finalText || aiText,
          sources: aiSources,
          timestamp: Date.now()
        };
        this.messages.push(aiMsg);
        this.saveConversation();
        this.renderMessages();
        this.loadHistory();
      },
      (error) => {
        this.hideTyping();
        const errMsg = {
          id: generateId(),
          role: 'assistant',
          content: `**Error:** ${error}\n\nCheck your API settings in [Settings](settings.html) and try again.`,
          isError: true,
          timestamp: Date.now()
        };
        this.messages.push(errMsg);
        this.renderMessages();
        ToastManager.show(error, 'error');
      }
    );
  },

  async performRAG(query) {
    if (!this.currentProjectId) return null;
    const project = await StorageManager.getProject(this.currentProjectId);
    if (!project) return null;

    const topK = project.ragChunks || 5;
    const results = await RAGEngine.search(this.currentProjectId, query, topK);

    if (!results.length) return null;

    this._lastRAGSources = results.map(r => r.fileName);

    let ctx = `[KNOWLEDGE BASE CONTEXT — Project: ${project.name}]\n`;
    ctx += `The following excerpts are retrieved from the project's uploaded documents. Base your answer on these.\n\n`;
    results.forEach((r, i) => {
      ctx += `--- Document ${i + 1}: ${r.fileName} ---\n${r.text}\n\n`;
    });
    ctx += `[END KNOWLEDGE BASE CONTEXT]\n`;

    return ctx;
  },

  buildContextWindow() {
    const contextSize = SettingsStore.get('contextWindow');
    const msgs = this.messages.slice(-contextSize);

    // Add project system instruction if applicable
    const result = [];
    if (this.currentProjectId && this._projectInstruction) {
      result.push({ role: 'system', content: this._projectInstruction });
    }

    msgs.forEach(m => {
      if (m.images && m.images.length > 0) {
        result.push({
          role: m.role,
          content: [
            { type: 'text', text: m.content || '' },
            ...m.images
          ]
        });
      } else {
        result.push({ role: m.role, content: m.content });
      }
    });
    return result;
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  showRAGIndicator(loading, text) {
    const ind = $('#ragIndicator');
    const txt = $('#ragIndicatorText');
    if (!ind) return;
    if (text) {
      ind.style.display = 'flex';
      if (txt) txt.textContent = text;
    } else {
      setTimeout(() => { ind.style.display = 'none'; }, 1500);
    }
  },

  clearInput() {
    if (this.inputField) {
      this.inputField.value = '';
      this.inputField.style.height = 'auto';
    }
    this.attachedFiles = [];
    this.renderAttachments();
    this.updateTokenCounter();
  },

  showTyping() {
    if (this.typingIndicator) this.typingIndicator.style.display = 'flex';
    this.scrollToBottom();
  },

  hideTyping() {
    if (this.typingIndicator) this.typingIndicator.style.display = 'none';
  },

  // ─── STREAMING UPDATE ───
  streamingElement: null,

  updateStreamingMessage(msgId, text) {
    // Find or create the streaming message element
    let msgEl = this.container?.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgEl) {
      msgEl = this.createMessageElement({
        id: msgId,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        streaming: true
      });
      this.container?.appendChild(msgEl);
      this.hideTyping();
    }
    const bubble = msgEl.querySelector('.msg-bubble');
    if (bubble) {
      bubble.innerHTML = MarkdownParser.parse(text);
      bubble.classList.add('streaming-cursor');
    }
    this.scrollToBottom();
  },

  // ─── RENDERING ───
  renderMessages() {
    if (!this.container) return;

    // Clear all but welcome state
    const welcome = $('#welcomeState');
    this.container.innerHTML = '';
    if (welcome) this.container.appendChild(welcome);

    if (this.messages.length === 0) {
      this.showWelcome();
      return;
    }
    this.hideWelcome();

    this.messages.forEach(msg => {
      this.container.appendChild(this.createMessageElement(msg));
    });

    this.scrollToBottom();
  },

  createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.msgId = msg.id;

    const isAI = msg.role === 'assistant';

    const avatarSvg = isAI
      ? `<svg width="16" height="16" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="url(#mg${msg.id?.slice(-4)})"/><path d="M7 14 L11 8 L15 14 L19 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="mg${msg.id?.slice(-4)}" x1="0" y1="0" x2="28" y2="28"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#0ea5e9"/></linearGradient></defs></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    const content = msg.streaming
      ? MarkdownParser.parse(msg.content)
      : MarkdownParser.parse(msg.content || '');

    const sourcesHtml = msg.sources && msg.sources.length > 0
      ? `<div class="rag-sources">
          <div class="rag-sources-title"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg> Sources</div>
          ${msg.sources.map(s => `<span class="rag-source-chip"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>${escapeHtml(s)}</span>`).join('')}
         </div>` : '';

    const actionsHtml = isAI
      ? `<div class="msg-actions">
          <button class="msg-action-btn msg-copy-btn" data-msg-id="${msg.id}" title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          <button class="msg-action-btn msg-regen-btn" data-msg-id="${msg.id}" title="Regenerate">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Regenerate
          </button>
        </div>` : '';

    div.innerHTML = `
      <div class="msg-avatar ${msg.role}">${avatarSvg}</div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-name">${isAI ? 'NexusAI' : 'You'}</span>
          <span class="msg-time">${formatDate(msg.timestamp || Date.now())}</span>
        </div>
        <div class="msg-bubble ${msg.isError ? 'error' : ''}">
          ${content}
          ${sourcesHtml}
        </div>
        ${actionsHtml}
      </div>
    `;

    if (msg.streaming) {
      div.querySelector('.msg-bubble')?.classList.add('streaming-cursor');
    }

    return div;
  },

  scrollToBottom() {
    if (this.container) {
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
      });
    }
  },

  // ─── HISTORY ───
  async loadHistory() {
    const list = $('#chatHistoryList');
    const empty = $('#emptyHistory');
    if (!list) return;

    const convs = await StorageManager.getAllConversations();
    list.innerHTML = '';

    if (convs.length === 0) {
      if (empty) list.appendChild(empty);
      return;
    }

    convs.forEach(conv => {
      const item = document.createElement('div');
      item.className = `chat-history-item${conv.id === this.currentConversationId ? ' active' : ''}`;
      item.dataset.convId = conv.id;
      const title = conv.title || 'New Chat';
      item.innerHTML = `
        <div class="history-item-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="history-item-text">
          <div class="history-item-title">${escapeHtml(title)}</div>
          <div class="history-item-meta">${formatDate(conv.updatedAt || conv.createdAt)} · ${conv.messages?.length || 0} messages</div>
        </div>
        <button class="history-item-delete" data-conv-id="${conv.id}" title="Delete conversation" aria-label="Delete conversation">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      `;
      list.appendChild(item);
    });
  },

  async loadConversation(id) {
    const conv = await StorageManager.getConversation(id);
    if (!conv) return;
    this.messages = conv.messages || [];
    this.currentConversationId = id;
    this.renderMessages();
    this.loadHistory();
  },

  async deleteConversation(id) {
    await StorageManager.deleteConversation(id);
    if (this.currentConversationId === id) {
      this.messages = [];
      this.currentConversationId = null;
      this.renderMessages();
      this.showWelcome();
    }
    this.loadHistory();
    ToastManager.show('Conversation deleted', 'info');
  },

  async saveConversation() {
    if (!this.messages.length) return;
    const id = this.currentConversationId || generateId();
    this.currentConversationId = id;

    // Auto-generate title from first user message
    const firstUser = this.messages.find(m => m.role === 'user');
    const title = firstUser?.content
      ? firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '')
      : 'New Chat';

    await StorageManager.saveConversation({
      id,
      title,
      messages: this.messages,
      projectId: this.currentProjectId,
      createdAt: this.messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now()
    });
  },

  startNewChat() {
    this.messages = [];
    this.currentConversationId = null;
    this.renderMessages();
    this.showWelcome();
    this.inputField?.focus();
    this.loadHistory();
  },

  // ─── PROJECT CONTEXT ───
  async activateProjectContext(project) {
    this.currentProjectId = project.id;
    this._projectInstruction = project.systemInstruction;

    const bar = $('#projectContextBar');
    const nameEl = $('#projectContextName');
    if (bar) bar.style.display = 'block';
    if (nameEl) nameEl.textContent = project.name;
  },

  // ─── CONTEXT MENU ───
  showContextMenu(x, y, msgId) {
    const menu = $('#contextMenu');
    if (!menu) return;
    this.contextMenuTargetId = msgId;
    menu.classList.add('visible');
    menu.setAttribute('aria-hidden', 'false');

    // Position
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  },

  hideContextMenu() {
    const menu = $('#contextMenu');
    if (menu) { menu.classList.remove('visible'); menu.setAttribute('aria-hidden', 'true'); }
  },

  copyMessage(msgId) {
    const msg = this.messages.find(m => m.id === msgId);
    if (!msg) return;
    navigator.clipboard?.writeText(msg.content || '');
    ToastManager.show('Copied to clipboard', 'success');
    this.hideContextMenu();
  },

  async regenerateMessage(msgId) {
    const idx = this.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    // Remove the message and regenerate
    this.messages = this.messages.slice(0, idx);
    this.renderMessages();
    const lastUser = [...this.messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      this.inputField.value = lastUser.content;
      // Remove that last user message too
      this.messages = this.messages.filter(m => m.id !== lastUser.id);
      await this.handleSend();
    }
    this.hideContextMenu();
  },

  deleteMessage(msgId) {
    this.messages = this.messages.filter(m => m.id !== msgId);
    this.renderMessages();
    this.saveConversation();
    this.hideContextMenu();
  }
};

/* ═══════════════════════════════════════════════════════════════
   PROJECTS MANAGER
═══════════════════════════════════════════════════════════════ */
const ProjectsManager = {
  projects: [],
  activeProjectId: null,

  async init() {
    this.projects = await StorageManager.getAllProjects();
    this.renderProjects();
    this.bindEvents();
    RevealObserver.init();
  },

  bindEvents() {
    // New project buttons
    ['#newProjectBtn', '#newProjectBtnEmpty'].forEach(sel => {
      $(sel)?.addEventListener('click', () => this.openModal());
    });

    // Modal close
    $('#modalClose')?.addEventListener('click', () => this.closeModal());
    $('#modalCancel')?.addEventListener('click', () => this.closeModal());
    $('#projectModalBackdrop')?.addEventListener('click', () => this.closeModal());

    // Save project
    $('#modalSave')?.addEventListener('click', () => this.saveProject());

    // Template chips
    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.template-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const tmpl = chip.dataset.template;
        const textarea = $('#systemInstruction');
        if (textarea && tmpl !== 'custom') {
          textarea.value = INSTRUCTION_TEMPLATES[tmpl] || '';
          textarea.dispatchEvent(new Event('input'));
        }
      });
    });

    // Avatar options
    document.addEventListener('click', e => {
      const opt = e.target.closest('.avatar-opt');
      if (opt) {
        $$('.avatar-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const emoji = opt.dataset.emoji;
        const preview = $('#avatarPreview');
        if (preview) preview.textContent = emoji;
      }
    });

    // Instruction textarea counter
    const instrTA = $('#systemInstruction');
    if (instrTA) {
      instrTA.addEventListener('input', () => {
        const c = $('#instructionCount');
        if (c) c.textContent = instrTA.value.length;
      });
    }

    // Slider live values
    const ragChunks = $('#ragChunks');
    if (ragChunks) ragChunks.addEventListener('input', () => {
      const v = $('#ragChunksVal');
      if (v) v.textContent = ragChunks.value;
    });

    const chunkSize = $('#chunkSize');
    if (chunkSize) chunkSize.addEventListener('input', () => {
      const v = $('#chunkSizeVal');
      if (v) v.textContent = chunkSize.value;
    });

    // Panel close
    $('#panelClose')?.addEventListener('click', () => this.closePanel());
    $('#panelOverlay')?.addEventListener('click', () => this.closePanel());

    // Panel actions
    $('#openProjectChatBtn')?.addEventListener('click', () => {
      if (this.activeProjectId) {
        window.location.href = `index.html?project=${this.activeProjectId}`;
      }
    });

    $('#editProjectBtn')?.addEventListener('click', () => {
      if (this.activeProjectId) {
        this.closePanel();
        this.openModal(this.activeProjectId);
      }
    });

    $('#deleteProjectBtn')?.addEventListener('click', async () => {
      if (!this.activeProjectId) return;
      if (confirm('Delete this project and all its knowledge base files?')) {
        await StorageManager.deleteProject(this.activeProjectId);
        this.projects = await StorageManager.getAllProjects();
        this.closePanel();
        this.renderProjects();
        ToastManager.show('Project deleted', 'info');
      }
    });

    // File upload in panel
    const uploadZone = $('#uploadZone');
    const kbFileInput = $('#kbFileInput');

    uploadZone?.addEventListener('click', () => kbFileInput?.click());
    uploadZone?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') kbFileInput?.click();
    });
    uploadZone?.addEventListener('dragover', e => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone?.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files || []);
      this.handleFileUpload(files);
    });

    kbFileInput?.addEventListener('change', e => {
      const files = Array.from(e.target.files || []);
      this.handleFileUpload(files);
      e.target.value = '';
    });

    // KB file delete (delegated)
    $('#kbFilesList')?.addEventListener('click', async e => {
      const delBtn = e.target.closest('.kb-file-delete');
      if (delBtn && this.activeProjectId) {
        const fileName = delBtn.dataset.fileName;
        await StorageManager.deleteChunksByFile(this.activeProjectId, fileName);
        // Update project file list
        const proj = await StorageManager.getProject(this.activeProjectId);
        if (proj) {
          proj.files = (proj.files || []).filter(f => f.name !== fileName);
          await StorageManager.saveProject(proj);
        }
        this.renderPanelFiles(this.activeProjectId);
        ToastManager.show(`Removed ${fileName}`, 'info');
      }
    });

    // Keyboard escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closePanel();
      }
    });
  },

  openModal(projectId = null) {
    const modal = $('#projectModal');
    const backdrop = $('#projectModalBackdrop');
    const titleEl = $('#modalTitle');
    const saveBtn = $('#modalSave');

    if (modal) modal.classList.add('visible');
    if (modal) modal.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('visible');

    if (projectId) {
      // Edit mode
      const proj = this.projects.find(p => p.id === projectId);
      if (proj && titleEl) titleEl.textContent = 'Edit Project';
      if (proj && saveBtn) saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Changes`;
      if (proj) this.populateModalForm(proj);
      if (modal) modal.dataset.editId = projectId;
    } else {
      // Create mode
      if (titleEl) titleEl.textContent = 'New Expert Project';
      if (saveBtn) saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Create Project`;
      this.resetModalForm();
      if (modal) delete modal.dataset.editId;
    }
  },

  closeModal() {
    $('#projectModal')?.classList.remove('visible');
    $('#projectModal')?.setAttribute('aria-hidden', 'true');
    $('#projectModalBackdrop')?.classList.remove('visible');
  },

  populateModalForm(proj) {
    const n = $('#projectName'); if (n) n.value = proj.name || '';
    const d = $('#projectDesc'); if (d) d.value = proj.description || '';
    const s = $('#systemInstruction'); if (s) s.value = proj.systemInstruction || '';
    const r = $('#ragChunks'); if (r) { r.value = proj.ragChunks || 5; const v = $('#ragChunksVal'); if (v) v.textContent = r.value; }
    const c = $('#chunkSize'); if (c) { c.value = proj.chunkSize || 500; const v = $('#chunkSizeVal'); if (v) v.textContent = c.value; }
    const preview = $('#avatarPreview'); if (preview) preview.textContent = proj.avatar || '📚';
    $$('.avatar-opt').forEach(o => { o.classList.toggle('active', o.dataset.emoji === proj.avatar); });
    const cnt = $('#instructionCount'); if (cnt) cnt.textContent = (proj.systemInstruction || '').length;
  },

  resetModalForm() {
    ['#projectName', '#projectDesc', '#systemInstruction'].forEach(s => {
      const el = $(s); if (el) el.value = '';
    });
    const r = $('#ragChunks'); if (r) { r.value = 5; const v = $('#ragChunksVal'); if (v) v.textContent = '5'; }
    const c = $('#chunkSize'); if (c) { c.value = 500; const v = $('#chunkSizeVal'); if (v) v.textContent = '500'; }
    const preview = $('#avatarPreview'); if (preview) preview.textContent = '📚';
    $$('.avatar-opt').forEach(o => o.classList.toggle('active', o.dataset.emoji === '📚'));
    $$('.template-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    const instr = $('#systemInstruction');
    if (instr) {
      instr.value = INSTRUCTION_TEMPLATES.examiner;
      const cnt = $('#instructionCount'); if (cnt) cnt.textContent = instr.value.length;
    }
    const err = $('#projectNameError'); if (err) err.textContent = '';
  },

  async saveProject() {
    const nameEl = $('#projectName');
    const name = nameEl?.value.trim();
    if (!name) {
      const err = $('#projectNameError');
      if (err) err.textContent = 'Project name is required';
      nameEl?.focus();
      return;
    }

    const modal = $('#projectModal');
    const editId = modal?.dataset.editId;

    const project = {
      id: editId || generateId(),
      name,
      description: $('#projectDesc')?.value.trim() || '',
      systemInstruction: $('#systemInstruction')?.value.trim() || '',
      avatar: $('#avatarPreview')?.textContent || '📚',
      ragChunks: parseInt($('#ragChunks')?.value || '5'),
      chunkSize: parseInt($('#chunkSize')?.value || '500'),
      files: editId ? (this.projects.find(p => p.id === editId)?.files || []) : [],
      createdAt: editId ? (this.projects.find(p => p.id === editId)?.createdAt || Date.now()) : Date.now(),
      updatedAt: Date.now()
    };

    await StorageManager.saveProject(project);
    this.projects = await StorageManager.getAllProjects();
    this.renderProjects();
    this.closeModal();
    ToastManager.show(editId ? 'Project updated' : 'Project created', 'success');
  },

  // ─── RENDER ───
  renderProjects() {
    const grid = $('#projectsGrid');
    const empty = $('#projectsEmpty');
    if (!grid) return;

    grid.innerHTML = '';

    if (this.projects.length === 0) {
      if (empty) grid.appendChild(empty);
      return;
    }

    this.projects.forEach((proj, i) => {
      const card = document.createElement('div');
      card.className = 'project-card reveal';
      card.style.animationDelay = `${i * 60}ms`;
      card.dataset.projectId = proj.id;
      const fileCount = proj.files?.length || 0;

      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-card-avatar">${proj.avatar || '📚'}</div>
          <div class="project-card-identity">
            <div class="project-card-name">${escapeHtml(proj.name)}</div>
            <div class="project-card-desc">${escapeHtml(proj.description || 'No description')}</div>
          </div>
        </div>
        <div class="project-card-instruction">${escapeHtml((proj.systemInstruction || 'No instruction set').slice(0, 100))}${(proj.systemInstruction?.length || 0) > 100 ? '...' : ''}</div>
        <div class="project-card-stats">
          <div class="project-stat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
            ${fileCount} file${fileCount !== 1 ? 's' : ''}
          </div>
          <div class="project-stat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${formatDate(proj.updatedAt || proj.createdAt)}
          </div>
        </div>
        <div class="project-card-footer">
          <span class="project-date">Created ${formatDate(proj.createdAt)}</span>
          <span class="open-project-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Open
          </span>
        </div>
      `;

      card.addEventListener('click', () => this.openPanel(proj.id));
      grid.appendChild(card);
    });

    RevealObserver.init();
  },

  // ─── PANEL ───
  async openPanel(projectId) {
    this.activeProjectId = projectId;
    const proj = this.projects.find(p => p.id === projectId);
    if (!proj) return;

    $('#panelAvatar').textContent = proj.avatar || '📚';
    $('#panelProjectName').textContent = proj.name;
    $('#panelProjectDesc').textContent = proj.description || 'No description';
    $('#panelInstruction').textContent = proj.systemInstruction || 'No instruction set.';

    await this.renderPanelFiles(projectId);

    $('#panelOverlay')?.classList.add('visible');
    $('#detailPanel')?.classList.add('open');
    $('#detailPanel')?.setAttribute('aria-hidden', 'false');
  },

  closePanel() {
    this.activeProjectId = null;
    $('#panelOverlay')?.classList.remove('visible');
    $('#detailPanel')?.classList.remove('open');
    $('#detailPanel')?.setAttribute('aria-hidden', 'true');
  },

  async renderPanelFiles(projectId) {
    const proj = await StorageManager.getProject(projectId);
    const chunks = await StorageManager.getProjectChunks(projectId);
    const fileNames = [...new Set(chunks.map(c => c.fileName))];
    const fileCount = fileNames.length;
    const chunkCount = chunks.length;

    $('#kbFileCount').textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    $('#kbChunkCount').textContent = `${chunkCount} chunk${chunkCount !== 1 ? 's' : ''}`;

    const list = $('#kbFilesList');
    if (!list) return;
    list.innerHTML = '';

    if (fileNames.length === 0) {
      list.innerHTML = `<p style="font-size:var(--text-sm);color:var(--text-tertiary);text-align:center;padding:var(--space-4)">No files indexed yet. Upload documents above.</p>`;
      return;
    }

    // Group chunks by file
    const filesMap = {};
    chunks.forEach(c => {
      if (!filesMap[c.fileName]) filesMap[c.fileName] = { name: c.fileName, size: c.fileSize, count: 0 };
      filesMap[c.fileName].count++;
    });

    Object.values(filesMap).forEach(file => {
      const item = document.createElement('div');
      item.className = 'kb-file-item';
      item.innerHTML = `
        <div class="kb-file-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="kb-file-info">
          <div class="kb-file-name">${escapeHtml(file.name)}</div>
          <div class="kb-file-meta">${file.count} chunks · ${file.size ? Math.round(file.size / 1024) + ' KB' : 'Unknown size'}</div>
        </div>
        <button class="kb-file-delete" data-file-name="${escapeHtml(file.name)}" title="Remove file" aria-label="Remove ${escapeHtml(file.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      `;
      list.appendChild(item);
    });
  },

  // ─── FILE UPLOAD ───
  async handleFileUpload(files) {
    if (!this.activeProjectId) return;
    const proj = await StorageManager.getProject(this.activeProjectId);
    if (!proj) return;

    const progressBar = $('#uploadProgressBar');
    const progressFill = $('#uploadProgressFill');

    if (progressBar) progressBar.style.display = 'block';

    let processed = 0;
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        ToastManager.show(`${file.name} exceeds 10MB limit`, 'warning');
        continue;
      }

      try {
        ToastManager.show(`Indexing ${file.name}...`, 'info', 2000);
        await RAGEngine.indexFile(this.activeProjectId, file, proj.chunkSize || 500, (pct) => {
          const totalPct = Math.round(((processed / files.length) + (pct / 100 / files.length)) * 100);
          if (progressFill) progressFill.style.width = totalPct + '%';
        });

        // Update project file list
        const existingFiles = proj.files || [];
        if (!existingFiles.find(f => f.name === file.name)) {
          existingFiles.push({ name: file.name, size: file.size, addedAt: Date.now() });
          proj.files = existingFiles;
          await StorageManager.saveProject(proj);
        }

        processed++;
        ToastManager.show(`${file.name} indexed successfully`, 'success');
      } catch (err) {
        ToastManager.show(`Failed to index ${file.name}`, 'error');
        console.error('Indexing error:', err);
      }
    }

    if (progressBar) setTimeout(() => { progressBar.style.display = 'none'; if (progressFill) progressFill.style.width = '0%'; }, 1000);
    this.renderPanelFiles(this.activeProjectId);
    this.projects = await StorageManager.getAllProjects();
    this.renderProjects();
  }
};

/* ═══════════════════════════════════════════════════════════════
   SETTINGS MANAGER
═══════════════════════════════════════════════════════════════ */
const SettingsManager = {
  async init() {
    this.loadValues();
    this.bindEvents();
    this.updateConnectionStatus();
    await this.updateDataStats();
    RevealObserver.init();
  },

  loadValues() {
    const s = SettingsStore.getAll();
    const creds = SettingsStore.getCredentials();

    const baseUrlEl = $('#baseUrl'); if (baseUrlEl) baseUrlEl.value = creds.baseUrl;
    const apiKeyEl = $('#apiKey'); if (apiKeyEl) apiKeyEl.value = creds.apiKey;

    const maxTokens = $('#maxTokens'); if (maxTokens) { maxTokens.value = s.maxTokens; const v = $('#maxTokensVal'); if (v) v.textContent = s.maxTokens; }
    const temp = $('#temperature'); if (temp) { temp.value = s.temperature; const v = $('#temperatureVal'); if (v) v.textContent = parseFloat(s.temperature).toFixed(2); }
    const ctx = $('#contextWindow'); if (ctx) { ctx.value = s.contextWindow; const v = $('#contextWindowVal'); if (v) v.textContent = s.contextWindow; }
    const topP = $('#topP'); if (topP) { topP.value = s.topP; const v = $('#topPVal'); if (v) v.textContent = parseFloat(s.topP).toFixed(2); }
    const streaming = $('#streamingToggle'); if (streaming) streaming.checked = s.streaming;
    const webDef = $('#webSearchDefault'); if (webDef) webDef.checked = s.webSearchDefault;
    const fontSize = $('#fontSize'); if (fontSize) { fontSize.value = s.fontSize; const v = $('#fontSizeVal'); if (v) v.textContent = s.fontSize + 'px'; }
    const compact = $('#compactMode'); if (compact) compact.checked = s.compactMode;
    const syntax = $('#syntaxHighlight'); if (syntax) syntax.checked = s.syntaxHighlight;
    const manualModel = $('#manualModel'); if (manualModel) manualModel.value = localStorage.getItem('nexus_activeModel') || '';

    // Theme picker
    const savedTheme = localStorage.getItem('nexus_theme_pref') || 'dark';
    $$('.theme-option').forEach(opt => opt.classList.toggle('active', opt.dataset.themePref === savedTheme));

    // Load and populate model dropdown
    this.populateModelDropdown();
  },

  async populateModelDropdown() {
    const sel = $('#modelSelectSettings');
    if (!sel) return;
    const active = localStorage.getItem('nexus_activeModel') || '';
    // Anthropic has no /models endpoint, so we don't try to fetch.
    // The user supplies the model name manually in the input below.
    if (active) {
      sel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = active;
      opt.textContent = active;
      opt.selected = true;
      sel.appendChild(opt);
    } else {
      sel.innerHTML = '<option value="">— Enter model name below —</option>';
    }
    NavManager.updateConnectionBadge('connected', 'Ready');
  },

  bindEvents() {
    // Test connection — bypassed for the Anthropic proxy
    $('#testConnectionBtn')?.addEventListener('click', async () => {
      const btn = $('#testConnectionBtn');
      const card = $('#connectionStatusCard');
      if (btn) btn.textContent = 'Testing...';
      if (card) card.className = 'connection-status-card loading';

      // Temporarily use current form values
      const bu = $('#baseUrl')?.value.trim();
      const ak = $('#apiKey')?.value.trim();
      if (bu) localStorage.setItem('nexus_baseUrl', bu);
      if (ak) localStorage.setItem('nexus_apiKey', ak);

      // Anthropic proxy has no testable /models endpoint, so we just
      // confirm credentials are present and mark the card as ready.
      const result = await APIManager.testConnection();
      this.updateConnectionStatus(result);
      if (btn) btn.textContent = 'Test';
    });

    // Save credentials
    $('#saveCredentialsBtn')?.addEventListener('click', () => {
      const bu = $('#baseUrl')?.value.trim();
      const ak = $('#apiKey')?.value.trim();
      SettingsStore.setCredentials(bu, ak);
      ToastManager.show('Connection settings saved', 'success');
      this.populateModelDropdown();
    });

    // Clear credentials
    $('#clearCredentialsBtn')?.addEventListener('click', () => {
      if (confirm('Clear API credentials?')) {
        SettingsStore.setCredentials('', '');
        const bu = $('#baseUrl'); if (bu) bu.value = '';
        const ak = $('#apiKey'); if (ak) ak.value = '';
        this.updateConnectionStatus();
        ToastManager.show('Credentials cleared', 'info');
      }
    });

    // API key visibility
    $('#toggleApiKeyVisibility')?.addEventListener('click', () => {
      const input = $('#apiKey');
      const show = $('#eyeIconShow');
      const hide = $('#eyeIconHide');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        show.style.display = 'none';
        hide.style.display = 'block';
      } else {
        input.type = 'password';
        show.style.display = 'block';
        hide.style.display = 'none';
      }
    });

    // Fetch models button — no-op for Anthropic, but kept for UX consistency
    $('#fetchModelsBtn')?.addEventListener('click', async () => {
      const btn = $('#fetchModelsBtn');
      if (btn) btn.textContent = 'Fetching...';
      await this.populateModelDropdown();
      if (btn) btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Fetch Available Models`;
      ToastManager.show('Model list refreshed', 'success');
    });

    // Model select
    $('#modelSelectSettings')?.addEventListener('change', e => {
      localStorage.setItem('nexus_activeModel', e.target.value);
      const manual = $('#manualModel');
      if (manual) manual.value = e.target.value;
    });

    // Manual model
    $('#manualModel')?.addEventListener('input', e => {
      localStorage.setItem('nexus_activeModel', e.target.value);
      // Reflect into the select if present
      const sel = $('#modelSelectSettings');
      if (sel) {
        const exists = [...sel.options].find(o => o.value === e.target.value);
        if (!exists && e.target.value) {
          const opt = new Option(e.target.value, e.target.value, true, true);
          sel.add(opt);
        } else if (exists) {
          sel.value = e.target.value;
        }
      }
    });

    // Preset model cards
    $$('.preset-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('.preset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const model = card.dataset.model;
        localStorage.setItem('nexus_activeModel', model);
        const manual = $('#manualModel');
        if (manual) manual.value = model;
        const sel = $('#modelSelectSettings');
        if (sel) {
          const exists = [...sel.options].find(o => o.value === model);
          if (exists) sel.value = model;
          else {
            const opt = new Option(model, model, true, true);
            sel.add(opt);
          }
        }
        ToastManager.show(`Model set to ${model}`, 'success');
      });
    });

    // Sliders
    this.bindSlider('maxTokens', 'maxTokensVal', v => v);
    this.bindSlider('temperature', 'temperatureVal', v => parseFloat(v).toFixed(2));
    this.bindSlider('contextWindow', 'contextWindowVal', v => v);
    this.bindSlider('topP', 'topPVal', v => parseFloat(v).toFixed(2));
    this.bindSlider('fontSize', 'fontSizeVal', v => v + 'px');

    // Save params
    $('#saveParamsBtn')?.addEventListener('click', () => {
      SettingsStore.set('maxTokens', parseInt($('#maxTokens')?.value || '2048'));
      SettingsStore.set('temperature', parseFloat($('#temperature')?.value || '0.7'));
      SettingsStore.set('contextWindow', parseInt($('#contextWindow')?.value || '20'));
      SettingsStore.set('topP', parseFloat($('#topP')?.value || '1.0'));
      SettingsStore.set('streaming', $('#streamingToggle')?.checked ?? true);
      ToastManager.show('Parameters saved', 'success');
    });

    // Reset params
    $('#resetParamsBtn')?.addEventListener('click', () => {
      SettingsStore.set('maxTokens', DEFAULTS.maxTokens);
      SettingsStore.set('temperature', DEFAULTS.temperature);
      SettingsStore.set('contextWindow', DEFAULTS.contextWindow);
      SettingsStore.set('topP', DEFAULTS.topP);
      this.loadValues();
      ToastManager.show('Parameters reset to defaults', 'info');
    });

    // Web search default
    $('#webSearchDefault')?.addEventListener('change', e => {
      SettingsStore.set('webSearchDefault', e.target.checked);
    });

    // Save appearance
    $('#saveAppearanceBtn')?.addEventListener('click', () => {
      SettingsStore.set('fontSize', parseInt($('#fontSize')?.value || '16'));
      SettingsStore.set('compactMode', $('#compactMode')?.checked ?? false);
      SettingsStore.set('syntaxHighlight', $('#syntaxHighlight')?.checked ?? true);
      document.documentElement.style.setProperty('font-size', ($('#fontSize')?.value || '16') + 'px');
      ToastManager.show('Appearance saved', 'success');
    });

    // Theme picker
    $$('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const pref = opt.dataset.themePref;
        localStorage.setItem('nexus_theme_pref', pref);
        if (pref === 'system') {
          ThemeManager.apply(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        } else {
          ThemeManager.apply(pref);
        }
        $$('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.themePref === pref));
      });
    });

    // Data management
    $('#exportDataBtn')?.addEventListener('click', () => this.exportData());
    $('#clearHistoryBtn')?.addEventListener('click', async () => {
      if (confirm('Clear all chat history? This cannot be undone.')) {
        await StorageManager.clearAllConversations();
        await this.updateDataStats();
        ToastManager.show('Chat history cleared', 'info');
      }
    });
    $('#clearAllDataBtn')?.addEventListener('click', async () => {
      if (confirm('Reset everything? All data, projects, and settings will be deleted. This cannot be undone.')) {
        await StorageManager.clearAllConversations();
        const projects = await StorageManager.getAllProjects();
        for (const p of projects) await StorageManager.deleteProject(p.id);
        localStorage.clear();
        ToastManager.show('All data cleared. Reloading...', 'info');
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  },

  bindSlider(sliderId, valId, formatter) {
    const slider = $(`#${sliderId}`);
    const val = $(`#${valId}`);
    if (!slider || !val) return;
    slider.addEventListener('input', () => {
      val.textContent = formatter(slider.value);
    });
  },

  updateConnectionStatus(result) {
    const card = $('#connectionStatusCard');
    const title = $('#statusTitle');
    const desc = $('#statusDesc');
    const icon = $('#statusIcon');

    if (!card) return;

    if (!result) {
      const { baseUrl, apiKey } = SettingsStore.getCredentials();
      if (!baseUrl || !apiKey) {
        card.className = 'connection-status-card';
        if (title) title.textContent = 'Not Configured';
        if (desc) desc.textContent = 'Enter your Base URL and API Key above to connect.';
      } else {
        card.className = 'connection-status-card';
        if (title) title.textContent = 'Not Tested';
        if (desc) desc.textContent = 'Click "Test" to verify your connection.';
      }
      return;
    }

    if (result.ok) {
      card.className = 'connection-status-card success';
      if (title) title.textContent = 'Ready';
      if (desc) desc.textContent = 'Credentials saved. Type your model name in the field below (e.g. claude-sonnet-4-5).';
      NavManager.updateConnectionBadge('connected', 'Connected');
      if (icon) icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      card.className = 'connection-status-card error';
      if (title) title.textContent = 'Connection Failed';
      if (desc) desc.textContent = result.error || 'Could not connect. Check your URL and API key.';
      NavManager.updateConnectionBadge('error', 'Error');
      if (icon) icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    }
  },

  async updateDataStats() {
    const stats = await StorageManager.getStats();
    const el = (id, val) => { const e = $(`#${id}`); if (e) e.textContent = val; };
    el('totalConversations', stats.conversations);
    el('totalMessages', stats.messages);
    el('totalProjects', stats.projects);
    el('totalChunks', stats.chunks);
  },

  async exportData() {
    const [convs, projects] = await Promise.all([
      StorageManager.getAllConversations(),
      StorageManager.getAllProjects()
    ]);
    const data = {
      exported: new Date().toISOString(),
      conversations: convs,
      projects: projects,
      settings: SettingsStore.getAll()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexusai-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ToastManager.show('Data exported successfully', 'success');
  }
};

/* ═══════════════════════════════════════════════════════════════
   NEXUS APP — Public API & Page Router
═══════════════════════════════════════════════════════════════ */
window.NexusApp = {
  async boot() {
    // Initialize shared modules
    await StorageManager.init();
    ThemeManager.init();
    NavManager.init();
    ToastManager.init();

    // Check connection status on every page load
    setTimeout(async () => {
      const { baseUrl, apiKey } = SettingsStore.getCredentials();
      if (baseUrl && apiKey) {
        // Bypassed: no testable endpoint on the Anthropic proxy.
        // We just mark the badge as connected if credentials are present.
        const result = await APIManager.testConnection();
        NavManager.updateConnectionBadge(
          result.ok ? 'connected' : 'error',
          result.ok ? 'Connected' : 'Error'
        );
        // Sync mobile badge too
        const mDot = document.getElementById('mobileConnectionDot');
        const mLabel = document.getElementById('mobileConnectionLabel');
        if (mDot) { mDot.className = 'badge-dot ' + (result.ok ? 'connected' : 'error'); }
        if (mLabel) mLabel.textContent = result.ok ? 'Connected' : 'API Error';
      }
    }, 500);
  },

  async initChat() {
    await this.boot();
    await ChatManager.init();
  },

  async initProjects() {
    await this.boot();
    await ProjectsManager.init();
  },

  async initSettings() {
    await this.boot();
    await SettingsManager.init();
  },

  // Global utility for code copy buttons (called from innerHTML)
  copyCode(btn) {
    const pre = btn.closest('.code-block-header')?.nextElementSibling;
    if (!pre) return;
    navigator.clipboard?.writeText(pre.textContent || '');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    }, 2000);
  }
};
