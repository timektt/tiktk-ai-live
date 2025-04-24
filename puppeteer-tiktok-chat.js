require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

const username = process.env.TIKTOK_USERNAME;
const webhookUrl = process.env.N8N_WEBHOOK_URL;

(async () => {
  console.log("📁 Loading cookies...");
  const cookiesPath = "./cookies.json";
  if (!fs.existsSync(cookiesPath)) {
    console.error("❌ cookies.json not found.");
    process.exit(1);
  }

  const rawCookies = JSON.parse(fs.readFileSync(cookiesPath, "utf-8"));
  const fixedCookies = rawCookies.map(cookie => {
    if (!cookie.sameSite || typeof cookie.sameSite !== "string") {
      delete cookie.sameSite;
    }
    return cookie;
  });

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--window-size=1200,800",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
  await page.setCookie(...fixedCookies);

  // ✅ แทรก pako.bundle.js ด้วย evaluateOnNewDocument
  const pakoCode = fs.readFileSync("./pako.bundle.js", "utf8");
  await page.evaluateOnNewDocument(pakoCode);

  const liveUrl = `https://www.tiktok.com/@${username}/live`;
  console.log(`🚀 Opening TikTok Live: ${liveUrl}`);

  page.on("console", msg => {
    console.log(`[browser] ${msg.text()}`);
  });

  await page.goto(liveUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

  await page.evaluate((webhookUrl) => {
    const connectedAt = Date.now();
    const OriginalWebSocket = window.WebSocket;
  
    window.WebSocket = function (url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);
  
      ws.addEventListener("message", async (event) => {
        try {
          const getBinary = async (data) => {
            if (data instanceof Blob) {
              return new Uint8Array(await data.arrayBuffer());
            } else if (data instanceof ArrayBuffer) {
              return new Uint8Array(data);
            } else if (data?.arrayBuffer) {
              return new Uint8Array(await data.arrayBuffer()); // ✅ รองรับ object ที่มี arrayBuffer()
            } else {
              console.log("⚠️ Unknown data type:", typeof data);
              return null;
            }
          };
  
          const binary = await getBinary(event.data);
          if (!binary) return;
  
          console.log("🧩 Binary preview:", binary.slice(0, 20));
          const text = window.pako.inflate(binary, { to: "string" });
  
          if (text.includes("WebcastChatMessage")) {
            const json = JSON.parse(text);
            const comment = json?.data?.event?.eventData?.comment?.text;
            const nickname = json?.data?.event?.eventData?.user?.nickname;
            const createTime = json?.data?.event?.eventData?.comment?.createTime;
            const createAtMs = createTime ? createTime * 1000 : Date.now();
  
            if (createAtMs >= connectedAt && comment && nickname) {
              console.log(`💬 ${nickname}: ${comment}`);
              fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user: nickname, text: comment }),
              }).catch(err => console.log("❌ Webhook error: " + err.message));
            }
          }
        } catch (err) {
          console.log("⚠️ Error handling WS message:", err.message);
        }
      });
  
      return ws;
    };
  }, webhookUrl);
  

  console.log("✅ WebSocket Hook injected. Waiting for new messages...");
})();
