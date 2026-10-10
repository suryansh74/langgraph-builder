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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: 'start', type: 'input', position: { x: 100, y: 100 }, data: { label: 'Start' } },
  { id: 'agent1', position: { x: 300, y: 100 }, data: { label: 'Agent Node (collapsible subgraph support)' } },
];

const initialEdges: Edge[] = [{ id: 'e1', source: 'start', target: 'agent1' }];

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [chat, setChat] = useState('');
  const [response, setResponse] = useState('');

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleChat = async () => {
    const res = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: chat }),
    });
    const data = await res.json();
    setResponse(JSON.stringify(data, null, 2));
    // TODO: parse and add generated node to canvas
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '70%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <MiniMap />
          <Background />
        </ReactFlow>
      </div>
      <div style={{ height: '30%', padding: '10px', borderTop: '1px solid #ccc' }}>
        <h3>Chat to create tools/agents (e.g. "create weather agent with API key")</h3>
        <input
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="Describe agent or tool..."
          style={{ width: '70%', padding: '8px' }}
        />
        <button onClick={handleChat} style={{ marginLeft: '10px', padding: '8px' }}>Generate</button>
        <pre style={{ marginTop: '10px', background: '#f5f5f5', padding: '10px', maxHeight: '100px', overflow: 'auto' }}>
          {response}
        </pre>
      </div>
    </div>
  );
}
