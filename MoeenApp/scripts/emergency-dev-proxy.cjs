// Local development only. ngrok exposes this single listener over HTTPS.
const http = require('node:http');
const net = require('node:net');

// The responder page (/e) needs exactly one backend route; nothing else from
// the API is exposed through the tunnel.
const apiPath = /^\/api\/emergency\/public\/card(?:\?|$)/;
const upstreamPort = (url) => apiPath.test(url || '/') ? 3000 : 8081;

const server = http.createServer((request, response) => {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: upstreamPort(request.url),
    path: request.url,
    method: request.method,
    headers: request.headers,
  }, (result) => {
    response.writeHead(result.statusCode || 502, result.headers);
    result.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end('Development server unavailable.');
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});

// Preserve Metro's development WebSocket connections.
server.on('upgrade', (request, socket, head) => {
  const upstream = net.connect(upstreamPort(request.url), '127.0.0.1', () => {
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      upstream.write(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}\r\n`);
    }
    upstream.write('\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});

server.listen(8080, '127.0.0.1', () => {
  console.log('Emergency development proxy listening on 127.0.0.1:8080');
});
