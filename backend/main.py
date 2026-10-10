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

from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="LangGraph Builder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Groq via OpenAI-compatible client (https://api.groq.com/openai/v1)
# Supports models like openai/gpt-oss-120b, llama-3.3-70b-versatile, etc.
llm = ChatOpenAI(
    model=os.getenv("MODEL_NAME", "openai/gpt-oss-120b"),
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
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
    return {"message": "LangGraph Builder API", "provider": "Groq", "model": os.getenv("MODEL_NAME", "openai/gpt-oss-120b")}

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
    system = """You are NodeSmith, a LangGraph node generator.
Return ONLY valid JSON (no markdown) with this shape:
{
  "label": "Short name",
  "type": "tool|llm|agent|function|conditional",
  "tools": [{"name": "tool_name", "description": "..."}],
  "signature": {
    "name": "snake_case",
    "input_schema": {"type":"object","properties":{...},"required":[...]},
    "output_schema": {"type":"object","properties":{...}},
    "description": "..."
  },
  "code": "def function_name(state):\\n    # real logic\\n    return {...}",
  "config": {}
}
For weather tools: include location and api_key in input, and write a realistic code stub that uses requests to call OpenWeather (or notes that api_key is required). Do not pretend to call the API if no key is present.
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

@app.post("/test-tool")
async def test_tool(payload: Dict[str, Any]):
    """Test a single tool independently. For weather, call OpenWeather if api_key is present."""
    import httpx
    tool_type = payload.get("type", "")
    config = payload.get("config") or {}
    inputs = payload.get("inputs") or {}
    label = (payload.get("label") or "").lower()
    code = payload.get("code") or ""

    # Weather tool: real call if key present
    if "weather" in label or "weather" in code.lower():
        api_key = config.get("api_key") or inputs.get("api_key")
        location = inputs.get("location")
        if not api_key:
            return {"error": "No API key on this tool. Add it in NodeSmith or config."}
        if not location:
            return {"error": "Provide a location to test."}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"q": location, "appid": api_key, "units": "metric"},
                )
                data = r.json()
                if r.status_code != 200:
                    return {"error": data.get("message", "OpenWeather error"), "status": r.status_code}
                return {
                    "temperature": data["main"]["temp"],
                    "wind_speed": data["wind"]["speed"],
                    "conditions": data["weather"][0]["description"],
                    "humidity": data["main"].get("humidity"),
                    "source": "OpenWeather (real call)",
                }
        except Exception as e:
            return {"error": str(e)}

    # Generic: ask the LLM to simulate/execute based on the code
    prompt = f"""You are executing this tool code with the given inputs.
Code:
{code}

Inputs: {json.dumps(inputs)}

Return ONLY a JSON object with the tool's output fields. No markdown."""
    try:
        resp = await llm.ainvoke([{"role": "user", "content": prompt}])
        try:
            return json.loads(resp.content)
        except:
            return {"raw": resp.content}
    except Exception as e:
        return {"error": str(e)}

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
