import express from "express";

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("📩 Webhook received!");
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));
  res.status(200).send("ok");
});

app.listen(5001, () => {
  console.log("Mock webhook server running on http://localhost:5001/webhook");
});
