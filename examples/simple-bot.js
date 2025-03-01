const { nexus } = require('nexus-fca');
const fs = require('fs');

// Bot configuration
const config = {
    email: "your.email@example.com",
    password: "your_password",
    // Or use cookies
    // cookies: JSON.parse(fs.readFileSync('./appstate.json', 'utf8')),
    adminUsers: ["100000123456789"], // Your Facebook ID
    prefix: "!",
};

async function startBot() {
    try {
        // Login to Facebook
        if (config.cookies) {
            await nexus.loginWithCookie(config.cookies);
        } else {
            await nexus.login(config.email, config.password);
            
            // Handle 2FA if needed
            nexus.on('2fa.required', () => {
                const code = "123456"; // Your 2FA code
                nexus.emit('2fa.code', code);
            });
        }

        // Listen for new messages
        nexus.on('message.new', async (message) => {
            try {
                // Ignore messages from the bot itself
                if (message.senderID === nexus.getCurrentUserID()) return;

                // Basic command handling
                if (message.body.startsWith(config.prefix)) {
                    const [command, ...args] = message.body.slice(config.prefix.length).split(' ');

                    switch (command.toLowerCase()) {
                        case 'help':
                            await nexus.sendMessage(message.threadID, 
                                "Available commands:\n" +
                                "!help - Show this message\n" +
                                "!ping - Check bot status\n" +
                                "!info - Get user info\n" +
                                "!image - Send test image"
                            );
                            break;

                        case 'ping':
                            await nexus.sendMessage(message.threadID, "🏓 Pong!");
                            break;

                        case 'info':
                            const userInfo = await nexus.getUserInfo(message.senderID);
                            await nexus.sendMessage(message.threadID, 
                                `Name: ${userInfo.name}\n` +
                                `Profile: ${userInfo.profileUrl}`
                            );
                            break;

                        case 'image':
                            // Send image example
                            await nexus.sendMessage(
                                message.threadID, 
                                "Test image", 
                                "./test-image.jpg"
                            );
                            break;
                    }
                }

                // React to messages containing "hello"
                if (message.body.toLowerCase().includes('hello')) {
                    await nexus.setMessageReaction(message.messageID, '👋');
                }

                // Auto-reply to mentions
                if (message.mentions && message.mentions[nexus.getCurrentUserID()]) {
                    await nexus.sendMessage(
                        message.threadID,
                        "You mentioned me!"
                    );
                }

            } catch (error) {
                console.error("Error handling message:", error);
            }
        });

        // Handle typing indicators
        nexus.on('typing', async (data) => {
            console.log(`${data.userId} is typing in ${data.threadId}`);
        });

        // Handle message reactions
        nexus.on('message_reaction', async (data) => {
            console.log(`Reaction ${data.reaction} on message ${data.messageId}`);
        });

        // Handle errors
        nexus.on('error', error => {
            console.error("Bot error:", error);
        });

        // Log successful login
        console.log("Bot started successfully!");

    } catch (error) {
        console.error("Failed to start bot:", error);
    }
}

// Start the bot
startBot();

// Handle process termination
process.on('SIGINT', async () => {
    console.log("Shutting down bot...");
    await nexus._cleanup();
    process.exit(0);
});
