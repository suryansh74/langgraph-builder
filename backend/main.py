from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
import json

load_dotenv()

app = FastAPI(title="LangGraph Builder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Grok via OpenAI-compatible client
llm = ChatOpenAI(
    model=os.getenv("MODEL_NAME", "grok-4"),
    api_key=os.getenv("XAI_API_KEY"),
    base_url="https://api.x.ai/v1",
    temperature=0.2,
)

class NodeSignature(BaseModel):
    name: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    description: str = ""

class GraphNode(BaseModel):
    id: str
    type: str  # agent, tool, llm, subgraph, start, end
    label: str
    signature: Optional[NodeSignature] = None
    config: Dict[str, Any] = {}
    position: Dict[str, float] = {}

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    condition: Optional[str] = None

class Graph(BaseModel):
    id: str
    name: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    is_subgraph: bool = False

class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None

class TestCase(BaseModel):
    id: str
    graph_id: str
    input: Dict[str, Any]
    expected_output: Dict[str, Any]
    type: str  # unit or integration

# In-memory store for demo; replace with Postgres
graphs: Dict[str, Graph] = {}
test_cases: List[TestCase] = []

@app.get("/")
def root():
    return {"message": "LangGraph Builder API", "model": os.getenv("MODEL_NAME", "grok-4")}

@app.post("/graphs")
def create_graph(graph: Graph):
    graphs[graph.id] = graph
    return graph

@app.get("/graphs/{graph_id}")
def get_graph(graph_id: str):
    if graph_id not in graphs:
        raise HTTPException(404, "Graph not found")
    return graphs[graph_id]

@app.post("/chat")
async def chat(request: ChatRequest):
    """Chat to generate tools, agents, or nodes via LLM."""
    system = """You are a LangGraph node generator. Given a user request, output a JSON node definition
    with fixed signature (input_schema, output_schema as JSON Schema), type (tool/agent/llm/subgraph),
    and config. For weather example, include API key placeholder.
    For hierarchical, mark is_subgraph true and suggest child nodes.
    Always include signature.
    """
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": request.message}
    ]
    response = await llm.ainvoke(messages)
    try:
        node_data = json.loads(response.content)
        return {"generated": node_data, "raw": response.content}
    except:
        return {"generated": None, "raw": response.content, "note": "Parse as node JSON"}

@app.post("/execute/{graph_id}")
def execute_graph(graph_id: str, input_state: Dict[str, Any]):
    if graph_id not in graphs:
        raise HTTPException(404, "Graph not found")
    graph = graphs[graph_id]
    # Simplified execution stub - build StateGraph from nodes
    # In real impl: compile LangGraph, inject Langfuse callback for tokens
    return {"status": "executed", "output": input_state, "tokens_used": 150, "steps": len(graph.nodes)}

@app.post("/tests")
def add_test(test: TestCase):
    test_cases.append(test)
    return test

@app.post("/tests/run/{graph_id}")
def run_tests(graph_id: str):
    relevant = [t for t in test_cases if t.graph_id == graph_id]
    results = []
    for t in relevant:
        # Stub: compare expected vs actual (call execute)
        passed = True  # real: run and assert
        results.append({"test_id": t.id, "passed": passed, "type": t.type})
    return {"results": results, "all_passed": all(r["passed"] for r in results)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
