const express = require("express");
const bodyParser = require("body-parser");
const { VoiceResponse } = require("twilio").twiml;

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Test route
app.get("/", (req, res) => {
  res.send("✅ Angela AI Voice Agent is LIVE");
});

// Twilio Voice Webhook route
app.post("/voice", (req, res) => {
  console.log("✅ Twilio webhook hit!");

  const twiml = new VoiceResponse();

  twiml.say(
    {
      voice: "alice",
      language: "en-US"
    },
    "Hello! This is Angela, your virtual assistant from Apex Spark Media. How can I help you today?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
