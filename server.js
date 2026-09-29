const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

app.get("/", (req, res) => {
  res.send("Avella Taste backend is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Avella Taste server running on port ${PORT}`);
});
