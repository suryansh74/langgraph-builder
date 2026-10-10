'use client';

import { useState, useCallback } from 'react';
import {
  ReactFlow,
  addEdge,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, MessageSquare, X, Sun, Moon } from 'lucide-react';

const defaultNodes: Node[] = [
  {
    id: 'start',
    type: 'input',
    position: { x: 80, y: 200 },
    data: {
      label: 'Start',
      type: 'start',
      signature: {
        input_schema: {},
        output_schema: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  },
  {
    id: 'hello',
    position: { x: 320, y: 180 },
    data: {
      label: 'Say Hello',
      type: 'llm',
      signature: {
        name: 'say_hello',
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Name to greet' } },
          required: ['name'],
        },
        output_schema: {
          type: 'object',
          properties: { greeting: { type: 'string' } },
        },
        description: 'Generates a friendly greeting',
      },
    },
  },
  {
    id: 'end',
    type: 'output',
    position: { x: 580, y: 200 },
    data: {
      label: 'End',
      type: 'end',
      signature: {
        input_schema: { type: 'object', properties: { greeting: { type: 'string' } } },
        output_schema: { type: 'object', properties: { result: { type: 'string' } } },
      },
    },
  },
];

const defaultEdges: Edge[] = [
  { id: 'e-start-hello', source: 'start', target: 'hello', animated: true },
  { id: 'e-hello-end', source: 'hello', target: 'end', animated: true },
];

export default function Page() {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selected, setSelected] = useState<Node | null>(null);
  const [chat, setChat] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<any>(null);
  const [state, setState] = useState<any>({ messages: [], current: null });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelected(node);
  };

  const handleChat = async () => {
    if (!chat.trim()) return;
    setChatResult('Generating...');
    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chat }),
      });
      const data = await res.json();
      setChatResult(JSON.stringify(data, null, 2));

      // Try to add a generated node
      if (data.generated) {
        const newNode: Node = {
          id: `node-${Date.now()}`,
          position: { x: 300 + Math.random() * 100, y: 100 + Math.random() * 200 },
          data: {
            label: data.generated.label || data.generated.name || 'Generated Node',
            type: data.generated.type || 'tool',
            signature: data.generated.signature || data.generated,
          },
        };
        setNodes((nds) => [...nds, newNode]);
      }
    } catch (e: any) {
      setChatResult('Error: ' + e.message);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setRunOutput(null);
    try {
      // Create a temporary graph id
      const graphId = 'demo-' + Date.now();
      const graphPayload = {
        id: graphId,
        name: 'Demo Graph',
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.data.type || 'llm',
          label: n.data.label,
          signature: n.data.signature,
          position: n.position,
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };

      await fetch('http://localhost:8000/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphPayload),
      });

      const exec = await fetch(`http://localhost:8000/execute/${graphId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'World', message: 'hello' }),
      });
      const result = await exec.json();
      setRunOutput(result);
      setState({
        messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: result.output?.greeting || 'Hello!' }],
        current: 'end',
        tokens: result.tokens_used,
      });
    } catch (e: any) {
      setRunOutput({ error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-indigo-600 flex items-center justify-center text-sm font-bold">LG</div>
          <h1 className="text-lg font-semibold">LangGraph Builder</h1>
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">dark</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {running ? 'Running...' : 'Run'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            fitView
            className="bg-zinc-900"
          >
            <Controls className="bg-zinc-800 border-zinc-700" />
            <MiniMap className="bg-zinc-800" />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#3f3f46" />
          </ReactFlow>

          {/* State overlay */}
          <div className="absolute bottom-4 left-4 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900/90 p-3 text-xs shadow-xl backdrop-blur">
            <div className="mb-1 font-medium text-zinc-300">State</div>
            <pre className="overflow-auto text-zinc-400">{JSON.stringify(state, null, 2)}</pre>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="flex w-96 flex-col border-l border-zinc-800 bg-zinc-900">
          {/* Node details */}
          <div className="flex-1 overflow-auto p-4">
            {selected ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">{selected.data.label as string}</h2>
                  <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Type</div>
                <div className="mb-4 rounded bg-zinc-800 px-2 py-1 text-sm">{selected.data.type as string}</div>

                <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Output Schema</div>
                <pre className="mb-4 max-h-48 overflow-auto rounded bg-zinc-800 p-2 text-xs text-emerald-300">
                  {JSON.stringify((selected.data.signature as any)?.output_schema || {}, null, 2)}
                </pre>

                <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Input Schema</div>
                <pre className="max-h-40 overflow-auto rounded bg-zinc-800 p-2 text-xs text-sky-300">
                  {JSON.stringify((selected.data.signature as any)?.input_schema || {}, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Click a node to see its signature and schemas.</div>
            )}
          </div>

          {/* Chat */}
          <div className="border-t border-zinc-800 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Chat to create nodes
            </div>
            <div className="flex gap-2">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder='e.g. "create weather agent with API key"'
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleChat}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500"
              >
                Go
              </button>
            </div>
            {chatResult && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-800 p-2 text-xs text-zinc-400">
                {chatResult}
              </pre>
            )}
            {runOutput && (
              <div className="mt-3">
                <div className="mb-1 text-xs uppercase text-zinc-500">Last Run</div>
                <pre className="max-h-32 overflow-auto rounded bg-zinc-800 p-2 text-xs text-emerald-300">
                  {JSON.stringify(runOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
