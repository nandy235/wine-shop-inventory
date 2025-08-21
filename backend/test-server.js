const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Immediate health check response
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('Hello'));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on port', PORT);
});

// Ensure server stays responsive
server.keepAliveTimeout = 0;
