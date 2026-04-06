import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState('light');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5-20250929');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

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

    try {
      const response = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let done = false;

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

      // Reload messages to get saved versions
      await loadMessages(conversationId);
      await loadConversations();

    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.filter(m => m.id !== 'streaming'));
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteConversation = async (id) => {
    try {
      await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
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
        <div className="p-3">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-2 px-4 py-2 bg-[#CC785C] hover:bg-[#b86a4e] text-white rounded-lg font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            Recent Chats
          </div>
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`group px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-200 dark:hover:bg-gray-800 ${
                currentConversation?.id === conv.id ? 'bg-gray-200 dark:bg-gray-800' : ''
              }`}
              onClick={() => selectConversation(conv)}
            >
              <div className="flex-1 truncate">
                <div className="text-sm truncate">{conv.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(conv.updated_at)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
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
              {currentConversation?.title || 'New Chat'}
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
              {isStreaming ? (
                <button
                  onClick={() => setIsStreaming(false)}
                  className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
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
  // Simple markdown rendering
  const renderMarkdown = (text) => {
    if (!text) return null;

    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      // Code block
      if (part.startsWith('```')) {
        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
        if (match) {
          const language = match[1] || 'text';
          const code = match[2].trim();
          return (
            <div key={i} className="my-3 rounded-lg overflow-hidden bg-gray-900 text-gray-100">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <span className="text-xs text-gray-400">{language}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-sm">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
      }

      // Regular text with inline formatting
      let processed = part;

      // Bold
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // Italic
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');

      // Inline code
      processed = processed.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">$1</code>');

      // Links
      processed = processed.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-[#CC785C] hover:underline">$1</a>');

      // Headers
      processed = processed.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
      processed = processed.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
      processed = processed.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

      // Lists
      processed = processed.replace(/^\* (.+)$/gm, '<li class="ml-4">$1</li>');
      processed = processed.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');
      processed = processed.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>');

      // Blockquotes
      processed = processed.replace(/^> (.+)$/gm, '<blockquote class="border-l-3 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-2">$1</blockquote>');

      // Paragraphs
      processed = processed.split('\n\n').map((p, j) => (
        <p key={j} className="mb-2" dangerouslySetInnerHTML={{ __html: p }} />
      ));

      return <div key={i}>{processed}</div>;
    });
  };

  return (
    <div className={`text-sm leading-relaxed ${isUser ? '' : 'markdown-content'}`}>
      {renderMarkdown(content)}
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

export default App
