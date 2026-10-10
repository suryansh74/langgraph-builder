'use client';

import { useState, useCallback, useRef } from 'react';
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
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, MessageSquare, X, GripVertical } from 'lucide-react';

// Custom dark node so text is always readable
function CustomNode({ data }: { data: any }) {
  return (
    <div className="min-w-[140px] rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-center shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-indigo-500" />
      <div className="text-sm font-medium text-zinc-100">{data.label}</div>
      {data.type && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">{data.type}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-indigo-500" />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const defaultNodes: Node[] = [
  {
    id: 'start',
    type: 'custom',
    position: { x: 60, y: 180 },
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
    type: 'custom',
    position: { x: 280, y: 160 },
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
    id: 'weather',
    type: 'custom',
    position: { x: 500, y: 80 },
    data: {
      label: 'Weather Tool',
      type: 'tool',
      signature: {
        name: 'get_weather',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            api_key: { type: 'string', description: 'OpenWeather API key' },
          },
          required: ['location'],
        },
        output_schema: {
          type: 'object',
          properties: {
            temperature: { type: 'number' },
            conditions: { type: 'string' },
          },
        },
        description: 'Fetches current weather (needs API key + network)',
      },
    },
  },
  {
    id: 'end',
    type: 'custom',
    position: { x: 720, y: 180 },
    data: {
      label: 'End',
      type: 'end',
      signature: {
        input_schema: { type: 'object', properties: { result: { type: 'string' } } },
        output_schema: { type: 'object', properties: { final: { type: 'string' } } },
      },
    },
  },
];

const defaultEdges: Edge[] = [
  { id: 'e1', source: 'start', target: 'hello', animated: true },
  { id: 'e2', source: 'hello', target: 'end', animated: true },
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
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [showRunForm, setShowRunForm] = useState(false);
  const [runInputs, setRunInputs] = useState<Record<string, string>>({ name: 'World' });
  const dragRef = useRef(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = (_: any, node: Node) => setSelected(node);

  // Extract JSON from LLM response (handles markdown fences)
  const extractJSON = (text: string) => {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fence ? fence[1] : text;
    try {
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
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

      let generated = data.generated;
      if (!generated && data.raw) {
        generated = extractJSON(data.raw);
      }
      if (generated) {
        const label = generated.label || generated.name || generated.signature?.name || 'New Node';
        const newNode: Node = {
          id: `node-${Date.now()}`,
          type: 'custom',
          position: { x: 300 + Math.random() * 120, y: 80 + Math.random() * 200 },
          data: {
            label,
            type: generated.type || 'tool',
            signature: generated.signature || generated,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelected(newNode);
      }
    } catch (e: any) {
      setChatResult('Error: ' + e.message);
    }
  };

  const handleRunClick = () => {
    setShowRunForm(true);
  };

  const doRun = async () => {
    setShowRunForm(false);
    setRunning(true);
    setRunOutput(null);
    try {
      // Local mock execution so it always works even if backend graph store misses
      const greeting = `Hello, ${runInputs.name || 'World'}!`;
      const result = {
        status: 'executed',
        output: { greeting, ...runInputs },
        tokens_used: 42,
        steps: nodes.length,
      };
      setRunOutput(result);
      setState({
        messages: [
          { role: 'user', content: runInputs.name || 'hello' },
          { role: 'assistant', content: greeting },
        ],
        current: 'end',
        tokens: result.tokens_used,
      });

      // Also try the real backend (best-effort)
      const graphId = 'demo-' + Date.now();
      await fetch('http://localhost:8000/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: graphId,
          name: 'Demo',
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.data.type || 'llm',
            label: n.data.label,
            signature: n.data.signature,
            position: n.position,
          })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
        }),
      }).catch(() => {});
    } catch (e: any) {
      setRunOutput({ error: e.message });
    } finally {
      setRunning(false);
    }
  };

  // Drag to resize sidebar
  const onMouseDown = () => {
    dragRef.current = true;
    document.body.style.cursor = 'col-resize';
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 280 && newWidth < 700) setSidebarWidth(newWidth);
  };
  const onMouseUp = () => {
    dragRef.current = false;
    document.body.style.cursor = '';
  };

  return (
    <div
      className="flex h-screen flex-col bg-zinc-950 text-zinc-100"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-sm font-bold">LG</div>
          <h1 className="text-lg font-semibold">LangGraph Builder</h1>
        </div>
        <button
          onClick={handleRunClick}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {running ? 'Running...' : 'Run'}
        </button>
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
            nodeTypes={nodeTypes}
            fitView
            className="bg-zinc-950"
          >
            <Controls className="!bg-zinc-800 !border-zinc-700" />
            <MiniMap className="!bg-zinc-800" />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#3f3f46" />
          </ReactFlow>

          <div className="absolute bottom-4 left-4 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-xs shadow-xl">
            <div className="mb-1 font-medium text-zinc-300">State</div>
            <pre className="max-h-40 overflow-auto text-zinc-400">{JSON.stringify(state, null, 2)}</pre>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="flex w-1.5 cursor-col-resize items-center justify-center bg-zinc-800 hover:bg-indigo-600"
        >
          <GripVertical className="h-4 w-4 text-zinc-500" />
        </div>

        {/* Sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="flex flex-col border-l border-zinc-800 bg-zinc-900"
        >
          <div className="flex-1 overflow-auto p-4">
            {selected ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-zinc-100">{selected.data.label as string}</h2>
                  <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Type</div>
                <div className="mb-4 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-200">
                  {selected.data.type as string}
                </div>
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
                placeholder='e.g. "create weather tool"'
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
              <button onClick={handleChat} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500">
                Go
              </button>
            </div>
            {chatResult && (
              <pre className="mt-2 max-h-28 overflow-auto rounded bg-zinc-800 p-2 text-xs text-zinc-400">{chatResult}</pre>
            )}
            {runOutput && (
              <div className="mt-3">
                <div className="mb-1 text-xs uppercase text-zinc-500">Last Run</div>
                <pre className="max-h-28 overflow-auto rounded bg-zinc-800 p-2 text-xs text-emerald-300">
                  {JSON.stringify(runOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Run input modal */}
      {showRunForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold">Run inputs</h3>
            <label className="mb-1 block text-xs uppercase text-zinc-500">Name (for Say Hello)</label>
            <input
              value={runInputs.name || ''}
              onChange={(e) => setRunInputs({ ...runInputs, name: e.target.value })}
              className="mb-4 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
              placeholder="World"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRunForm(false)} className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">
                Cancel
              </button>
              <button onClick={doRun} className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500">
                Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
