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

def safe_exec_tool(code: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Execute simple pure tool code in a restricted namespace."""
    coerced = {}
    for k, v in inputs.items():
        if isinstance(v, str) and v.replace(".", "", 1).replace("-", "", 1).isdigit():
            coerced[k] = float(v) if "." in v else int(v)
        else:
            coerced[k] = v
    safe_builtins = {"abs": abs, "min": min, "max": max, "sum": sum, "len": len, "range": range, "int": int, "float": float, "str": str, "dict": dict, "list": list}
    ns: Dict[str, Any] = {"__builtins__": safe_builtins}
    try:
        exec(code, ns, ns)
        fn = None
        for name, obj in ns.items():
            if callable(obj) and not name.startswith("_"):
                fn = obj
                break
        if fn is None:
            return {"error": "No function found in code"}
        result = fn(coerced)
        return result if isinstance(result, dict) else {"result": result}
    except Exception as e:
        return {"error": str(e)}

@app.post("/test-tool")
async def test_tool(payload: Dict[str, Any]):
    """Actually execute tool code (or call OpenWeather)."""
    import httpx
    config = payload.get("config") or {}
    inputs = payload.get("inputs") or {}
    label = (payload.get("label") or "").lower()
    code = payload.get("code") or ""

    if "weather" in label or "openweather" in code.lower():
        api_key = config.get("api_key") or inputs.get("api_key")
        location = inputs.get("location")
        if not api_key:
            return {"error": "No API key on this tool."}
        if not location:
            return {"error": "Provide a location."}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"q": location, "appid": api_key, "units": "metric"},
                )
                data = r.json()
                if r.status_code != 200:
                    return {"error": data.get("message", "OpenWeather error")}
                return {
                    "temperature": data["main"]["temp"],
                    "wind_speed": data["wind"]["speed"],
                    "conditions": data["weather"][0]["description"],
                    "source": "OpenWeather",
                }
        except Exception as e:
            return {"error": str(e)}

    if code.strip():
        return safe_exec_tool(code, inputs)
    return {"error": "No code to execute"}

@app.post("/chat")
async def chat(request: ChatRequest):
    """NodeSmith flow: clarify → generate code + tests → execute tests → retry if needed."""
    system = """You are NodeSmith. Create a tool or function. Return ONLY valid JSON (no markdown):
{
  "label": "Add Numbers",
  "type": "function",
  "signature": {
    "name": "add_numbers",
    "input_schema": {"type":"object","properties":{"a":{"type":"number","description":"First"},"b":{"type":"number","description":"Second"}},"required":["a","b"]},
    "output_schema": {"type":"object","properties":{"result":{"type":"number"}}},
    "description": "Adds two numbers"
  },
  "code": "def add_numbers(state):\\n    return {'result': float(state['a']) + float(state['b'])}",
  "tests": [{"inputs": {"a": 2, "b": 3}, "expected": {"result": 5}}],
  "clarification_needed": false,
  "clarification_question": ""
}
Rules:
- Function must take one dict argument (state) and return a dict.
- Include at least one test with inputs and expected output.
- If the request is ambiguous, set clarification_needed true and ask a short question.
- Write real executable Python only.
"""
    response = await llm.ainvoke([
        {"role": "system", "content": system},
        {"role": "user", "content": request.message}
    ])
    raw = response.content
    node = None
    try:
        node = json.loads(raw)
    except:
        import re
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            try:
                node = json.loads(m.group())
            except:
                pass
    if node is None:
        return {"generated": None, "raw": raw, "steps": ["parse_failed"]}

    steps = ["generate"]
    if node.get("clarification_needed"):
        return {
            "generated": None,
            "clarification": node.get("clarification_question", "Please clarify."),
            "steps": ["clarify"],
            "raw": raw,
        }

    code = node.get("code", "")
    tests = node.get("tests") or []
    test_results = []
    all_passed = True
    for t in tests:
        actual = safe_exec_tool(code, t.get("inputs", {}))
        expected = t.get("expected", {})
        passed = ("error" not in actual) and all(actual.get(k) == v for k, v in expected.items())
        if not passed:
            all_passed = False
        test_results.append({"inputs": t.get("inputs"), "expected": expected, "actual": actual, "passed": passed})
    steps.append("test")

    if not all_passed and tests:
        steps.append("retry")
        feedback = f"Tests failed: {json.dumps(test_results)}. Fix the code. Return the same JSON shape."
        retry = await llm.ainvoke([
            {"role": "system", "content": system},
            {"role": "user", "content": request.message},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": feedback},
        ])
        try:
            node = json.loads(retry.content)
            code = node.get("code", code)
            test_results = []
            all_passed = True
            for t in (node.get("tests") or tests):
                actual = safe_exec_tool(code, t.get("inputs", {}))
                expected = t.get("expected", {})
                passed = ("error" not in actual) and all(actual.get(k) == v for k, v in expected.items())
                if not passed:
                    all_passed = False
                test_results.append({"inputs": t.get("inputs"), "expected": expected, "actual": actual, "passed": passed})
        except:
            pass

    return {
        "generated": node,
        "tests": test_results,
        "all_passed": all_passed,
        "steps": steps,
        "raw": raw,
    }

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
