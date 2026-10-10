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

```bash
git clone https://github.com/suryansh74/langgraph-builder.git
cd langgraph-builder
cp .env.example .env
# Edit .env and set GROQ_API_KEY=gsk_...

# 1. Start Postgres
docker compose up -d

# 2. Backend (from the project root)
cd backend
python -m venv venv
source venv/bin/activate          # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Leave this terminal running

# 3. Frontend (new terminal, from project root)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000  
API docs: http://localhost:8000/docs

**Note:** If `pip install` fails on numpy/asyncpg (common on some Python versions), try Python 3.11 or 3.12, or remove the strict pins and use `pip install fastapi uvicorn langgraph langchain langchain-openai pydantic sqlalchemy asyncpg psycopg2-binary pytest httpx python-dotenv langfuse`.

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
