// server.js
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

// Twilio Client
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Health Check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// ✅ Serve Audio File
app.get('/audio', (req, res) => {
  const audioPath = path.join(__dirname, 'response.wav');
  if (fs.existsSync(audioPath)) {
    res.set('Content-Type', 'audio/wav');
    res.sendFile(audioPath);
  } else {
    res.status(404).send('Audio file not found.');
  }
});

// ✅ Main Voice Webhook
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    const gpt = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Angela, a calm and friendly business assistant from Apex Spark Media. Speak professionally and clearly.'
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

    fs.writeFileSync('response.mp3', audioResponse.data);

    if (!fs.existsSync('response.mp3')) {
      throw new Error('response.mp3 was not saved.');
    }

    await new Promise((resolve, reject) => {
      ffmpeg('response.mp3')
        .audioChannels(1)
        .audioFrequency(8000)
        .audioCodec('pcm_mulaw')
        .format('wav')
        .on('end', () => {
          console.log('✅ Audio converted to WAV');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err.message);
          reject(err);
        })
        .save('response.wav');
    });

    twiml.play(`${process.env.BASE_URL}/audio`);
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('❌ Voice error:', error.message);
    const fallback = new twilio.twiml.VoiceResponse();
    fallback.say('Sorry, there was an error processing your request.');
    res.type('text/xml').send(fallback.toString());
  }
});

// ✅ Call Now Trigger
app.get('/call-now', async (req, res) => {
  try {
    const call = await twilioClient.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log('📞 Outbound call started:', call.sid);
    res.send(`✅ Call initiated. SID: ${call.sid}`);
  } catch (err) {
    console.error('❌ Error starting call:', err.message);
    res.status(500).send('Call failed.');
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ Angela is live on port ${port}`);
});
