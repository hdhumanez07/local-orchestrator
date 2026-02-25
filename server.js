const express = require('express');
const http = require('node:http');
const WebSocket = require('ws');
const { spawn, exec } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Microservices Config ─────────────────────────────────────────────────────
const BASE_PATH = path.resolve(__dirname, '..');

const MICROSERVICES = [
  {
    id: 'api-gateway',
    name: 'API Gateway',
    path: path.join(BASE_PATH, 'bcs-mortgage-api-gateway'),
    port: 3000,
    isGateway: true,
    color: '#6366f1',
    icon: '🌐',
    description: 'Entry point - Routes & Security',
  },
  {
    id: 'api-composer',
    name: 'API Composer',
    path: path.join(BASE_PATH, 'bcs-mortgage-api-composer'),
    port: 3001,
    isGateway: true,
    color: '#8b5cf6',
    icon: '🔀',
    description: 'Entry point - BFF & Aggregation',
  },
  {
    id: 'commons',
    name: 'Commons',
    path: path.join(BASE_PATH, 'bcs-mortgage-commons'),
    port: 3002,
    color: '#06b6d4',
    icon: '📦',
    description: 'Shared utilities & libraries',
  },
  {
    id: 'documents',
    name: 'Documents',
    path: path.join(BASE_PATH, 'bcs-mortgage-documents'),
    port: 3003,
    color: '#10b981',
    icon: '📄',
    description: 'Document management service',
  },
  {
    id: 'notification',
    name: 'Notification',
    path: path.join(BASE_PATH, 'bcs-mortgage-notification'),
    port: 3004,
    color: '#f59e0b',
    icon: '🔔',
    description: 'Notifications & alerts service',
  },
  {
    id: 'batch',
    name: 'Batch',
    path: path.join(BASE_PATH, 'bcs-mortgage-batch'),
    port: 3005,
    color: '#ef4444',
    icon: '⚙️',
    description: 'Batch processing service',
  },
  {
    id: 'reports',
    name: 'Reports',
    path: path.join(BASE_PATH, 'bcs-mortgage-reports'),
    port: 3006,
    color: '#ec4899',
    icon: '📊',
    description: 'Reports generation service',
  },
  {
    id: 'simulator',
    name: 'Simulator',
    path: path.join(BASE_PATH, 'bcs-mortgage-simulator'),
    port: 3007,
    color: '#ecdfdfff',
    icon: '📊',
    description: 'Simulator service',
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
const processes = {};
const processStatus = {};
const logBuffer = {};
const tunnels = {};
const clients = new Set();

MICROSERVICES.forEach((svc) => {
  processStatus[svc.id] = 'stopped';
  logBuffer[svc.id] = [];
});

// ─── WebSocket Broadcast ──────────────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

const ansiRegex = /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

function broadcastLog(serviceId, line, level = 'info') {
  const ts = new Date().toISOString();
  // Strip ANSI color codes from the line
  const cleanLine = line.replace(ansiRegex, '');
  const entry = { ts, serviceId, line: cleanLine, level };

  if (!logBuffer[serviceId]) logBuffer[serviceId] = [];
  logBuffer[serviceId].push(entry);
  if (logBuffer[serviceId].length > 500) logBuffer[serviceId].shift();
  broadcast({ type: 'log', ...entry });
}

function broadcastStatus(serviceId, status, extra = {}) {
  processStatus[serviceId] = status;
  broadcast({ type: 'status', serviceId, status, ...extra });
}

function broadcastTunnel(serviceId, url) {
  tunnels[serviceId] = { ...tunnels[serviceId], url };
  broadcast({ type: 'tunnel', serviceId, url });
}

// ─── Service Control ──────────────────────────────────────────────────────────
function detectLogLevel(line) {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('err') || l.includes('exception')) return 'error';
  if (l.includes('warn')) return 'warn';
  if (l.includes('✓') || l.includes('started') || l.includes('listening') || l.includes('ready')) return 'success';
  if (l.includes('debug') || l.includes('verbose')) return 'debug';
  return 'info';
}

function startService(serviceId) {
  const svc = MICROSERVICES.find((s) => s.id === serviceId);
  if (!svc) return { ok: false, error: 'Service not found' };
  if (processes[serviceId]) return { ok: false, error: 'Already running' };

  broadcastStatus(serviceId, 'starting');
  broadcastLog(serviceId, `⚡ Starting ${svc.name}...`, 'info');

  const proc = spawn('npm', ['run', 'dev'], {
    cwd: svc.path,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  processes[serviceId] = proc;

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach((line) => {
      const level = detectLogLevel(line);
      broadcastLog(serviceId, line, level);
      if (line.toLowerCase().includes('listening') || line.toLowerCase().includes('started') || line.toLowerCase().includes('application is running')) {
        broadcastStatus(serviceId, 'running');
      }
    });
  });

  proc.stderr.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach((line) => {
      const level = detectLogLevel(line);
      broadcastLog(serviceId, line, level);
    });
  });

  proc.on('exit', (code) => {
    delete processes[serviceId];
    if (code === 0 || code === null) {
      broadcastStatus(serviceId, 'stopped');
      broadcastLog(serviceId, `🛑 ${svc.name} stopped`, 'warn');
    } else {
      broadcastStatus(serviceId, 'error');
      broadcastLog(serviceId, `❌ ${svc.name} exited with code ${code}`, 'error');
    }
    // Kill associated tunnel if any
    if (tunnels[serviceId]?.process) {
      tunnels[serviceId].process.kill();
      delete tunnels[serviceId];
      broadcast({ type: 'tunnel', serviceId, url: null });
    }
  });

  proc.on('error', (err) => {
    broadcastStatus(serviceId, 'error');
    broadcastLog(serviceId, `❌ Failed to start: ${err.message}`, 'error');
    delete processes[serviceId];
  });

  // Status timeout: if not running in 30s, mark as starting still
  setTimeout(() => {
    if (processStatus[serviceId] === 'starting') {
      broadcastStatus(serviceId, 'running');
    }
  }, 30000);

  return { ok: true };
}

function stopService(serviceId) {
  const proc = processes[serviceId];
  if (!proc) return { ok: false, error: 'Not running' };

  broadcastStatus(serviceId, 'stopping');
  broadcastLog(serviceId, `🛑 Stopping service...`, 'warn');

  if (os.platform() === 'win32') {
    exec(`taskkill /pid ${proc.pid} /T /F`);
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    if (processes[serviceId]) {
      proc.kill('SIGKILL');
      delete processes[serviceId];
      broadcastStatus(serviceId, 'stopped');
    }
  }, 5000);

  return { ok: true };
}

function restartService(serviceId) {
  stopService(serviceId);
  setTimeout(() => startService(serviceId), 2000);
  return { ok: true };
}

// ─── Cloudflared Tunnel ───────────────────────────────────────────────────────
function startTunnel(serviceId) {
  const svc = MICROSERVICES.find((s) => s.id === serviceId);
  if (!svc) return { ok: false, error: 'Service not found' };
  if (tunnels[serviceId]?.process) return { ok: false, error: 'Tunnel already running' };

  broadcastLog(serviceId, `🚇 Iniciando cloudflared tunnel → http://localhost:${svc.port}`, 'info');
  broadcastLog(serviceId, `   Ejecutando: cloudflared tunnel --url http://localhost:${svc.port}`, 'debug');

  // shell:true ensures cloudflared is found on macOS PATH (~/.local/bin, /usr/local/bin, etc.)
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${svc.port}`], {
    shell: true,
    env: { ...process.env },
  });

  tunnels[serviceId] = { process: proc, url: null };

  // Cloudflared outputs the URL in stderr in multiple formats:
  // - "https://xxxx.trycloudflare.com"
  // - "Visit it at: https://xxxx.trycloudflare.com"
  // - "| https://xxxx.trycloudflare.com |"
  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i;
  // Strip ANSI escape sequences from cloudflared output
  const ansiRegex = /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

  function parseOutput(data) {
    const text = data.toString();
    // Log raw cloudflared output to dashboard (strip ANSI codes)
    const cleaned = text.replaceAll(ansiRegex, '').trim();
    if (cleaned) {
      cleaned.split('\n').filter(Boolean).forEach((line) => {
        broadcastLog(serviceId, `[cloudflared] ${line}`, 'debug');
      });
    }
    // Extract public URL
    const match = text.match(urlRegex);
    if (match && tunnels[serviceId] && !tunnels[serviceId].url) {
      const url = match[0];
      broadcastTunnel(serviceId, url);
      broadcastLog(serviceId, `🌍 URL pública lista: ${url}`, 'success');
    }
  }

  proc.stdout.on('data', parseOutput);
  proc.stderr.on('data', parseOutput);

  proc.on('error', (err) => {
    broadcastLog(serviceId, `❌ cloudflared error: ${err.message}. ¿Está instalado? brew install cloudflared`, 'error');
    delete tunnels[serviceId];
    broadcast({ type: 'tunnel', serviceId, url: null });
  });

  proc.on('exit', (code) => {
    const hadUrl = tunnels[serviceId]?.url;
    delete tunnels[serviceId];
    broadcast({ type: 'tunnel', serviceId, url: null });
    if (code !== 0 && !hadUrl) {
      broadcastLog(serviceId, `❌ cloudflared salió con código ${code}. Verifica que está instalado: brew install cloudflared`, 'error');
    } else {
      broadcastLog(serviceId, `🚇 Tunnel cerrado`, 'warn');
    }
  });

  return { ok: true };
}

function stopTunnel(serviceId) {
  if (!tunnels[serviceId]?.process) return { ok: false, error: 'No tunnel running' };
  tunnels[serviceId].process.kill();
  delete tunnels[serviceId];
  broadcast({ type: 'tunnel', serviceId, url: null });
  return { ok: true };
}

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/api/services', (req, res) => {
  const data = MICROSERVICES.map((svc) => ({
    ...svc,
    status: processStatus[svc.id] || 'stopped',
    tunnelUrl: tunnels[svc.id]?.url || null,
    logCount: logBuffer[svc.id]?.length || 0,
  }));
  res.json(data);
});

app.get('/api/logs/:serviceId', (req, res) => {
  const { serviceId } = req.params;
  const { limit = 100 } = req.query;
  const logs = logBuffer[serviceId] || [];
  res.json(logs.slice(-Number.parseInt(limit, 10)));
});

app.post('/api/services/:serviceId/start', (req, res) => {
  res.json(startService(req.params.serviceId));
});

app.post('/api/services/:serviceId/stop', (req, res) => {
  res.json(stopService(req.params.serviceId));
});

app.post('/api/services/:serviceId/restart', (req, res) => {
  res.json(restartService(req.params.serviceId));
});

app.post('/api/services/:serviceId/tunnel/start', (req, res) => {
  res.json(startTunnel(req.params.serviceId));
});

app.post('/api/services/:serviceId/tunnel/stop', (req, res) => {
  res.json(stopTunnel(req.params.serviceId));
});

app.delete('/api/logs/:serviceId', (req, res) => {
  logBuffer[req.params.serviceId] = [];
  res.json({ ok: true });
});

// Start all gateway services
app.post('/api/start-all-gateways', (req, res) => {
  const results = MICROSERVICES.filter((s) => s.isGateway).map((s) => ({
    id: s.id,
    result: startService(s.id),
  }));
  res.json(results);
});

// Start all services
app.post('/api/start-all', (req, res) => {
  const results = MICROSERVICES.map((s) => ({ id: s.id, result: startService(s.id) }));
  res.json(results);
});

app.post('/api/services/:serviceId/open', (req, res) => {
  const { serviceId } = req.params;
  const { editor } = req.body; // 'code', 'cursor', 'antigravity'
  const svc = MICROSERVICES.find((s) => s.id === serviceId);

  if (!svc) return res.status(404).json({ ok: false, error: 'Service not found' });

  let command = '';
  switch (editor) {
    case 'cursor':
      command = `cursor "${svc.path}"`;
      break;
    case 'code':
      command = `code "${svc.path}"`;
      break;
    case 'antigravity':
      command = `antigravity "${svc.path}"`;
      break;
    default:
      command = `open "${svc.path}"`;
  }

  broadcastLog(serviceId, `📂 Abriendo en ${editor}: ${svc.path}`, 'info');

  exec(command, (error) => {
    if (error) {
      broadcastLog(serviceId, `❌ Error al abrir editor: ${error.message}`, 'error');
      return res.json({ ok: false, error: error.message });
    }
    res.json({ ok: true });
  });
});

// Stop all
app.post('/api/stop-all', (req, res) => {
  const results = MICROSERVICES.map((s) => ({ id: s.id, result: stopService(s.id) }));
  res.json(results);
});

// Nuclear option: Kill all Node processes except orchestrator
app.post('/api/kill-all-node', (req, res) => {
  const currentPid = process.pid;

  // macOS/Linux command to kill all node processes except the current one
  // ps -A -o pid,comm | grep node | grep -v <currentPid>
  const command = os.platform() === 'win32'
    ? `taskkill /F /IM node.exe /FI "PID ne ${currentPid}"`
    : `ps -A -o pid,comm | grep node | grep -v ${currentPid} | awk '{print $1}' | xargs kill -9`;

  console.log(`💀 Executing Nuclear Kill: ${command}`);

  exec(command, (error) => {
    // Reset internal state for all services as they are definitely dead
    MICROSERVICES.forEach((svc) => {
      if (processes[svc.id]) {
        delete processes[svc.id];
        broadcastStatus(svc.id, 'stopped');
        broadcastLog(svc.id, '💀 PROCESO TERMINADO FORZOSAMENTE (System Kill)', 'error');
      }
    });

    if (error && !error.message.includes('Usage')) {
      return res.json({ ok: false, error: error.message });
    }
    res.json({ ok: true });
  });
});

// ─── WebSocket Handler ────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  clients.add(ws);

  // Send current state to new client
  const state = MICROSERVICES.map((svc) => ({
    type: 'status',
    serviceId: svc.id,
    status: processStatus[svc.id],
    tunnelUrl: tunnels[svc.id]?.url || null,
  }));
  state.forEach((s) => ws.send(JSON.stringify(s)));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down orchestrator...');
  Object.keys(processes).forEach((id) => stopService(id));
  Object.keys(tunnels).forEach((id) => stopTunnel(id));
  setTimeout(() => process.exit(0), 3000);
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log(`\n🚀 BCS Mortgage Orchestrator running at http://localhost:${PORT}\n`);
  console.log('   Microservices managed:');
  MICROSERVICES.forEach((s) => console.log(`   ${s.icon}  ${s.name} → port ${s.port}`));
  console.log('');
});
