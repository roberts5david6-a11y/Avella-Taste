const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Avella Taste backend is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Avella Taste server running on port ${PORT}`);
});
