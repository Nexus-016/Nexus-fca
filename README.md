# Nexus-FCA

[![npm version](https://img.shields.io/npm/v/nexus-fca.svg)](https://www.npmjs.com/package/nexus-fca)
[![downloads](https://img.shields.io/npm/dm/nexus-fca.svg)](https://www.npmjs.com/package/nexus-fca)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/yourusername/nexus-fca/blob/main/LICENSE)

A secure Facebook Chat API by Nexus Team.

## Installation

```bash
npm install nexus-fca
```

## Quick Usage

```javascript
const { nexus } = require('nexus-fca');

async function main() {
    // Login methods
    await nexus.login('email@example.com', 'password');
    // or
    await nexus.loginWithCookie('your-cookie-string');

    // Listen for events
    nexus.on('login.success', () => {
        console.log('Connected to Facebook!');
    });

    // Send messages
    await nexus.sendMessage('user_id', 'Hello!');
    await nexus.sendMessageWithMentions('thread_id', 'Hi @user!', mentions);

    // Group management
    await nexus.createGroup(['user1', 'user2'], 'My Group');
    await nexus.addUserToGroup('user_id', 'group_id');
    await nexus.removeUserFromGroup('user_id', 'group_id');

    // Message actions
    await nexus.setMessageReaction('msg_id', '👍');
    await nexus.unsendMessage('msg_id');
    await nexus.markAsRead('thread_id');

    // Thread customization
    await nexus.changeThreadColor('thread_id', '#FF0000');
    await nexus.changeThreadEmoji('thread_id', '🎉');

    // Information getters
    const friends = await nexus.getFriendsList();
    const userInfo = await nexus.getUserInfo('user_id');
    const threadInfo = await nexus.getThreadInfo('thread_id');

    // Typing indicators
    await nexus.setTyping('thread_id', true);
}

main().catch(console.error);
```

## Login Methods

### 1. Email/Password Login (Most Secure)
```javascript
const { nexus } = require('nexus-fca');

// Simple login
await nexus.login('email@example.com', 'password');

// With 2FA support
nexus.on('2fa.required', () => {
    // When 2FA code is received
    nexus.emit('2fa.code', 'your-2fa-code');
});
await nexus.login('email@example.com', 'password');
```

### 2. Cookie Login
```javascript
// Login with cookie string
await nexus.loginWithCookie('cookie-string-here');

// Or login with cookie object
await nexus.loginWithCookie([
    { name: 'c_user', value: '1000...', domain: '.facebook.com' },
    { name: 'xs', value: '2%3A...', domain: '.facebook.com' }
]);
```

### Login Error Handling
```javascript
try {
    await nexus.login('email@example.com', 'password');
} catch (error) {
    if (error.message.includes('checkpoint')) {
        console.log('Account requires checkpoint verification');
    } else if (error.message.includes('incorrect')) {
        console.log('Invalid credentials');
    } else {
        console.log('Login failed:', error.message);
    }
}
```

## Handling Captcha

```javascript
const { nexus } = require('nexus-fca');

// Listen for captcha events
nexus.on('captcha.required', async (data) => {
    // data.image contains the captcha image
    // You can show this to user or use a captcha solving service
    
    // Example: Manual solving
    const solution = await askUserForCaptcha(data.image);
    
    // Submit the solution
    await data.callback(solution);
});

// Start login process
await nexus.login('email@example.com', 'password');
```

### Using Auto Captcha Service
```javascript
const { NexusFCA } = require('nexus-fca');

const fca = new NexusFCA({
    captchaService: {
        provider: '2captcha',
        apiKey: 'your-api-key'
    }
});

// Login will automatically handle captchas
await fca.login('email@example.com', 'password');
```

## Advanced Usage (Custom Instance)

```javascript
const { NexusFCA } = require('nexus-fca');

const customNexus = new NexusFCA({
    sessionPath: './custom-sessions',
    proxy: 'http://proxy:port',
    rateLimitWindow: 60000,
    maxRequestsPerWindow: 30
});

await customNexus.login('email', 'password');
```

## Features

- Secure login with session persistence
- Stealth mode to avoid detection
- Proxy support
- Event-based message handling
- Multi-session support
- Automatic reconnection

## Rate Limiting Features

- Automatic request throttling
- Configurable rate limits per action
- Smart queue management
- Random delays between requests
- Per-user rate limiting
- Automatic queue processing

## Additional Features

### Message Management
```javascript
// Mark message as read
await fca.markAsRead("thread_id");

// Unsend a message
await fca.unsendMessage("message_id");

// Set typing indicator
await fca.setTyping("thread_id", true);
```

### Group Management
```javascript
// Create a group chat
await fca.createGroup(["user1_id", "user2_id"], "Group Name");

// Add user to group
await fca.addUserToGroup("user_id", "thread_id");

// Remove user from group
await fca.removeUserFromGroup("user_id", "thread_id");
```

### Friend Management
```javascript
// Get friends list
const friends = await fca.getFriendsList();
```

### Message Formatting
```javascript
// Send message with mentions
await fca.sendMessageWithMentions("thread_id", "Hello @tag!", [{
    tag: "tag",
    id: "user_id"
}]);
```

### Event Listeners
```javascript
// Typing status
fca.on('typing', (data) => {
    console.log(`${data.userId} is typing...`);
});

// Online presence
fca.on('presence', (activeUsers) => {
    console.log('Online users:', activeUsers);
});

// Message reactions
fca.on('message_reaction', (data) => {
    console.log(`Reaction ${data.reaction} on message ${data.messageId}`);
});
```

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

## Support

If you have any issues or questions, please:
1. Check the documentation
2. Search existing issues
3. Open a new issue if needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
