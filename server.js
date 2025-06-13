require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Twilio } = require('twilio');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Health Check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// ✅ Trigger Outbound Call
app.get('/call-now', async (req, res) => {
  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.CALL_TO,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    console.log('📞 Outbound call started:', call.sid);
    res.send('Call started: ' + call.sid);
  } catch (error) {
    console.error('❌ Error making call:', error.message);
    res.status(500).send('Error starting call');
  }
});

// ✅ Voice Webhook - Generate Audio
app.post('/voice', async (req, res) => {
  const speechInput = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';
  console.log('🧠 Input:', speechInput);

  try {
    // 🔷 Get GPT response
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Angela, a helpful business assistant for Apex Spark Media. Keep replies short and friendly.' },
          { role: 'user', content: speechInput }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = gptResponse.data.choices[0].message.content.trim();
    console.log('🗣️ GPT reply:', reply);

    // 🔷 ElevenLabs Text-to-Speech
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    // 🔷 Save audio file
    const filePath = path.join(__dirname, 'response.mp3');
    fs.writeFileSync(filePath, audioResponse.data);

    // 🔷 Return TwiML to play audio
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.play(`${process.env.BASE_URL}/audio`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('❌ Voice error:', error.message);
    const fallback = new Twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml');
    res.send(fallback.toString());
  }
});

// ✅ Serve the MP3 file
app.get('/audio', (req, res) => {
  const filePath = path.join(__dirname, 'response.mp3');

  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'audio/mpeg');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Audio file not found');
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
