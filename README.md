# Text-to-SQL AI Agent

A robust, production-ready Text-to-SQL agent built with LangGraph, FastAPI, and React. It converts natural language into SQL queries, executes them securely against a PostgreSQL database, and visualizes the results.

This project was designed from the ground up to demonstrate production-grade AI engineering principles, prioritizing security, reliability, and observability over naive LLM wrappers.

## ✨ Features

- **Decomposed LangGraph Pipeline:** The text-to-SQL process is broken down into discrete steps (Generate → Validate → Execute → Python Tool → Synthesize) rather than a single massive prompt, ensuring high reliability and modularity.
- **AST-Based SQL Validation:** Uses `sqlglot` to parse the LLM's SQL into an Abstract Syntax Tree (AST), ensuring it is a strictly `SELECT` statement before execution. This prevents SQL injection and unintended DDL/DML execution better than regex.
- **Headless Data Visualization:** A sandboxed Python tool uses `pandas` and `matplotlib` to generate Base64-encoded charts securely from the query results.
- **Secure Authentication:** Implements JWT authentication using HTTP-Only cookies to mitigate XSS attacks, with an access/refresh token rotation mechanism.
- **Database Sandboxing:** The LLM executes SQL via a dedicated, strictly read-only PostgreSQL role (`chinook_ro`) isolated from the application user data.
- **Streaming UI:** A modern React/Vite frontend using Server-Sent Events (SSE) to stream markdown and intermediate tool-use steps in real-time.
- **Comprehensive Evals:** Includes an evaluation suite to measure query validity, execution accuracy, refusal rates, and graph retry loops against a "golden" test set.

## 🏗 Architecture

### Backend (FastAPI + LangGraph)
- **LangGraph State Machine:** Controls the flow of execution, routing the user question through validation, SQL execution, error handling/retries, and synthesis.
- **Database:** Uses `asyncpg` for non-blocking database queries. Two distinct schemas exist: `chinook` (read-only for the LLM) and `app_db` (for user accounts and chat history).
- **LLM:** Uses `ChatGroq` for high-speed inference (configurable to any LangChain-compatible model).

### Frontend (React + Vite + Tailwind)
- **Real-Time Streaming:** Custom `fetch` implementation handles Server-Sent Events (SSE) alongside HTTP-Only credential cookies.
- **Responsive UI:** Built with Tailwind CSS and Framer Motion for a polished, accessible chat interface.
- **State Management:** Uses React Query for auth and conversation history caching.

## 🚀 Quick Start (Docker)

The easiest way to run the full stack is via Docker Compose.

1. **Clone the repo and configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your GROQ_API_KEY
   ```

2. **Start the services:**
   ```bash
   docker-compose up -d --build
   ```

3. **Access the application:**
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

*Note: On first run, the PostgreSQL container will automatically run the initialization scripts to create the Chinook database, the application database, and the read-only roles.*

## 🧪 Local Development & Testing

### Backend
1. **Set up virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Run Unit Tests:**
   ```bash
   pytest tests/ -v
   ```
3. **Run Evals:**
   ```bash
   python -m eval.run_eval --category simple --verbose
   ```

### Frontend
1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```
2. **Run Dev Server:**
   ```bash
   npm run dev
   ```

## 🛡️ Security Design Choices
If you are reviewing this for an AI engineering role, here are the core design decisions made for production safety:

1. **No `localStorage` for JWTs:** Tokens are stored in memory and rotated via HTTP-Only `refresh_token` cookies, avoiding XSS vulnerabilities.
2. **Database Least Privilege:** The LLM does not have access to the app's `users` or `conversations` tables. It executes queries via a `chinook_ro` role that can strictly `SELECT` from the `chinook` database only.
3. **Graph Fallbacks & Retries:** Instead of passing raw SQL errors directly back to the user, the LangGraph setup detects execution failures and loops back to the LLM with the error context for a self-correction pass (up to 3 times).
4. **Python Sandboxing:** The python visualization tool explicitly disabled `os`, `sys`, and `subprocess` builtins, and prevents network access, to ensure the LLM cannot execute arbitrary code on the host.

## 📜 CI / CD
A GitHub Actions workflow is included (`.github/workflows/ci.yml`) that runs on every push to `main`. It automatically provisions a PostgreSQL service, runs the Ruff linter, executes the Pytest suite, and builds the frontend.
