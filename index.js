import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Or set specific origin like 'http://localhost:5173'
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

let table = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: `${String.fromCharCode(65 + (i % 26))}${i}`, // Cycles through A-Z
  lockedBy: null,
  lockedAt: null
}));

const LOCK_EXPIRE_MS = 5 * 60 * 1000; // 5 minutes

function clearExpiredLocks() {
  const now = Date.now();
  table = table.map(row => {
    if (row.lockedBy && now - row.lockedAt > LOCK_EXPIRE_MS) {
      return { ...row, lockedBy: null, lockedAt: null };
    }
    return row;
  });
}

setInterval(() => {
  clearExpiredLocks();
  io.emit('update', table);
}, 10_000);

app.get('/api/table', (req, res) => {
  clearExpiredLocks();
  res.json(table);
});

app.post('/api/lock-row', (req, res) => {
  const { rowId, userId } = req.body;
  const row = table.find(r => r.id === rowId);
  if (!row) return res.status(404).json({ message: 'Row not found' });

  if (row.lockedBy && row.lockedBy !== userId) {
    return res.status(403).json({ message: 'Row already locked' });
  }

  row.lockedBy = userId;
  row.lockedAt = Date.now();
  io.emit('update', table);
  res.json({ success: true });
});

app.post('/api/unlock-row', (req, res) => {
  const { rowId, userId } = req.body;
  const row = table.find(r => r.id === rowId);
  if (!row) return res.status(404).json({ message: 'Row not found' });

  if (row.lockedBy !== userId) {
    return res.status(403).json({ message: 'You don’t own this lock' });
  }

  row.lockedBy = null;
  row.lockedAt = null;
  io.emit('update', table);
  res.json({ success: true });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
