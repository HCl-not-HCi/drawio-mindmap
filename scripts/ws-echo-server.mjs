// M0 spike: tiny WebSocket echo server on 127.0.0.1 for "Extras → Mindmap → Test WebSocket".
// Usage: npm run spike:ws [-- --port 47100]
import { WebSocketServer } from 'ws';

const portArg = process.argv.indexOf('--port');
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 47100;
const host = process.env.WS_HOST ?? '127.0.0.1';

const wss = new WebSocketServer({ host, port });
wss.on('listening', () => console.log(`[ws-echo] listening on ws://${host}:${port}`));
wss.on('connection', (socket, req) => {
  console.log(`[ws-echo] connection from origin ${req.headers.origin ?? '(none)'}`);
  socket.on('message', (data) => socket.send(data.toString()));
});
