#!/bin/bash

# Claude.ai Clone - Environment Setup Script
# This script sets up the development environment for the Claude.ai Clone project

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=5173
BACKEND_PORT=3001
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Claude.ai Clone - Setup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check Node.js version
check_node() {
    echo -e "${BLUE}Checking Node.js...${NC}"
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_status "Node.js version: $NODE_VERSION"
    else
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
}

# Check pnpm
check_pnpm() {
    echo -e "${BLUE}Checking pnpm...${NC}"
    if command -v pnpm &> /dev/null; then
        PNPM_VERSION=$(pnpm -v)
        print_status "pnpm version: $PNPM_VERSION"
    else
        print_warning "pnpm not found. Installing pnpm..."
        npm install -g pnpm
        print_status "pnpm installed"
    fi
}

# Setup backend
setup_backend() {
    echo -e "${BLUE}Setting up backend...${NC}"
    cd "$PROJECT_DIR"

    # Create server directory if it doesn't exist
    if [ ! -d "server" ]; then
        mkdir -p server
        print_status "Created server directory"
    fi

    # Install backend dependencies
    cd "$PROJECT_DIR/server"
    if [ -f "package.json" ]; then
        print_status "Installing backend dependencies..."
        npm install
        print_status "Backend dependencies installed"
    else
        print_warning "No package.json in server directory"
    fi

    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f "$PROJECT_DIR/.env" ]; then
            cp "$PROJECT_DIR/.env" .env
            print_status "Copied .env from project root"
        else
            cat > .env << 'EOF'
# Claude API Configuration
ANTHROPIC_API_KEY=your_api_key_here
PORT=3001
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:5173
EOF
            print_warning "Created .env file - please add your API key"
        fi
    fi

    cd "$PROJECT_DIR"
}

# Setup frontend
setup_frontend() {
    echo -e "${BLUE}Setting up frontend...${NC}"

    # Install frontend dependencies
    if [ -f "package.json" ]; then
        print_status "Installing frontend dependencies..."
        pnpm install
        print_status "Frontend dependencies installed"
    else
        print_warning "No package.json found in project root"
    fi
}

# Initialize database
init_database() {
    echo -e "${BLUE}Initializing database...${NC}"
    cd "$PROJECT_DIR/server"

    if [ -f "init-db.js" ]; then
        node init-db.js
        print_status "Database initialized"
    else
        print_warning "Database initialization script not found"
    fi

    cd "$PROJECT_DIR"
}

# Start backend server
start_backend() {
    echo -e "${BLUE}Starting backend server...${NC}"
    cd "$PROJECT_DIR/server"

    if [ -f "node_modules/.bin/nodemon" ]; then
        npx nodemon server.js &
    elif [ -f "node_modules/.bin/node" ]; then
        npm start &
    else
        print_warning "Backend start script not configured"
    fi

    BACKEND_PID=$!
    print_status "Backend server starting (PID: $BACKEND_PID)"
    cd "$PROJECT_DIR"
}

# Start frontend server
start_frontend() {
    echo -e "${BLUE}Starting frontend server...${NC}"

    # Start Vite dev server
    pnpm dev &
    FRONTEND_PID=$!
    print_status "Frontend server starting (PID: $FRONTEND_PID)"
}

# Check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Print usage information
print_usage() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Setup Complete!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "Access the application:"
    echo -e "  ${GREEN}Frontend:${NC}  http://localhost:$FRONTEND_PORT"
    echo -e "  ${GREEN}Backend:${NC}   http://localhost:$BACKEND_PORT"
    echo ""
    echo -e "Useful commands:"
    echo -e "  ${YELLOW}pnpm dev${NC}        - Start development server"
    echo -e "  ${YELLOW}pnpm build${NC}       - Build for production"
    echo -e "  ${YELLOW}pnpm preview${NC}     - Preview production build"
    echo ""
    echo -e "Server processes are running in the background."
    echo -e "Press Ctrl+C to stop the servers."
    echo ""
}

# Main setup process
main() {
    echo -e "${BLUE}Starting setup process...${NC}"
    echo ""

    check_node
    check_pnpm
    setup_backend
    setup_frontend

    # Check ports before starting
    if check_port $FRONTEND_PORT; then
        print_warning "Port $FRONTEND_PORT is already in use. Frontend may already be running."
    fi

    if check_port $BACKEND_PORT; then
        print_warning "Port $BACKEND_PORT is already in use. Backend may already be running."
    fi

    # Ask user if they want to start servers
    echo ""
    read -p "Do you want to start the development servers? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_backend
        sleep 2
        start_frontend
        print_usage
    else
        echo ""
        echo -e "${YELLOW}Skipping server start. Run manually:${NC}"
        echo -e "  ${YELLOW}cd server && npm start${NC}  - Start backend"
        echo -e "  ${YELLOW}pnpm dev${NC}               - Start frontend"
        echo ""
    fi
}

# Run main function
main "$@"
