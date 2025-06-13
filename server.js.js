require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Twilio } = require('twilio');
const { xml } = require('xmlbuilder2');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Main Voice Endpoint
app.post('/voice', async (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const speech = req.body.SpeechResult || req.body.Body || 'Hello, how can I help you today?';

  try {
    // Get GPT response
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Angela, a helpful female business assistant.' },
          { role: 'user', content: speech }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const responseText = gptResponse.data.choices[0].message.content;

    // Call ElevenLabs for audio
    const audio = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: responseText,
        model_id: "eleven_monolingual_v1",
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

    // Save audio file
    const fs = require('fs');
    const audioPath = 'response.mp3';
    fs.writeFileSync(audioPath, audio.data);

    // Respond with audio stream TwiML
    const twimlResponse = new Twilio.twiml.VoiceResponse();
    twimlResponse.play(`${req.protocol}://${req.get('host')}/audio`);

    res.type('text/xml');
    res.send(twimlResponse.toString());

  } catch (error) {
    console.error('❌ Error:', error.message);
    const fallback = new Twilio.twiml.VoiceResponse();
    fallback.say('Sorry, something went wrong.');
    res.type('text/xml');
    res.send(fallback.toString());
  }
});

// Serve the audio file to Twilio
app.get('/audio', (req, res) => {
  res.set('Content-Type', 'audio/mpeg');
  res.sendFile(__dirname + '/response.mp3');
});

// Health check
app.get('/', (req, res) => {
  res.send('✅ Angela AI Agent is running.');
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server is live on port ${port}`);
});
