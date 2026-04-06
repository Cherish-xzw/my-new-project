import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ============ IN-MEMORY DATA STORE ============

const store = {
  users: {
    'default-user': {
      id: 'default-user',
      email: 'user@claude.local',
      name: 'User',
      avatar_url: null,
      created_at: new Date().toISOString(),
      last_login: null,
      preferences: JSON.stringify({
        theme: 'light',
        fontSize: 'medium',
        messageDensity: 'comfortable',
        codeTheme: 'monokai'
      }),
      custom_instructions: ''
    }
  },
  projects: [],
  conversations: [],
  messages: [],
  artifacts: [],
  conversation_folders: [],
  usage_tracking: []
};

// ============ HELPER FUNCTIONS ============

const getNow = () => new Date().toISOString();

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: getNow() });
});

// ============ CONVERSATIONS API ============

app.get('/api/conversations', (req, res) => {
  const conversations = store.conversations
    .filter(c => !c.is_deleted)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json(conversations);
});

app.post('/api/conversations', (req, res) => {
  const { title, model, project_id } = req.body;
  const now = getNow();
  const conversation = {
    id: uuidv4(),
    user_id: 'default-user',
    project_id: project_id || null,
    title: title || 'New Conversation',
    model: model || 'claude-sonnet-4-5-20250929',
    created_at: now,
    updated_at: now,
    last_message_at: now,
    is_archived: false,
    is_pinned: false,
    is_deleted: false,
    settings: '{}',
    token_count: 0,
    message_count: 0
  };
  store.conversations.push(conversation);
  res.status(201).json(conversation);
});

app.get('/api/conversations/:id', (req, res) => {
  const conversation = store.conversations.find(c => c.id === req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  res.json(conversation);
});

app.put('/api/conversations/:id', (req, res) => {
  const { title, is_archived, is_pinned, settings } = req.body;
  const conversation = store.conversations.find(c => c.id === req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (title !== undefined) conversation.title = title;
  if (is_archived !== undefined) conversation.is_archived = is_archived;
  if (is_pinned !== undefined) conversation.is_pinned = is_pinned;
  if (settings !== undefined) conversation.settings = JSON.stringify(settings);
  conversation.updated_at = getNow();

  res.json(conversation);
});

app.delete('/api/conversations/:id', (req, res) => {
  const conversation = store.conversations.find(c => c.id === req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  conversation.is_deleted = true;
  conversation.updated_at = getNow();
  res.json({ success: true });
});

// ============ MESSAGES API ============

app.get('/api/conversations/:id/messages', (req, res) => {
  const messages = store.messages
    .filter(m => m.conversation_id === req.params.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json(messages);
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, images } = req.body;
  const conversationId = req.params.id;

  const conversation = store.conversations.find(c => c.id === conversationId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const existingMessages = store.messages
    .filter(m => m.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const now = getNow();

  // Save user message
  const userMessage = {
    id: uuidv4(),
    conversation_id: conversationId,
    role: 'user',
    content,
    created_at: now,
    edited_at: null,
    tokens: 0,
    finish_reason: null,
    images: JSON.stringify(images || []),
    parent_message_id: null
  };
  store.messages.push(userMessage);

  // Update conversation
  const messageCount = existingMessages.length + 1;
  if (conversation.title === 'New Conversation') {
    conversation.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
  }
  conversation.updated_at = now;
  conversation.last_message_at = now;
  conversation.message_count = messageCount;

  // Set up SSE for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const assistantMessageId = uuidv4();
  let fullResponse = '';

  // Simulate streaming response (mock Claude API for demo)
  const mockResponses = [
    "I understand. Let me help you with that.",
    "That's a great question! Here's what I think...",
    "Based on my knowledge, here's the answer:",
    "I've analyzed your request and here's my response:",
    "Thanks for sharing that. Let me provide some insights."
  ];

  const baseResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
  const paragraphs = [
    baseResponse,
    "",
    content.includes('code') || content.includes('function') || content.includes('JavaScript') || content.includes('Python')
      ? "Here's an example of how you might approach this:\n\n```javascript\n// Example code\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('World');\n```"
      : "I can help you with various tasks including coding, analysis, writing, and more. Feel free to ask me anything!",
    "",
    "Is there anything specific you'd like me to elaborate on?"
  ];

  const fullText = paragraphs.join('\n');

  // Stream the response
  const streamResponse = async () => {
    const words = fullText.split('');
    for (let i = 0; i < words.length; i++) {
      if (res.writableEnded) break;
      fullResponse += words[i];
      res.write(`data: ${JSON.stringify({ type: 'stream', text: words[i] })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Save assistant message
    const assistantMessage = {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: 'assistant',
      content: fullResponse,
      created_at: now,
      edited_at: null,
      tokens: fullResponse.length,
      finish_reason: 'stop',
      images: '[]',
      parent_message_id: null
    };
    store.messages.push(assistantMessage);

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessageId, tokens: { output_tokens: fullResponse.length } })}\n\n`);
    res.end();
  };

  streamResponse();
});

// ============ PROJECTS API ============

app.get('/api/projects', (req, res) => {
  const projects = store.projects.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
    return a.name.localeCompare(b.name);
  });
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, description, color } = req.body;
  const now = getNow();
  const project = {
    id: uuidv4(),
    user_id: 'default-user',
    name,
    description: description || '',
    color: color || '#CC785C',
    custom_instructions: '',
    knowledge_base_path: null,
    created_at: now,
    updated_at: now,
    is_archived: false,
    is_pinned: false
  };
  store.projects.push(project);
  res.status(201).json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, description, color, custom_instructions } = req.body;
  const project = store.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (color !== undefined) project.color = color;
  if (custom_instructions !== undefined) project.custom_instructions = custom_instructions;
  project.updated_at = getNow();

  res.json(project);
});

app.delete('/api/projects/:id', (req, res) => {
  const index = store.projects.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }
  store.projects.splice(index, 1);
  res.json({ success: true });
});

// ============ ARTIFACTS API ============

app.get('/api/conversations/:id/artifacts', (req, res) => {
  const artifacts = store.artifacts
    .filter(a => a.conversation_id === req.params.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(artifacts);
});

app.post('/api/artifacts', (req, res) => {
  const { message_id, conversation_id, type, title, identifier, language, content } = req.body;
  const now = getNow();
  const artifact = {
    id: uuidv4(),
    message_id,
    conversation_id,
    type: type || 'text',
    title,
    identifier,
    language,
    content,
    version: 1,
    created_at: now,
    updated_at: now
  };
  store.artifacts.push(artifact);
  res.status(201).json(artifact);
});

app.put('/api/artifacts/:id', (req, res) => {
  const { content, title } = req.body;
  const artifact = store.artifacts.find(a => a.id === req.params.id);
  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  if (content !== undefined) artifact.content = content;
  if (title !== undefined) artifact.title = title;
  artifact.version += 1;
  artifact.updated_at = getNow();

  res.json(artifact);
});

app.delete('/api/artifacts/:id', (req, res) => {
  const index = store.artifacts.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Artifact not found' });
  }
  store.artifacts.splice(index, 1);
  res.json({ success: true });
});

// ============ SETTINGS API ============

app.get('/api/settings', (req, res) => {
  const user = store.users['default-user'];
  res.json({
    preferences: JSON.parse(user.preferences || '{}'),
    custom_instructions: user.custom_instructions || ''
  });
});

app.put('/api/settings', (req, res) => {
  const { preferences, custom_instructions } = req.body;
  const user = store.users['default-user'];

  if (preferences !== undefined) {
    user.preferences = JSON.stringify(preferences);
  }
  if (custom_instructions !== undefined) {
    user.custom_instructions = custom_instructions;
  }

  res.json({
    preferences: JSON.parse(user.preferences || '{}'),
    custom_instructions: user.custom_instructions || ''
  });
});

// ============ MODELS API ============

app.get('/api/claude/models', (req, res) => {
  res.json([
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Best balance of intelligence and speed' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest response times' },
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', description: 'Most capable for complex tasks' }
  ]);
});

// ============ USAGE API ============

app.get('/api/usage/daily', (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usage = store.usage_tracking
    .filter(u => new Date(u.created_at) >= thirtyDaysAgo)
    .reduce((acc, u) => {
      const date = u.created_at.split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, input_tokens: 0, output_tokens: 0 };
      }
      acc[date].input_tokens += u.input_tokens;
      acc[date].output_tokens += u.output_tokens;
      return acc;
    }, {});

  res.json(Object.values(usage).sort((a, b) => b.date.localeCompare(a.date)));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

export default app;
