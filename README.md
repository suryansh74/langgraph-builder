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

## Quick Start

1. Clone and setup:
   ```bash
   git clone https://github.com/ishaanyo/langgraph-builder.git
   cd langgraph-builder
   cp .env.example .env
   # Add XAI_API_KEY (Grok), DATABASE_URL, LANGFUSE keys
   ```

2. Start infrastructure:
   ```bash
   docker compose up -d
   ```

3. Backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

4. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Open http://localhost:3000 for the builder canvas + chat.

## Architecture

- **Frontend**: Next.js App Router + @xyflow/react for canvas. Chat sends to /api/chat which proxies to backend.
- **Backend**: FastAPI endpoints for graph CRUD, execution, LLM generation of tools/agents, test runner.
- **Graphs**: Stored as JSON in Postgres. Compiled to LangGraph StateGraph at runtime.
- **Hierarchical**: Subgraph nodes render as collapsible groups in React Flow; backend treats as nested graphs.
- **Observability**: Integrate Langfuse SDK in backend for traces. Self-host Langfuse separately.

## Model Note

Uses Grok API (xAI). Model name configurable (default grok-4 or as specified). "GPT-OS 120B" may refer to open models; configure via env.

## Tests

```bash
cd backend
pytest tests/
```

## License

MIT
