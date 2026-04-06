import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = '/api';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);
  const [theme, setTheme] = useState('light');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5-20250929');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationMenuId, setConversationMenuId] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadModels();
    loadTheme();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id);
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const loadConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const data = await res.json();
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/claude/models`);
      const data = await res.json();
      setModels(data);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved) setTheme(saved);
  };

  // Computed: filter conversations based on search query
  const filteredConversations = searchQuery.trim()
    ? conversations.filter(conv =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleContextMenu = (e, convId) => {
    e.preventDefault();
    setConversationMenuId(conversationMenuId === convId ? null : convId);
  };

  const saveTitle = async () => {
    if (!currentConversation || !editedTitle.trim()) {
      setEditingTitle(false);
      return;
    }
    try {
      await fetch(`${API_BASE}/conversations/${currentConversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle.trim() })
      });
      setCurrentConversation({ ...currentConversation, title: editedTitle.trim() });
      setConversations(prev => prev.map(c =>
        c.id === currentConversation.id ? { ...c, title: editedTitle.trim() } : c
      ));
    } catch (error) {
      console.error('Failed to update title:', error);
    }
    setEditingTitle(false);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const createNewConversation = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      });
      const conversation = await res.json();
      setConversations(prev => [conversation, ...prev]);
      setCurrentConversation(conversation);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    let conversationId = currentConversation?.id;

    // Create new conversation if needed
    if (!conversationId) {
      try {
        const res = await fetch(`${API_BASE}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel })
        });
        const conversation = await res.json();
        setConversations(prev => [conversation, ...prev]);
        setCurrentConversation(conversation);
        conversationId = conversation.id;
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: input
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreaming(true);

    // Create abort controller for stopping
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input }),
        signal: abortControllerRef.current.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let done = false;
      let wasStopped = false;

      // Add placeholder for streaming message
      setMessages(prev => [...prev, {
        id: 'streaming',
        role: 'assistant',
        content: ''
      }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'stream') {
                  assistantContent += data.text;
                  setMessages(prev => prev.map((msg, i) =>
                    i === prev.length - 1
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                } else if (data.type === 'done') {
                  done = true;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // If stopped, keep the partial response as a regular message
      if (wasStopped && assistantContent) {
        // Replace streaming placeholder with actual content
        setMessages(prev => prev.map((msg, i) =>
          i === prev.length - 1 && msg.id === 'streaming'
            ? { ...msg, id: `temp-${Date.now()}`, content: assistantContent }
            : msg
        ));
      } else {
        // Reload messages to get saved versions
        await loadMessages(conversationId);
        await loadConversations();
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        // Fetch was aborted - this is expected when stopping
        wasStopped = true;
      } else {
        console.error('Failed to send message:', error);
        setMessages(prev => prev.filter(m => m.id !== 'streaming'));
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteConversation = async (id) => {
    // Show confirmation dialog instead of deleting directly
    setConversationToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    try {
      await fetch(`${API_BASE}/conversations/${conversationToDelete}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== conversationToDelete));
      if (currentConversation?.id === conversationToDelete) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
    setShowDeleteConfirm(false);
    setConversationToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setConversationToDelete(null);
  };

  const selectConversation = (conversation) => {
    setCurrentConversation(conversation);
    setSidebarOpen(false);
  };

  const getModelName = (modelId) => {
    const model = models.find(m => m.id === modelId);
    return model?.name || modelId;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-screen flex bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 bg-gray-100 dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-800 transition-all duration-200 overflow-hidden flex flex-col`}>
        <div className="p-3 space-y-2">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-2 px-4 py-2 bg-[#CC785C] hover:bg-[#b86a4e] text-white rounded-lg font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Chat
          </button>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-200 dark:bg-gray-800 rounded-lg outline-none focus:ring-2 focus:ring-[#CC785C] placeholder-gray-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            filteredConversations={filteredConversations}
            searchQuery={searchQuery}
            currentConversation={currentConversation}
            onSelect={selectConversation}
            onDelete={deleteConversation}
            onContextMenu={handleContextMenu}
            menuOpenId={conversationMenuId}
          />
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Toggle theme"
          >
            {theme === 'light' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg lg:hidden"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">
              {editingTitle ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') {
                      setEditingTitle(false);
                      setEditedTitle(currentConversation?.title || '');
                    }
                  }}
                  autoFocus
                  className="bg-transparent border-b-2 border-[#CC785C] outline-none px-1"
                />
              ) : (
                <span
                  className="cursor-pointer hover:text-[#CC785C] transition-colors"
                  onClick={() => {
                    if (currentConversation) {
                      setEditingTitle(true);
                      setEditedTitle(currentConversation.title);
                    }
                  }}
                  title="Click to rename"
                >
                  {currentConversation?.title || 'New Chat'}
                </span>
              )}
            </h1>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowModelSelect(!showModelSelect)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <span className="hidden sm:inline">{getModelName(selectedModel)}</span>
              <span className="sm:hidden">Model</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showModelSelect && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => { setSelectedModel(model.id); setShowModelSelect(false); }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 first:rounded-t-lg last:rounded-b-lg ${
                      selectedModel === model.id ? 'bg-gray-100 dark:bg-gray-800' : ''
                    }`}
                  >
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{model.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto">
          {!currentConversation && messages.length === 0 ? (
            <WelcomeScreen onNewChat={createNewConversation} theme={theme} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && <TypingIndicator />}
            </div>
          )}
        </main>

        {/* Input Area */}
        <footer className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Claude..."
                className="flex-1 bg-transparent resize-none outline-none text-sm max-h-40"
                rows={1}
                style={{ minHeight: '24px' }}
              />
              {input.length > 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap pb-1">
                  {input.length} chars · ~{Math.ceil(input.length / 4)} tokens
                </div>
              )}
              {isStreaming ? (
                <button
                  onClick={stopGeneration}
                  className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                  title="Stop generation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className="p-2 bg-[#CC785C] hover:bg-[#b86a4e] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
              Claude can make mistakes. Consider checking important information.
            </p>
          </div>
        </footer>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">Delete Conversation</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Welcome Screen Component
function WelcomeScreen({ onNewChat, theme }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="mb-6">
          <div className={`w-16 h-16 mx-auto rounded-2xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#CC785C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Claude</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Ask me anything. I'm here to help with coding, analysis, writing, and more.
        </p>

        <button
          onClick={onNewChat}
          className="px-6 py-3 bg-[#CC785C] hover:bg-[#b86a4e] text-white rounded-xl font-medium transition-colors"
        >
          Start New Chat
        </button>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {[
            'Explain the difference between React hooks',
            'Write a Python function to sort a list',
            'Help me debug my JavaScript code',
            'What are best practices for REST APIs?'
          ].map((suggestion, i) => (
            <button
              key={i}
              onClick={() => {/* Would set input to suggestion */}}
              className="p-3 text-left text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-[#CC785C] text-white'
              : 'bg-transparent'
          }`}
        >
          <MarkdownContent content={message.content} isUser={isUser} />
        </div>
      </div>
    </div>
  );
}

// Markdown Content Component
function MarkdownContent({ content, isUser }) {
  const [copiedIndex, setCopiedIndex] = React.useState(null);

  const handleCopy = (code, index) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (!inline && match) {
        const codeString = String(children).replace(/\n$/, '');
        const codeIndex = `${language}-${codeString.substring(0, 30)}`;
        return (
          <div className="my-3 rounded-lg overflow-hidden bg-[#1e1e1e] text-gray-100">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
              <span className="text-xs text-gray-400 font-mono">{language}</span>
              <button
                onClick={() => handleCopy(codeString, codeIndex)}
                className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700"
              >
                {copiedIndex === codeIndex ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className={`language-${language}`} {...props}>
                {codeString}
              </code>
            </pre>
          </div>
        );
      }

      if (inline) {
        return (
          <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-[#CC785C] dark:text-orange-400" {...props}>
            {children}
          </code>
        );
      }

      return (
        <code className="block bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm font-mono" {...props}>
          {children}
        </code>
      );
    },
    h1({ children }) {
      return <h1 className="text-2xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-xl font-semibold mt-5 mb-3 text-gray-900 dark:text-gray-100">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">{children}</h3>;
    },
    p({ children }) {
      return <p className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>;
    },
    ul({ children }) {
      return <ul className="list-disc list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300">{children}</ol>;
    },
    li({ children }) {
      return <li className="text-gray-700 dark:text-gray-300">{children}</li>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-4 border-[#CC785C] pl-4 my-4 italic text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 py-2 rounded-r">
          {children}
        </blockquote>
      );
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#CC785C] hover:text-[#b86a4e] dark:text-orange-400 dark:hover:text-orange-300 underline"
        >
          {children}
        </a>
      );
    },
    strong({ children }) {
      return <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>;
    },
    em({ children }) {
      return <em className="italic text-gray-700 dark:text-gray-300">{children}</em>;
    },
    hr() {
      return <hr className="my-6 border-gray-200 dark:border-gray-700" />;
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto my-4">
          <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>;
    },
    th({ children }) {
      return <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">{children}</th>;
    },
    td({ children }) {
      return <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">{children}</td>;
    },
  };

  if (isUser) {
    return <div className="text-sm">{content}</div>;
  }

  return (
    <div className="text-sm leading-relaxed markdown-content">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Typing Indicator Component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">Claude is thinking...</span>
    </div>
  );
}

// Conversation List Component with Date Grouping
function ConversationList({ conversations, filteredConversations, searchQuery, currentConversation, onSelect, onDelete, onContextMenu, menuOpenId }) {
  const groupConversations = (convs) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = {
      pinned: [],
      today: [],
      yesterday: [],
      previous7Days: [],
      older: []
    };

    convs.forEach(conv => {
      const convDate = new Date(conv.updated_at);
      const convDateOnly = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

      if (conv.is_pinned) {
        groups.pinned.push(conv);
      } else if (convDateOnly.getTime() === today.getTime()) {
        groups.today.push(conv);
      } else if (convDateOnly.getTime() === yesterday.getTime()) {
        groups.yesterday.push(conv);
      } else if (convDateOnly >= weekAgo) {
        groups.previous7Days.push(conv);
      } else {
        groups.older.push(conv);
      }
    });

    return groups;
  };

  const displayConversations = searchQuery.trim()
    ? filteredConversations
    : conversations.filter(c => !c.is_deleted);

  const groups = groupConversations(displayConversations);

  const renderGroup = (title, convs) => {
    if (convs.length === 0) return null;
    return (
      <div key={title} className="mb-2">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          {title}
        </div>
        {convs.map(conv => (
          <div
            key={conv.id}
            className={`group px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-200 dark:hover:bg-gray-800 ${
              currentConversation?.id === conv.id ? 'bg-gray-200 dark:bg-gray-800' : ''
            }`}
            onClick={() => onSelect(conv)}
            onContextMenu={(e) => onContextMenu(e, conv.id)}
          >
            <div className="flex-1 truncate">
              <div className="flex items-center gap-1">
                {conv.is_pinned && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#CC785C]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z"/>
                  </svg>
                )}
                <div className="text-sm truncate">{conv.title}</div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(conv.updated_at)}</div>
            </div>
            {menuOpenId === conv.id && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); /* TODO: toggle pin */ }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-t-lg"
                >
                  {conv.is_pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); /* TODO: archive */ }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Archive
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); setConversationMenuId(null); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500 rounded-b-lg"
                >
                  Delete
                </button>
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    );
  };

  if (searchQuery.trim() && filteredConversations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No conversations found
      </div>
    );
  }

  return (
    <div className="relative">
      {!searchQuery.trim() && (
        <>
          {groups.pinned.length > 0 && renderGroup('Pinned', groups.pinned)}
          {groups.today.length > 0 && renderGroup('Today', groups.today)}
          {groups.yesterday.length > 0 && renderGroup('Yesterday', groups.yesterday)}
          {groups.previous7Days.length > 0 && renderGroup('Previous 7 Days', groups.previous7Days)}
          {groups.older.length > 0 && renderGroup('Older', groups.older)}
        </>
      )}
      {searchQuery.trim() && filteredConversations.map(conv => (
        <div
          key={conv.id}
          className={`group px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-200 dark:hover:bg-gray-800 ${
            currentConversation?.id === conv.id ? 'bg-gray-200 dark:bg-gray-800' : ''
          }`}
          onClick={() => onSelect(conv)}
        >
          <div className="flex-1 truncate">
            <div className="text-sm truncate">{conv.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(conv.updated_at)}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export default App
