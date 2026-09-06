// Public source copy from:
// https://github.com/akimijamil-eng/luckyjet-api/blob/main/server.js
// Original commit: 7f3dd760d7c1a81f68ed16a8e649105604dc0324
// No secrets present in the public source.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

function generateCrashValue() {
  const r = Math.random();
  let crashPoint;

  if (r < 0.80) {
    crashPoint = 1.20 + Math.random() * 1.80;
  } else if (r < 0.98) {
    crashPoint = 3.00 + Math.random() * 12.0;
  } else {
    crashPoint = 20 + Math.random() * 280;
  }

  return parseFloat(crashPoint.toFixed(2));
}

app.get('/get-crash-value', (req, res) => {
  const crashValue = generateCrashValue();
  console.log(`Nouvelle cote générée : x${crashValue}`);
  res.json({ crashPoint: crashValue });
});

app.listen(PORT, () => {
  console.log(`🚀 L'API de LuckyJet est démarrée sur le port ${PORT}`);
});
