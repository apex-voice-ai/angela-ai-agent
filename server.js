require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Twilio } = require('twilio');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Twilio client
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// ✅ Serve the converted WAV file to Twilio
app.get('/audio', (req, res) => {
  const filePath = path.join(__dirname, 'response.wav');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'audio/wav');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Audio file not found.');
  }
});

// ✅ Main voice interaction webhook
app.post('/voice', async (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    // 🔹 Step 1: Get response from GPT
    const gpt = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Angela, a calm and friendly business assistant from Apex Spark Media. Speak clearly and professionally.'
          },
          { role: 'user', content: input }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = gpt.data.choices[0].message.content;
    console.log('🧠 GPT Reply:', reply);

    // 🔹 Step 2: Get audio from ElevenLabs
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: reply,
        model_id: 'eleven_multilingual_v2', // Higher quality
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.9
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

    fs.writeFileSync('response.mp3', audioResponse.data);

    // 🔹 Step 3: Convert to Twilio-compatible WAV
    await new Promise((resolve, reject) => {
      ffmpeg('response.mp3')
        .audioChannels(1)
        .audioFrequency(8000) // Twilio requirement
        .audioCodec('pcm_mulaw')
        .format('wav')
        .on('end', resolve)
        .on('error', reject)
        .save('response.wav');
    });

    // 🔹 Step 4: Send audio to Twilio
    twiml.play(`${process.env.BASE_URL}/audio`);
    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('❌ Voice error:', error.message);
    const fallback = new Twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml').send(fallback.toString());
  }
});

// ✅ Trigger outbound call
app.get('/call-now', async (req, res) => {
  try {
    const call = await twilioClient.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log('📞 Outbound call started:', call.sid);
    res.send(`✅ Call started. SID: ${call.sid}`);
  } catch (err) {
    console.error('❌ Error starting call:', err.message);
    res.status(500).send('Call failed.');
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Angela is live at http://localhost:${port}`);
});
