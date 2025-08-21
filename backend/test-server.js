const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => res.send('OK'));
app.get('/', (req, res) => res.send('Hello'));

app.listen(PORT, () => {
  console.log('Simple server running on port', PORT);
  
  // Keep alive by pinging self every 10 minutes
  if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
      fetch(`http://localhost:${PORT}/health`)
        .catch(() => {}); // Ignore errors
    }, 10 * 60 * 1000);
  }
});
