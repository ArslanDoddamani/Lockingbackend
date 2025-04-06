import express from 'express';
import bodyParser from 'body-parser';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Fake table data
const tableData = [
  { id: 1, name: 'Row 1', value: 'A' },
  { id: 2, name: 'Row 2', value: 'B' },
  { id: 3, name: 'Row 3', value: 'C' }
];

// In-memory lock store: { [rowId]: { lockedBy, lockedAt } }
const rowLocks = {};

// === API Routes ===

// Send table data with lock info
app.get('/api/table', (req, res) => {
  const result = tableData.map(row => ({
    ...row,
    lockedBy: rowLocks[row.id]?.lockedBy || null
  }));
  res.json(result);
});

// Lock a row
app.post('/api/lock-row', (req, res) => {
  const { rowId, userId } = req.body;

  if (!rowId || !userId) return res.status(400).json({ message: 'rowId and userId required' });

  const existingLock = rowLocks[rowId];
  if (existingLock) {
    return res.status(403).json({ message: 'Row already locked', lockedBy: existingLock.lockedBy });
  }

  rowLocks[rowId] = {
    lockedBy: userId,
    lockedAt: new Date()
  };

  broadcast({
    type: 'lock',
    rowId,
    lockedBy: userId
  });

  res.json({ message: 'Row locked' });
});

// Unlock a row
app.post('/api/unlock-row', (req, res) => {
  const { rowId, userId } = req.body;

  if (!rowId || !userId) return res.status(400).json({ message: 'rowId and userId required' });

  const existingLock = rowLocks[rowId];
  if (!existingLock || existingLock.lockedBy !== userId) {
    return res.status(403).json({ message: 'You cannot unlock this row' });
  }

  delete rowLocks[rowId];

  broadcast({
    type: 'unlock',
    rowId
  });

  res.json({ message: 'Row unlocked' });
});

// === Server & WebSocket Setup ===

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  console.log('🟢 Client connected');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('🔴 Client disconnected');
  });
});

// Broadcast helper
function broadcast(message) {
  const msgString = JSON.stringify(message);
  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(msgString);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🚀 HTTP & WebSocket server running at http://localhost:${PORT}`);
});
