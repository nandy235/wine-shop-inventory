const express = require('express');
const app = express();

app.get('/health', (req, res) => res.send('OK'));
app.get('/', (req, res) => res.send('Hello'));

app.listen(process.env.PORT || 8080, () => {
  console.log('Simple server running');
});
