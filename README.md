# Claude.ai Clone - AI Chat Interface

A fully functional clone of claude.ai, Anthropic's conversational AI interface. This application provides a clean, modern chat interface for interacting with Claude via the API, featuring conversation management, artifact rendering, project organization, multiple model selection, and advanced settings.

## Features

### Core Features

- **Chat Interface**: Clean, centered chat layout with message bubbles, streaming responses, markdown rendering, code blocks with syntax highlighting, and more
- **Artifacts System**: Code artifact viewer with syntax highlighting, HTML/SVG live preview, React component preview, Mermaid diagram rendering
- **Conversation Management**: Create, rename, delete, pin, archive conversations; search and organize with folders
- **Projects**: Group related conversations, set custom instructions, organize work
- **Model Selection**: Choose between Claude Sonnet 4.5, Claude Haiku 4.5, and Claude Opus 4.1
- **Custom Instructions**: Global, project-specific, and conversation-specific system prompts
- **Advanced Settings**: Temperature control, max tokens, top-p sampling, thinking mode

### Additional Features

- **Sharing**: Share conversations via link, export to JSON/Markdown/PDF
- **Prompt Library**: Save and organize reusable prompts
- **Command Palette**: Quick actions with Cmd/Ctrl+K
- **Usage Tracking**: Token usage, cost estimation, daily/monthly dashboard
- **Accessibility**: Full keyboard navigation, screen reader support, ARIA labels, high contrast mode
- **Responsive Design**: Mobile-first layout with adaptive components

## Technology Stack

### Frontend
- React with Vite
- Tailwind CSS
- React Router for navigation
- React Markdown for message rendering
- Syntax highlighting for code blocks

### Backend
- Node.js with Express
- SQLite with better-sqlite3
- Anthropic SDK for Claude API
- Server-Sent Events for streaming

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Anthropic API key

### Installation

1. Clone the repository
2. Run the setup script:
   ```bash
   chmod +x init.sh
   ./init.sh
   ```

3. Or manually install:

   **Backend:**
   ```bash
   cd server
   npm install
   # Add your API key to .env
   npm start
   ```

   **Frontend:**
   ```bash
   pnpm install
   pnpm dev
   ```

4. Open http://localhost:5173 in your browser

## Project Structure

```
├── server/                 # Backend code
│   ├── routes/            # API routes
│   ├── middleware/         # Express middleware
│   ├── db/                # Database setup and migrations
│   └── server.js          # Main server file
├── src/                   # Frontend source code
│   ├── components/        # React components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── context/           # React context providers
│   └── utils/             # Utility functions
├── feature_list.json      # Comprehensive test cases
├── init.sh                # Environment setup script
└── package.json           # Project configuration
```

## Database Schema

### Tables

- **users**: User accounts and preferences
- **projects**: Project organization
- **conversations**: Chat conversations
- **messages**: Individual messages
- **artifacts**: Code and content artifacts
- **shared_conversations**: Shared conversation links
- **prompt_library**: Saved prompts
- **conversation_folders**: Folder organization
- **usage_tracking**: API usage statistics
- **api_keys**: API key management

## API Endpoints

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/profile`

### Conversations
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
- `PUT /api/conversations/:id`
- `DELETE /api/conversations/:id`
- `POST /api/conversations/:id/duplicate`
- `POST /api/conversations/:id/export`

### Messages
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `PUT /api/messages/:id`
- `DELETE /api/messages/:id`
- `POST /api/messages/:id/regenerate`
- `GET /api/messages/stream`

### Claude API
- `POST /api/claude/chat`
- `POST /api/claude/chat/stream`
- `GET /api/claude/models`

For complete API documentation, see the spec file.

## Testing

The project includes 200+ comprehensive test cases covering:

- Functional tests (chat, conversations, artifacts, settings)
- Style tests (UI components, responsive design, accessibility)

Run tests with Playwright:
```bash
pnpm test
```

## Configuration

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
ANTHROPIC_API_KEY=your_api_key
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## License

MIT License

## Contributing

Contributions are welcome! Please read the feature list and ensure all tests pass before submitting PRs.
