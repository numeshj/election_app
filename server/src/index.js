import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
const districtsPath = path.join(process.cwd(), 'src', 'districts.json');
let districts = [];
try { districts = JSON.parse(fs.readFileSync(districtsPath, 'utf-8')); } catch { districts = []; }

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// In-memory storage (replace with DB later)
const results = [];

// Get all results
app.get('/api/results', (req, res) => {
  res.json(results);
});

// District meta data
app.get('/api/districts', (req, res) => {
  res.json(districts);
});

// Simple timestamped logger
function log(...args){
  console.log(new Date().toISOString(), '-', ...args);
}

// Create / upsert result
app.post('/api/results', (req, res) => {
  const payload = req.body;
  if(!payload || !payload.summary || !Array.isArray(payload.by_party)) {
    log('RESULT REJECTED: invalid payload structure');
    return res.status(400).json({ error: 'Invalid payload'});
  }

  // Determine natural key for de-duplication / override.
  // Priority: polling division (pd_code) then fallback to sequence_number.
  const pdCode = payload.pd_code || payload.pdCode;
  const seq = payload.sequence_number || payload.sequenceNumber;

  let matchIndex = -1;
  if (pdCode) {
    matchIndex = results.findIndex(r => r.pd_code === pdCode);
  }
  if (matchIndex === -1 && seq) {
    matchIndex = results.findIndex(r => r.sequence_number === seq);
  }

  if (matchIndex !== -1) {
    // Override existing record, keep original id & createdAt, add updatedAt
    const existing = results[matchIndex];
    const updated = { ...existing, ...payload, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    results[matchIndex] = updated;
    log('RESULT OVERRIDDEN', `{id:${existing.id}}`, `pd_code:${pdCode||'-'}`, `seq:${seq||'-'}`);
    io.emit('result:updated', updated);
    io.emit('results:all', results);
    return res.status(200).json({ ...updated, overridden: true });
  }

  // New record insert
  const record = { id: uuid(), createdAt: new Date().toISOString(), ...payload };
  results.push(record);
  log('RESULT CREATED', `{id:${record.id}}`, `pd_code:${pdCode||'-'}`, `seq:${seq||'-'}`);
  io.emit('result:new', record);
  io.emit('results:all', results);
  res.status(201).json({ ...record, overridden: false });
});

io.on('connection', (socket) => {
  log('CLIENT CONNECTED', socket.id);
  socket.emit('results:all', results);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => log(`Server listening on ${PORT}`));
