# Basic tests for agents
import pytest
from main import graphs, Graph, GraphNode, NodeSignature

def test_node_signature_fixed():
    sig = NodeSignature(
        name="weather",
        input_schema={"type": "object", "properties": {"location": {"type": "string"}}},
        output_schema={"type": "object", "properties": {"temp": {"type": "number"}}}
    )
    assert sig.input_schema["properties"]["location"]["type"] == "string"

def test_graph_creation():
    node = GraphNode(id="n1", type="tool", label="Weather", signature=None)
    g = Graph(id="g1", name="Test", nodes=[node], edges=[])
    graphs["g1"] = g
    assert graphs["g1"].nodes[0].type == "tool"
