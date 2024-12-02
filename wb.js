const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

class WebSocketManager {
  constructor() {
    /** @type {Set<WebSocket>} */
    this.clients = new Set();
  }

  /**
   * Register a new WebSocket client
   * @param {WebSocket} client 
   */
  registerClient(client) {
    this.clients.add(client);

    // Send initial connection message
    this.sendMessage(client, {
      type: 'connection',
      message: 'WebSocket connection established'
    });

    // Remove client on disconnect
    client.on('close', () => {
      this.clients.delete(client);
    });
  }

  /**
   * Broadcast a message to all connected clients
   * @param {Object} message 
   */
  broadcast(message) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  /**
   * Send a message to a specific client
   * @param {WebSocket} client 
   * @param {Object} message 
   */
  sendMessage(client, message) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

// Create Express and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize WebSocket Manager
const webSocketManager = new WebSocketManager();

// WebSocket Server
const wss = new WebSocketServer({ server });

// Handle WebSocket Connections
wss.on('connection', (ws) => {
  webSocketManager.registerClient(ws);
});

module.exports = {
  webSocketManager,
  server
};