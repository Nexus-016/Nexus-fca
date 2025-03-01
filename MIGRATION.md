# Migrating to Nexus-FCA

## Why Migrate to Nexus-FCA?

- More secure and stable than other FCAs
- Better detection avoidance
- Built-in encryption and security features
- Modern async/await syntax
- Active maintenance and updates
- Better error handling
- Built-in caching for performance
- Better session management

## Migration from Different FCAs

### 1. From fca-horizon-remake
```javascript
// Old fca-horizon-remake code
const login = require("fca-horizon-remake");
login({email: "...", password: "..."}, (err, api) => {
    api.sendMessage("Hello", "USER_ID");
});

// New Nexus-FCA code
const { nexus } = require("nexus-fca");
async function main() {
    await nexus.login("email", "password");
    await nexus.sendMessage("USER_ID", "Hello");
}
```

### 2. From ws3-fca
```javascript
// Old ws3-fca code
const login = require("ws3-fca");
login.setOptions({
    listenEvents: true,
    forceLogin: true
});

// New Nexus-FCA code
const { NexusFCA } = require("nexus-fca");
const fca = new NexusFCA({
    autoReconnect: true,
    maxRetries: 3
});
```

### 3. From fca-unofficial
```javascript
// Old fca-unofficial code
const login = require("fca-unofficial");
login({appState: JSON.parse(fs.readFileSync('appstate.json', 'utf8'))}, (err, api) => {
    api.sendMessage({body: "Hello"}, threadID);
});

// New Nexus-FCA code
const { nexus } = require("nexus-fca");
const cookies = fs.readFileSync('appstate.json', 'utf8');
await nexus.loginWithCookie(cookies);
await nexus.sendMessage(threadID, "Hello");
```

## Event Handling Migration

### Old Style (Callback)
```javascript
// Old FCA style
api.listen((err, message) => {
    if(message.body === "!ping") {
        api.sendMessage("Pong!", message.threadID);
    }
});

// Old event style
api.setMessageReaction("😊", "message-id");
```

### New Style (Events)
```javascript
// New Nexus-FCA style
nexus.on('message.new', async (data) => {
    if(data.message === "!ping") {
        await nexus.sendMessage(data.threadID, "Pong!");
    }
});

// New reaction style
await nexus.setMessageReaction("message-id", "😊");
```

## Full Bot Migration Example

### Old Bot
```javascript
const login = require("fca-horizon-remake");
const fs = require("fs");

login({email: "...", password: "..."}, (err, api) => {
    if(err) return console.error(err);

    api.listen((err, message) => {
        if(err) return;

        if(message.body === "!help") {
            api.sendMessage("Commands: !help, !info", message.threadID);
        }

        if(message.body === "!info") {
            api.getUserInfo(message.senderID, (err, info) => {
                if(err) return;
                api.sendMessage(`Name: ${info[message.senderID].name}`, message.threadID);
            });
        }
    });
});
```

### New Bot (Nexus-FCA)
```javascript
const { nexus } = require("nexus-fca");

async function startBot() {
    try {
        await nexus.login("email", "password");
        console.log("Bot started successfully!");

        nexus.on('message.new', async (data) => {
            try {
                switch(data.message) {
                    case "!help":
                        await nexus.sendMessage(data.threadID, "Commands: !help, !info");
                        break;

                    case "!info":
                        const userInfo = await nexus.getUserInfo(data.senderID);
                        await nexus.sendMessage(data.threadID, `Name: ${userInfo.name}`);
                        break;
                }
            } catch (error) {
                console.error("Error handling message:", error);
            }
        });

        // Handle reconnection
        nexus.on('login.failed', async (error) => {
            console.error("Login failed:", error);
            await nexus.login("email", "password"); // Auto retry
        });

    } catch (error) {
        console.error("Failed to start bot:", error);
    }
}

startBot();
```

## Advanced Features Migration

### Multiple Accounts
```javascript
const { NexusFCA } = require("nexus-fca");

const bots = new Map();

async function addBot(email, password, name) {
    const fca = new NexusFCA({
        sessionPath: `./sessions/${name}`,
        rateLimitWindow: 60000,
        maxRequestsPerWindow: 30
    });
    
    await fca.login(email, password);
    bots.set(name, fca);
    return fca;
}

// Usage
await addBot("bot1@email.com", "pass1", "bot1");
await addBot("bot2@email.com", "pass2", "bot2");

// Send messages from different bots
await bots.get("bot1").sendMessage(threadID, "Hello from Bot 1");
await bots.get("bot2").sendMessage(threadID, "Hello from Bot 2");
```

## Common Issues and Solutions

1. **Session Issues**
   ```javascript
   // Old way (prone to errors)
   fs.writeFileSync("appstate.json", JSON.stringify(api.getAppState()));

   // New way (secure)
   // Sessions are automatically encrypted and saved
   await nexus.login("email", "password");
   ```

2. **Rate Limiting**
   ```javascript
   // Old way (manual handling)
   setTimeout(() => api.sendMessage(), 1000);

   // New way (automatic)
   // Rate limiting is handled automatically
   await nexus.sendMessage(); // Will be queued if needed
   ```

3. **Error Handling**
   ```javascript
   // Old way
   api.sendMessage("text", "thread_id", (err) => {
       if(err) console.error(err);
   });

   // New way
   try {
       await nexus.sendMessage("thread_id", "text");
   } catch (error) {
       console.error("Failed to send:", error);
   }
   ```

Need more help? Join our support server or open an issue on GitHub.
