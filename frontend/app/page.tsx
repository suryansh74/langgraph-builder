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
import { Play, MessageSquare, X, GripVertical, Trash2, Pencil, GitBranch } from 'lucide-react';

// Clearer type names (not just start/end)
const typeStyles: Record<string, string> = {
  entry: 'border-emerald-500 bg-emerald-950',
  exit: 'border-rose-500 bg-rose-950',
  agent: 'border-indigo-500 bg-indigo-950',
  llm: 'border-violet-500 bg-violet-950',
  tool: 'border-amber-500 bg-amber-950',
  func: 'border-sky-500 bg-sky-950',
  branch: 'border-orange-500 bg-orange-950',
};

const typeLabels: Record<string, string> = {
  entry: 'ENTRY',
  exit: 'EXIT',
  agent: 'AGENT',
  llm: 'LLM',
  tool: 'TOOL',
  func: 'FUNC',
  branch: 'BRANCH',
};

function CustomNode({ data }: { data: any }) {
  const style = typeStyles[data.type] || 'border-zinc-600 bg-zinc-800';
  return (
    <div className={`min-w-[150px] rounded-lg border-2 px-4 py-3 text-center shadow-lg ${style}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" />
      <div className="text-sm font-medium text-zinc-100">{data.label}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">
        {typeLabels[data.type] || data.type}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-zinc-300" />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const defaultNodes: Node[] = [
  {
    id: 'entry',
    type: 'custom',
    position: { x: 40, y: 180 },
    data: {
      label: 'Entry',
      type: 'entry',
      tools: [],
      config: {},
      signature: { input_schema: { properties: {}, required: [] }, output_schema: { properties: {} } },
    },
  },
  {
    id: 'exit',
    type: 'custom',
    position: { x: 480, y: 180 },
    data: {
      label: 'Exit',
      type: 'exit',
      tools: [],
      config: {},
      signature: { input_schema: { properties: {} }, output_schema: { properties: {} } },
    },
  },
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
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [chat, setChat] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<any>(null);
  const [stateHistory, setStateHistory] = useState<{ node: string; state: any; changed: string[] }[]>([]);
  const [showStateView, setShowStateView] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(440);
  const [chatHeight, setChatHeight] = useState(200);
  const [showRunForm, setShowRunForm] = useState(false);
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState('');
  const dragRef = useRef(false);
  const chatDragRef = useRef(false);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' } }, eds)
      ),
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
    setChatResult('NodeSmith...');
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
        const label = generated.label || generated.signature?.name || 'New';
        // Preserve any api_key mentioned in chat into config
        const keyMatch = chat.match(/api[_ ]?key[=: ]+([A-Za-z0-9_-]+)/i);
        const config = { ...(generated.config || {}) };
        if (keyMatch) config.api_key = keyMatch[1];
        const newNode: Node = {
          id: `n-${Date.now()}`,
          type: 'custom',
          position: { x: 160 + Math.random() * 140, y: 80 + Math.random() * 140 },
          data: {
            label,
            type: generated.type || 'tool',
            tools: generated.tools || [],
            signature: generated.signature || generated,
            code: generated.code || '# no code',
            config,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelected(newNode);
      }
    } catch (e: any) {
      setChatResult('Error: ' + e.message);
    }
  };

  // Only ask for non-secret required fields at runtime
  const collectRuntimeInputs = () => {
    const fields: { key: string; desc: string }[] = [];
    const seen = new Set<string>();
    const secrets = new Set(['api_key', 'apikey', 'key', 'token', 'secret']);
    nodes.forEach((n) => {
      const schema = (n.data.signature as any)?.input_schema;
      const req = schema?.required || [];
      const props = schema?.properties || {};
      req.forEach((k: string) => {
        if (secrets.has(k.toLowerCase())) return; // skip secrets
        if (!seen.has(k)) {
          seen.add(k);
          fields.push({ key: k, desc: props[k]?.description || k });
        }
      });
    });
    return fields;
  };

  const openRun = () => {
    const fields = collectRuntimeInputs();
    const initial: Record<string, string> = {};
    fields.forEach((f) => { initial[f.key] = runInputs[f.key] || ''; });
    setRunInputs(initial);
    setShowRunForm(true);
  };

  const doRun = async () => {
    setShowRunForm(false);
    setRunning(true);
    const history: { node: string; state: any; changed: string[] }[] = [];
    let current: any = { ...runInputs };
    history.push({ node: 'Entry', state: { ...current }, changed: Object.keys(current) });

    for (const n of nodes) {
      if (n.data.type === 'entry' || n.data.type === 'exit') continue;
      const prev = { ...current };
      const cfg = (n.data.config as any) || {};
      if ((n.data.type === 'tool' || n.data.type === 'func') && String(n.data.label).toLowerCase().includes('weather')) {
        if (!cfg.api_key) {
          current = { ...current, error: 'No API key stored on tool' };
        } else {
          // Real call would go here; for now mark that key is present
          current = { ...current, temperature: 22, wind_speed: 9, conditions: 'Key present — call would run' };
        }
      } else if (n.data.type === 'llm') {
        current = { ...current, reply: `LLM response for ${JSON.stringify(runInputs)}` };
      }
      const changed = Object.keys(current).filter((k) => current[k] !== prev[k]);
      history.push({ node: n.data.label as string, state: { ...current }, changed });
    }
    history.push({ node: 'Exit', state: { ...current }, changed: [] });
    setStateHistory(history);
    setRunOutput(current);
    setRunning(false);
  };

  const onMouseDown = () => { dragRef.current = true; document.body.style.cursor = 'col-resize'; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const w = window.innerWidth - e.clientX;
      if (w > 320 && w < 760) setSidebarWidth(w);
    }
    if (chatDragRef.current) {
      const h = window.innerHeight - e.clientY - 16;
      if (h > 120 && h < 420) setChatHeight(h);
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
          <span className="text-xs text-zinc-500">NodeSmith</span>
        </div>
        <div className="flex items-center gap-2">
          {stateHistory.length > 0 && (
            <button
              onClick={() => setShowStateView(true)}
              className="flex items-center gap-1 rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              <GitBranch className="h-4 w-4" /> State
            </button>
          )}
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
                  <div className="rounded bg-zinc-800 px-2 py-1 text-sm">{typeLabels[selected.data.type as string] || selected.data.type}</div>
                </div>
                {(selected.data.config as any)?.api_key && (
                  <div className="rounded bg-amber-950 px-2 py-1 text-xs text-amber-300">
                    API key stored: {(selected.data.config as any).api_key.slice(0, 6)}…
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs uppercase text-zinc-500">Tools</div>
                  {((selected.data.tools as any[]) || []).length === 0 ? (
                    <div className="text-xs text-zinc-500">None</div>
                  ) : (
                    <ul className="space-y-1">
                      {(selected.data.tools as any[]).map((t: any) => (
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
                  <div className="mb-1 text-xs uppercase text-zinc-500">Code</div>
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
              <div className="text-sm text-zinc-500">
                Types: ENTRY · EXIT · AGENT · LLM · TOOL · FUNC · BRANCH
              </div>
            )}
          </div>

          <div
            onMouseDown={() => { chatDragRef.current = true; document.body.style.cursor = 'row-resize'; }}
            className="flex h-2 cursor-row-resize items-center justify-center bg-zinc-800 hover:bg-indigo-600"
          />
          <div style={{ height: chatHeight }} className="flex flex-col border-t border-zinc-800 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" /> NodeSmith
            </div>
            <div className="flex gap-2">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder="make a weather tool, api key is ..."
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
            <h3 className="mb-3 text-lg font-semibold">Runtime inputs</h3>
            <p className="mb-3 text-xs text-zinc-500">API keys are not asked here — they stay on the tool.</p>
            {collectRuntimeInputs().length === 0 ? (
              <div className="mb-4 text-sm text-zinc-400">No runtime fields needed.</div>
            ) : (
              collectRuntimeInputs().map((f) => (
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

      {/* Separate state graph view */}
      {showStateView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-700 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h3 className="font-semibold">State transitions</h3>
              <button onClick={() => setShowStateView(false)} className="text-zinc-400 hover:text-zinc-200"><X /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-4">
                {stateHistory.map((step, i) => (
                  <div key={i} className="flex items-center">
                    <div className="min-w-[160px] rounded border border-zinc-700 bg-zinc-800 p-2 text-xs">
                      <div className="mb-1 font-medium text-zinc-300">{step.node}</div>
                      {Object.entries(step.state).map(([k, v]) => (
                        <div key={k} className={step.changed.includes(k) ? 'text-red-400' : 'text-zinc-400'}>
                          {k}: {String(v).slice(0, 24)}
                        </div>
                      ))}
                    </div>
                    {i < stateHistory.length - 1 && <div className="mx-1 text-zinc-500">→</div>}
                  </div>
                ))}
              </div>
              <table className="mt-4 w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="pb-1">Step</th>
                    <th className="pb-1">Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {stateHistory.map((s, i) => (
                    <tr key={i} className="border-t border-zinc-800">
                      <td className="py-1">{s.node}</td>
                      <td className="py-1 text-red-400">{s.changed.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
