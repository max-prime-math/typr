#!/usr/bin/env node
/**
 * Local WebSocket-to-stdio bridge for Tinymist.
 *
 * Typr sends one JSON-RPC message per WebSocket frame; standard LSP servers
 * use Content-Length framed JSON-RPC on stdin/stdout. This bridge translates
 * between those transports without adding an npm dependency.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const host = process.env.LSP_WS_HOST ?? "127.0.0.1";
const port = Number(process.env.LSP_WS_PORT ?? "3007");
const command = process.env.LSP_COMMAND ?? "tinymist";
const commandArgs = process.env.LSP_COMMAND_ARGS?.split(" ").filter(Boolean) ?? ["lsp"];

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("LSP_WS_PORT must be a valid TCP port.");
}

const server = createServer((socket) => {
  let handshake = Buffer.alloc(0);
  let client = null;

  socket.on("data", (chunk) => {
    if (!client) {
      handshake = Buffer.concat([handshake, chunk]);
      const headerEnd = handshake.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const request = handshake.subarray(0, headerEnd).toString("utf8");
      const key = request.match(/^sec-websocket-key:\s*(.+)$/im)?.[1]?.trim();
      const upgrade = request.match(/^upgrade:\s*(.+)$/im)?.[1]?.trim().toLowerCase();
      if (!key || upgrade !== "websocket") {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        return;
      }

      const accept = createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );

      client = createLspClient(socket);
      const remainder = handshake.subarray(headerEnd + 4);
      if (remainder.length) client.acceptWebSocketData(remainder);
      return;
    }

    client.acceptWebSocketData(chunk);
  });
});

server.listen(port, host, () => {
  console.log(`Tinymist LSP bridge listening at ws://${host}:${port}`);
  console.log(`Starting ${command} ${commandArgs.join(" ")} for each connection.`);
});
server.on("error", (error) => {
  console.error(`Unable to listen on ${host}:${port}: ${error.message}`);
  process.exitCode = 1;
});

function createLspClient(socket) {
  const lsp = spawn(command, commandArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let webSocketBuffer = Buffer.alloc(0);
  let lspBuffer = Buffer.alloc(0);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    lsp.kill();
    socket.destroy();
  };

  lsp.on("error", (error) => {
    console.error(`Unable to start ${command}: ${error.message}`);
    close();
  });
  lsp.stderr.on("data", (chunk) => process.stderr.write(chunk));
  lsp.stdout.on("data", (chunk) => {
    lspBuffer = Buffer.concat([lspBuffer, chunk]);
    forwardLspMessages();
  });
  lsp.on("exit", () => close());
  socket.on("close", close);
  socket.on("error", close);

  function acceptWebSocketData(chunk) {
    webSocketBuffer = Buffer.concat([webSocketBuffer, chunk]);
    while (webSocketBuffer.length >= 2) {
      const first = webSocketBuffer[0];
      const second = webSocketBuffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (webSocketBuffer.length < 4) return;
        length = webSocketBuffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (webSocketBuffer.length < 10) return;
        const longLength = webSocketBuffer.readBigUInt64BE(2);
        if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) return close();
        length = Number(longLength);
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (webSocketBuffer.length < offset + maskLength + length) return;
      const mask = masked ? webSocketBuffer.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(webSocketBuffer.subarray(offset + maskLength, offset + maskLength + length));
      webSocketBuffer = webSocketBuffer.subarray(offset + maskLength + length);
      if (mask) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];

      if (opcode === 0x8) return close();
      if (opcode === 0x9) sendWebSocketFrame(0xA, payload);
      if (opcode === 0x1) {
        const body = payload.toString("utf8");
        lsp.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      }
    }
  }

  function forwardLspMessages() {
    while (true) {
      const headerEnd = lspBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = lspBuffer.subarray(0, headerEnd).toString("ascii");
      const length = Number(header.match(/^content-length:\s*(\d+)$/im)?.[1]);
      if (!Number.isSafeInteger(length) || length < 0) return close();
      const bodyStart = headerEnd + 4;
      if (lspBuffer.length < bodyStart + length) return;
      sendWebSocketFrame(0x1, lspBuffer.subarray(bodyStart, bodyStart + length));
      lspBuffer = lspBuffer.subarray(bodyStart + length);
    }
  }

  function sendWebSocketFrame(opcode, payload) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let header;
    if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length]);
    else if (body.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    socket.write(Buffer.concat([header, body]));
  }

  return { acceptWebSocketData };
}
