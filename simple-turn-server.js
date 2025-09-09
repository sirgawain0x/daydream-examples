#!/usr/bin/env node

// Simple TURN server using node-turn-server
// Run: npm install -g node-turn-server && node simple-turn-server.js

const Turn = require('node-turn');

const server = new Turn({
  // TURN server port
  listeningPort: 3478,
  
  // Relay ports range
  relayPortMin: 49152,
  relayPortMax: 65535,
  
  // Authentication
  authMech: 'long-term',
  credentials: {
    'test': 'password123'  // username: password
  },
  
  // Realm
  realm: 'localhost',
  
  // Debug
  debugLevel: 'INFO'
});

server.start();

console.log('🚀 TURN server started on port 3478');
console.log('📋 Configuration:');
console.log('   TURN Server: turn:localhost:3478');
console.log('   Username: test');
console.log('   Password: password123');
console.log('');
console.log('🛑 Stop with Ctrl+C');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping TURN server...');
  server.stop();
  process.exit(0);
});
