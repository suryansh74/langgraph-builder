# LangGraph Visual Builder

Web-based visual builder for LangGraph workflows with drag-and-drop canvas, hierarchical/subgraph agents, chat-driven tool/agent creation, Grok LLM integration, open-source observability via Langfuse, and Postgres storage.

## Features

- **Drag-and-drop Canvas**: Built with React Flow in Next.js for visual graph construction.
- **Hierarchical Agents**: Super agents with collapsible subgraphs. Each has fixed signature and output schema.
- **Chat Input**: Call LLM (Grok API) to generate nodes, tools, or entire agents (e.g., weather agent from API key description).
- **Fixed Schemas**: Nodes use Pydantic/TypedDict signatures for input/output consistency.
- **Observability**: Langfuse (self-hosted Docker) for token consumption per step, traces, monitoring. No LangSmith.
- **Tests**: Unit and integration tests (pytest) that fail early on agent-to-agent breaks.
- **Storage**: Postgres Docker for graphs, nodes, runs, test results.
- **Stack**: Frontend Next.js, Backend Python FastAPI + LangGraph.

## Quick Start (using uv)

**uv is already installed on your machine.** Use it instead of pip/venv.

```bash
git clone https://github.com/suryansh74/langgraph-builder.git
cd langgraph-builder
cp .env.example .env
# Edit .env → set GROQ_API_KEY=gsk_...

# 1. Postgres (optional for the skeleton)
docker compose up -d

# 2. Backend (from project root)
cd backend
uv sync                          # creates .venv and installs deps
uv run uvicorn main:app --reload --port 8000
# Leave this running

# 3. Frontend (new terminal, from project root)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000  
API docs: http://localhost:8000/docs

**If uv complains about Python 3.14:**  
```bash
uv python install 3.12
uv sync --python 3.12
uv run --python 3.12 uvicorn main:app --reload --port 8000
```

The current backend does not need Postgres drivers to run (storage is in-memory). Add them later when you want real persistence.

## Architecture

- **Frontend**: Next.js App Router + @xyflow/react for canvas. Chat sends to /api/chat which proxies to backend.
- **Backend**: FastAPI endpoints for graph CRUD, execution, LLM generation of tools/agents, test runner.
- **Graphs**: Stored as JSON in Postgres. Compiled to LangGraph StateGraph at runtime.
- **Hierarchical**: Subgraph nodes render as collapsible groups in React Flow; backend treats as nested graphs.
- **Observability**: Integrate Langfuse SDK in backend for traces. Self-host Langfuse separately.

## Model Note

Uses **Groq API** (OpenAI-compatible). Default model is `openai/gpt-oss-120b`.  
Set `GROQ_API_KEY` and optionally change `MODEL_NAME` in `.env`.  
Other common models: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`.

## Tests

```bash
cd backend
pytest tests/
```

## License

MIT
