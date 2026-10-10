'use client';

import { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  addEdge,
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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, MessageSquare, X, GripVertical, Trash2, Pencil } from 'lucide-react';

const typeStyles: Record<string, string> = {
  start: 'border-emerald-500 bg-emerald-950',
  end: 'border-rose-500 bg-rose-950',
  agent: 'border-indigo-500 bg-indigo-950',
  llm: 'border-violet-500 bg-violet-950',
  tool: 'border-amber-500 bg-amber-950',
};

function CustomNode({ data }: { data: any }) {
  const style = typeStyles[data.type] || 'border-zinc-600 bg-zinc-800';
  return (
    <div className={`min-w-[150px] rounded-lg border-2 px-4 py-3 text-center shadow-lg ${style}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" />
      <div className="text-sm font-medium text-zinc-100">{data.label}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">{data.type}</div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-zinc-300" />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const defaultNodes: Node[] = [
  {
    id: 'start',
    type: 'custom',
    position: { x: 40, y: 200 },
    data: {
      label: 'Start',
      type: 'start',
      tools: [],
      signature: {
        input_schema: { type: 'object', properties: {}, required: [] },
        output_schema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    },
  },
  {
    id: 'hello',
    type: 'custom',
    position: { x: 260, y: 280 },
    data: {
      label: 'Say Hello',
      type: 'llm',
      tools: [],
      signature: {
        name: 'say_hello',
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Name to greet' } },
          required: ['name'],
        },
        output_schema: { type: 'object', properties: { greeting: { type: 'string' } } },
        description: 'Calls LLM to generate a greeting',
      },
      code: `def say_hello(state):
    name = state.get("name", "World")
    # LLM call (Groq)
    response = llm.invoke(f"Say hello to {name} in a friendly way")
    return {"greeting": response.content}`,
    },
  },
  {
    id: 'weather',
    type: 'custom',
    position: { x: 260, y: 80 },
    data: {
      label: 'Weather Agent',
      type: 'agent',
      tools: [
        { name: 'get_weather', description: 'Fetch temp + wind for a city' },
        { name: 'web_search', description: 'Optional web search for context' },
      ],
      signature: {
        name: 'weather_agent',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            query: { type: 'string', description: 'What to return (temp, wind, etc.)' },
          },
          required: ['location'],
        },
        output_schema: {
          type: 'object',
          properties: {
            temperature: { type: 'number' },
            wind_speed: { type: 'number' },
            conditions: { type: 'string' },
          },
        },
        description: 'Reactive agent — can call multiple tools',
      },
      code: `def weather_agent(state):
    location = state["location"]
    # Tool call 1
    weather = get_weather(location, api_key=state.get("api_key"))
    # Optional tool call 2 if more context needed
    # extra = web_search(f"weather {location}")
    return {
        "temperature": weather["temp"],
        "wind_speed": weather["wind"],
        "conditions": weather["conditions"],
    }`,
    },
  },
  {
    id: 'end',
    type: 'custom',
    position: { x: 520, y: 200 },
    data: {
      label: 'End',
      type: 'end',
      tools: [],
      signature: {
        input_schema: { type: 'object', properties: { result: { type: 'string' } } },
        output_schema: { type: 'object', properties: { final: { type: 'string' } } },
      },
    },
  },
];

const defaultEdges: Edge[] = [
  { id: 'e1', source: 'start', target: 'hello', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } },
  { id: 'e2', source: 'start', target: 'weather', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } },
  { id: 'e3', source: 'hello', target: 'end', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } },
  { id: 'e4', source: 'weather', target: 'end', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } },
];

function SchemaTable({ schema }: { schema: any }) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const rows = Object.entries(props);
  if (rows.length === 0) return <div className="text-xs text-zinc-500">None</div>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="pb-1">Field</th>
          <th className="pb-1">Type</th>
          <th className="pb-1">Req</th>
          <th className="pb-1">Desc</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, val]: any) => (
          <tr key={key} className="border-t border-zinc-800">
            <td className="py-1 font-mono text-zinc-200">{key}</td>
            <td className="py-1 text-emerald-400">{val.type || 'any'}</td>
            <td className="py-1">{required.has(key) ? 'yes' : 'no'}</td>
            <td className="py-1 text-zinc-400">{val.description || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Page() {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [chat, setChat] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<any>(null);
  const [state, setState] = useState<any>({});
  const [sidebarWidth, setSidebarWidth] = useState(440);
  const [chatHeight, setChatHeight] = useState(180);
  const [showRunForm, setShowRunForm] = useState(false);
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState('');
  const dragRef = useRef(false);
  const chatDragRef = useRef(false);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } }, eds)),
    [setEdges]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelected(node);
    setSelectedEdge(null);
    setRenaming(node.data.label as string);
  };

  const onEdgeClick = (_: any, edge: Edge) => {
    setSelectedEdge(edge);
    setSelected(null);
  };

  const deleteSelected = () => {
    if (selected) {
      setNodes((nds) => nds.filter((n) => n.id !== selected.id));
      setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
      setSelected(null);
    }
    if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  };

  const renameNode = () => {
    if (!selected || !renaming.trim()) return;
    setNodes((nds) => nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, label: renaming } } : n)));
    setSelected((s) => (s ? { ...s, data: { ...s.data, label: renaming } } : s));
  };

  const extractJSON = (text: string) => {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fence ? fence[1] : text;
    try { return JSON.parse(raw.trim()); } catch { return null; }
  };

  const handleChat = async () => {
    if (!chat.trim()) return;
    setChatResult('Thinking...');
    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chat }),
      });
      const data = await res.json();
      setChatResult(JSON.stringify(data, null, 2));
      let generated = data.generated;
      if (!generated && data.raw) generated = extractJSON(data.raw);
      if (generated) {
        const label = generated.label || generated.name || generated.signature?.name || 'New Node';
        const newNode: Node = {
          id: `node-${Date.now()}`,
          type: 'custom',
          position: { x: 200 + Math.random() * 150, y: 100 + Math.random() * 120 },
          data: {
            label,
            type: generated.type || 'agent',
            tools: generated.tools || [],
            signature: generated.signature || generated,
            code: generated.code || `def ${label.toLowerCase().replace(/\\s+/g, '_')}(state):\n    # generated\n    return state`,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelected(newNode);
      }
    } catch (e: any) {
      setChatResult('Error: ' + e.message);
    }
  };

  // Collect required inputs from all nodes
  const collectRequiredInputs = () => {
    const fields: { key: string; desc: string }[] = [];
    const seen = new Set<string>();
    nodes.forEach((n) => {
      const schema = (n.data.signature as any)?.input_schema;
      const req = schema?.required || [];
      const props = schema?.properties || {};
      req.forEach((k: string) => {
        if (!seen.has(k)) {
          seen.add(k);
          fields.push({ key: k, desc: props[k]?.description || k });
        }
      });
    });
    return fields;
  };

  const openRun = () => {
    const fields = collectRequiredInputs();
    const initial: Record<string, string> = {};
    fields.forEach((f) => { initial[f.key] = runInputs[f.key] || ''; });
    setRunInputs(initial);
    setShowRunForm(true);
  };

  const doRun = async () => {
    setShowRunForm(false);
    setRunning(true);
    // Simple local simulation based on what was requested
    const result: any = { inputs: { ...runInputs } };
    if (runInputs.name) result.greeting = `Hello, ${runInputs.name}!`;
    if (runInputs.location) {
      result.weather = {
        location: runInputs.location,
        temperature: 22,
        wind_speed: 12,
        conditions: 'Partly cloudy (simulated)',
        note: 'Real API call would happen here with api_key',
      };
    }
    setRunOutput(result);
    setState({ ...runInputs, ...result });
    setRunning(false);
  };

  const onMouseDown = () => { dragRef.current = true; document.body.style.cursor = 'col-resize'; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const w = window.innerWidth - e.clientX;
      if (w > 320 && w < 760) setSidebarWidth(w);
    }
    if (chatDragRef.current) {
      const h = window.innerHeight - e.clientY - 20;
      if (h > 100 && h < 400) setChatHeight(h);
    }
  };
  const onMouseUp = () => {
    dragRef.current = false;
    chatDragRef.current = false;
    document.body.style.cursor = '';
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-sm font-bold">LG</div>
          <h1 className="text-lg font-semibold">LangGraph Builder</h1>
        </div>
        <div className="flex items-center gap-2">
          {(selected || selectedEdge) && (
            <button onClick={deleteSelected} className="flex items-center gap-1 rounded border border-red-800 bg-red-950 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button onClick={openRun} disabled={running} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
            <Play className="h-4 w-4" /> {running ? 'Running...' : 'Run'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-zinc-950"
          >
            <Controls className="!bg-zinc-800 !border-zinc-700" />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#3f3f46" />
          </ReactFlow>
          <div className="absolute bottom-4 left-4 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-xs">
            <div className="mb-1 font-medium text-zinc-300">State</div>
            <pre className="max-h-28 overflow-auto text-zinc-400">{JSON.stringify(state, null, 2)}</pre>
          </div>
        </div>

        <div onMouseDown={onMouseDown} className="flex w-1.5 cursor-col-resize items-center justify-center bg-zinc-800 hover:bg-indigo-600">
          <GripVertical className="h-4 w-4 text-zinc-500" />
        </div>

        <aside style={{ width: sidebarWidth }} className="flex flex-col border-l border-zinc-800 bg-zinc-900">
          <div className="flex-1 overflow-auto p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{selected.data.label as string}</h2>
                  <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex gap-2">
                  <input value={renaming} onChange={(e) => setRenaming(e.target.value)} className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm" />
                  <button onClick={renameNode} className="rounded bg-zinc-700 px-2 py-1 text-xs"><Pencil className="h-3 w-3" /></button>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Type</div>
                  <div className="rounded bg-zinc-800 px-2 py-1 text-sm">{selected.data.type as string}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Tools</div>
                  {((selected.data.tools as any[]) || []).length === 0 ? (
                    <div className="text-xs text-zinc-500">No tools</div>
                  ) : (
                    <ul className="space-y-1">
                      {(selected.data.tools as any[]).map((t) => (
                        <li key={t.name} className="rounded bg-zinc-800 px-2 py-1.5 text-xs">
                          <span className="font-mono text-amber-300">{t.name}</span>
                          <span className="ml-2 text-zinc-400">{t.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Input</div>
                  <div className="rounded border border-zinc-800 p-2"><SchemaTable schema={(selected.data.signature as any)?.input_schema} /></div>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Output</div>
                  <div className="rounded border border-zinc-800 p-2"><SchemaTable schema={(selected.data.signature as any)?.output_schema} /></div>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Node code</div>
                  <pre className="max-h-48 overflow-auto rounded bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
                    {(selected.data.code as string) || 'No code'}
                  </pre>
                </div>
              </div>
            ) : selectedEdge ? (
              <div>
                <h2 className="mb-2 font-semibold">Edge</h2>
                <div className="text-sm text-zinc-400">{selectedEdge.source} → {selectedEdge.target}</div>
                <button onClick={deleteSelected} className="mt-4 flex items-center gap-1 rounded bg-red-900 px-3 py-1.5 text-sm text-red-200">
                  <Trash2 className="h-4 w-4" /> Delete edge
                </button>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Click a node or edge.</div>
            )}
          </div>

          {/* Stretchable chat */}
          <div
            onMouseDown={() => { chatDragRef.current = true; document.body.style.cursor = 'row-resize'; }}
            className="flex h-2 cursor-row-resize items-center justify-center bg-zinc-800 hover:bg-indigo-600"
          />
          <div style={{ height: chatHeight }} className="flex flex-col border-t border-zinc-800 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" /> Chat
            </div>
            <div className="flex gap-2">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder="Ask anything — weather, new agent, etc."
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button onClick={handleChat} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500">Go</button>
            </div>
            {chatResult && (
              <pre className="mt-2 flex-1 overflow-auto rounded bg-zinc-800 p-2 text-xs text-zinc-400">{chatResult}</pre>
            )}
          </div>
        </aside>
      </div>

      {showRunForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold">Required inputs</h3>
            {collectRequiredInputs().length === 0 ? (
              <div className="mb-4 text-sm text-zinc-400">No required inputs. Ready to run.</div>
            ) : (
              collectRequiredInputs().map((f) => (
                <div key={f.key} className="mb-3">
                  <label className="mb-1 block text-xs uppercase text-zinc-500">{f.key}</label>
                  <input
                    value={runInputs[f.key] || ''}
                    onChange={(e) => setRunInputs({ ...runInputs, [f.key]: e.target.value })}
                    placeholder={f.desc}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                  />
                </div>
              ))
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowRunForm(false)} className="rounded px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
              <button onClick={doRun} className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium">Execute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
