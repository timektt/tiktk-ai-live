require('dotenv').config();
console.log("✅ Username =", JSON.stringify(process.env.TIKTOK_USERNAME));
console.log("✅ Webhook  =", JSON.stringify(process.env.N8N_WEBHOOK_URL));

const { WebcastPushConnection } = require('tiktok-live-connector');
const axios = require('axios');

const username = process.env.TIKTOK_;
const webhookUrl = process.env.N8N_WEBHOOK_URL;

const tiktok = new WebcastPushConnection(username);

tiktok.connect().then(state => {
  console.log(`✅ Connected to TikTok Live: ${state.roomId}`);
}).catch(err => {
  console.error("❌ Connection failed", err);
});

tiktok.on('chat', data => {
  const username = data.uniqueId;
  const text = data.comment;
  console.log(`💬 ${username}: ${text}`);

  // ส่งข้อความเข้า n8n webhook
  axios.post(webhookUrl, {
    user: username,
    text: text
  }).catch(err => {
    console.error("❌ Failed to send to webhook", err.message);
  });
});
