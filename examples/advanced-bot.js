const { nexus } = require('nexus-fca');
const fs = require('fs');

class AdvancedBot {
    constructor() {
        this.config = {
            sessionPath: './bot-session',
            adminUsers: ["100000123456789"],
            prefix: "!",
            autoReconnect: true
        };
        this.commands = new Map();
        this.setupCommands();
    }

    setupCommands() {
        this.commands.set('add', {
            admin: true,
            handler: async (message, args) => {
                await nexus.addUserToGroup(args[0], message.threadID);
                return "User added!";
            }
        });

        this.commands.set('kick', {
            admin: true,
            handler: async (message, args) => {
                await nexus.removeUserFromGroup(args[0], message.threadID);
                return "User removed!";
            }
        });

        this.commands.set('color', {
            handler: async (message, args) => {
                await nexus.changeThreadColor(message.threadID, args[0]);
                return "Thread color changed!";
            }
        });

        this.commands.set('emoji', {
            handler: async (message, args) => {
                await nexus.changeThreadEmoji(message.threadID, args[0]);
                return "Thread emoji changed!";
            }
        });
    }

    async start() {
        try {
            // Try loading session
            const sessionFile = './appstate.json';
            if (fs.existsSync(sessionFile)) {
                await nexus.loginWithCookie(
                    JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
                );
            } else {
                await nexus.login("email", "password");
                // Save session after successful login
                fs.writeFileSync(
                    sessionFile, 
                    JSON.stringify(await nexus._saveSession())
                );
            }

            this.setupEventHandlers();
            console.log("Advanced bot started!");

        } catch (error) {
            console.error("Bot startup failed:", error);
        }
    }

    async handleCommand(message) {
        const [cmd, ...args] = message.body
            .slice(this.config.prefix.length)
            .split(' ');

        const command = this.commands.get(cmd.toLowerCase());
        if (!command) return;

        if (command.admin && !this.config.adminUsers.includes(message.senderID)) {
            await nexus.sendMessage(message.threadID, "Admin only command!");
            return;
        }

        try {
            const response = await command.handler(message, args);
            if (response) {
                await nexus.sendMessage(message.threadID, response);
            }
        } catch (error) {
            await nexus.sendMessage(
                message.threadID, 
                `Error executing command: ${error.message}`
            );
        }
    }

    setupEventHandlers() {
        // Message handler
        nexus.on('message.new', async (message) => {
            if (message.body.startsWith(this.config.prefix)) {
                await this.handleCommand(message);
            }
        });

        // Typing indicator
        nexus.on('typing', data => {
            console.log(`${data.userId} is typing`);
        });

        // Handle reactions
        nexus.on('message_reaction', data => {
            console.log(`New reaction: ${data.reaction}`);
        });

        // Auto reconnect
        nexus.on('login.failed', async () => {
            console.log("Attempting to reconnect...");
            await this.start();
        });
    }
}

// Start the advanced bot
const bot = new AdvancedBot();
bot.start();
