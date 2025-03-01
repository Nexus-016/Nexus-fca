const { chromium } = require('playwright');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const Queue = require('./utils/Queue');
const Encryption = require('./utils/Encryption');
const SecurityManager = require('./utils/SecurityManager');
const RateLimit = require('./utils/RateLimit');
const Cache = require('./utils/Cache');
const LoginSecurity = require('./utils/LoginSecurity');
const CaptchaSolver = require('./utils/CaptchaSolver');

class NexusFCA extends EventEmitter {
    static getInstance() {
        if (!NexusFCA._instance) {
            NexusFCA._instance = new NexusFCA();
        }
        return NexusFCA._instance;
    }

    constructor(options = {}) {
        super();
        this.options = {
            sessionPath: path.join(__dirname, '../sessions'),
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            proxy: null,
            reconnectInterval: 2000,
            autoReconnect: true,
            maxRetries: 3,
            ...options
        };
        this.browser = null;
        this.page = null;
        this.messageQueue = new Queue();
        this.retryCount = 0;
        this.isConnected = false;
        this.encryption = new Encryption(options.encryptionKey);
        this.security = new SecurityManager();
        this.rateLimit = new RateLimit({
            windowMs: options.rateLimitWindow || 60000,
            maxRequests: options.maxRequestsPerWindow || 30
        });
        this.cache = new Cache(options.cacheSize || 100);
        this.pagePool = [];
        this.maxPages = options.maxPages || 3;
        this.loginSecurity = new LoginSecurity();
        this.captchaSolver = new CaptchaSolver();
    }

    async login(email, password) {
        try {
            const context = await this._initBrowser();
            await this._loadSession(context);
            
            if (!this.isConnected) {
                await this._performLogin(email, password);
            }

            await this._setupListeners();
            this.isConnected = true;
            this.emit('login.success');
        } catch (error) {
            await this._handleLoginError(error, email, password);
        }
    }

    async loginWithCookie(cookies) {
        try {
            const context = await this._initBrowser();
            await context.addCookies(typeof cookies === 'string' ? JSON.parse(cookies) : cookies);
            
            // Verify cookie validity
            await this.page.goto('https://www.facebook.com/');
            const isValid = await this._validateSession();
            
            if (isValid) {
                await this._setupListeners();
                this.isConnected = true;
                this.emit('login.success');
            } else {
                throw new Error('Invalid cookies');
            }
        } catch (error) {
            this.emit('login.failed', error);
            throw error;
        }
    }

    async sendMessage(userId, message, attachment = null) {
        await this.security.checkRateLimit();
        await this.rateLimit.checkLimit(`msg_${userId}`);
        
        return new Promise((resolve, reject) => {
            this.messageQueue.enqueue(async () => {
                try {
                    await this.page.goto(`https://www.facebook.com/messages/t/${userId}`);
                    
                    // Handle typing indicator
                    await this.page.click('div[contenteditable="true"]');
                    await this.page.waitForTimeout(Math.random() * 1000 + 500);
                    
                    if (attachment) {
                        await this._handleAttachment(attachment);
                    }
                    
                    await this.page.fill('div[contenteditable="true"]', message);
                    await this.page.keyboard.press('Enter');
                    
                    resolve(true);
                } catch (error) {
                    this.emit('message.failed', error);
                    if (this.options.autoReconnect) {
                        await this._reconnect();
                    }
                    reject(error);
                }
            });
        });
    }

    async setMessageReaction(messageId, reaction) {
        return this._performAction('reaction', async () => {
            try {
                await this.page.click(`[data-message-id="${messageId}"]`);
                await this.page.click(`[data-reaction="${reaction}"]`);
                return true;
            } catch (error) {
                this.emit('reaction.failed', error);
                return false;
            }
        });
    }

    async markAsRead(threadID) {
        return this._performAction('markAsRead', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            await this.page.evaluate((tid) => {
                window.localStorage.setItem(`last_read_${tid}`, Date.now());
            }, threadID);
        });
    }

    async unsendMessage(messageID) {
        return this._performAction('unsend', async () => {
            await this.page.click(`[data-message-id="${messageID}"] [aria-label="More"]`);
            await this.page.click('text="Remove"');
            await this.page.click('text="Remove for everyone"');
            return true;
        });
    }

    async setTyping(threadID, isTyping = true) {
        return this._performAction('typing', async () => {
            if (isTyping) {
                await this.page.focus('div[contenteditable="true"]');
            } else {
                await this.page.evaluate(() => document.activeElement.blur());
            }
        });
    }

    async getFriendsList() {
        return this._performAction('getFriends', async () => {
            await this.page.goto('https://www.facebook.com/friends');
            return await this.page.evaluate(() => {
                const friends = [];
                document.querySelectorAll('[data-testid="friend_list_item"]').forEach(el => {
                    friends.push({
                        userID: el.getAttribute('data-id'),
                        fullName: el.querySelector('a').innerText,
                        profileUrl: el.querySelector('a').href
                    });
                });
                return friends;
            });
        });
    }

    async createGroup(participantIDs, groupTitle) {
        return this._performAction('createGroup', async () => {
            await this.page.goto('https://www.facebook.com/messages/t/');
            await this.page.click('[aria-label="New Message"]');
            
            for (const id of participantIDs) {
                await this.page.fill('[aria-label="Send message to"]', id);
                await this.page.keyboard.press('Enter');
            }
            
            if (groupTitle) {
                await this.page.click('[aria-label="Conversation information"]');
                await this.page.click('text="Change Chat Name"');
                await this.page.fill('input[type="text"]', groupTitle);
                await this.page.keyboard.press('Enter');
            }
            
            return true;
        });
    }

    async addUserToGroup(userID, threadID) {
        return this._performAction('addToGroup', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            await this.page.click('[aria-label="Add people"]');
            await this.page.fill('input[type="text"]', userID);
            await this.page.keyboard.press('Enter');
            await this.page.click('text="Add"');
            return true;
        });
    }

    async removeUserFromGroup(userID, threadID) {
        return this._performAction('removeFromGroup', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            await this.page.click('[aria-label="Conversation information"]');
            await this.page.click(`[data-id="${userID}"] [aria-label="Remove"]`);
            await this.page.click('text="Remove"');
            return true;
        });
    }

    async changeThreadColor(threadID, color) {
        return this._performAction('changeColor', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            await this.page.click('[aria-label="Conversation information"]');
            await this.page.click('text="Change Chat Color"');
            await this.page.click(`[data-color="${color}"]`);
            return true;
        });
    }

    async changeThreadEmoji(threadID, emoji) {
        return this._performAction('changeEmoji', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            await this.page.click('[aria-label="Conversation information"]');
            await this.page.click('text="Change Emoji"');
            await this.page.fill('input[type="text"]', emoji);
            await this.page.keyboard.press('Enter');
            return true;
        });
    }

    async getUserInfo(userID) {
        // Try cache first
        const cached = this.cache.get(`user_${userID}`);
        if (cached) return cached;

        const info = await this._performAction('getUserInfo', async () => {
            await this.page.goto(`https://www.facebook.com/${userID}`);
            return await this.page.evaluate(() => ({
                id: document.querySelector('[data-scoped-id]')?.getAttribute('data-scoped-id'),
                name: document.querySelector('h1')?.innerText,
                profileUrl: window.location.href,
                thumbSrc: document.querySelector('[data-imgperflogname="profileCoverPhoto"]')?.src
            }));
        });

        // Cache the result
        this.cache.set(`user_${userID}`, info, 3600000); // 1 hour cache
        return info;
    }

    async getThreadInfo(threadID) {
        const cached = this.cache.get(`thread_${threadID}`);
        if (cached) return cached;

        const info = await this._performAction('getThreadInfo', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            return await this.page.evaluate(() => ({
                threadID: window.location.href.split('/').pop(),
                threadName: document.querySelector('[role="main"] h1')?.innerText,
                participants: Array.from(document.querySelectorAll('[data-scope="members_list"] [data-id]'))
                    .map(el => ({
                        id: el.getAttribute('data-id'),
                        name: el.querySelector('span')?.innerText
                    })),
                emoji: document.querySelector('[aria-label="Conversation information"] [role="img"]')?.innerText,
                color: document.querySelector('[aria-label="Conversation information"] [role="button"]')
                    ?.getAttribute('data-color')
            }));
        });

        this.cache.set(`thread_${threadID}`, info, 300000); // 5 minutes cache
        return info;
    }

    async _performAction(actionType, callback) {
        await this.rateLimit.checkLimit(`action_${actionType}`);
        const page = await this._getFreePage();
        
        try {
            const result = await callback(page);
            await this._releasePage(page);
            return result;
        } catch (error) {
            await this._releasePage(page);
            this.emit(`${actionType}.failed`, error);
            throw error;
        }
    }

    async _initBrowser() {
        const securityConfig = this.security.getRandomConfig();
        
        this.browser = await chromium.launch({
            headless: true,
            proxy: this.options.proxy,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                `--user-agent=${securityConfig.userAgent}`
            ]
        });

        const context = await this.browser.newContext({
            ...securityConfig,
            permissions: ['notifications'],
            bypassCSP: true,
            javaScriptEnabled: true,
            hasTouch: Math.random() > 0.5,
            isMobile: false,
            deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
        });

        // Intercept and modify headers
        await context.route('**/*', async (route) => {
            const headers = route.request().headers();
            headers['sec-ch-ua'] = '"Chromium";v="92", " Not A;Brand";v="99", "Google Chrome";v="92"';
            headers['sec-ch-ua-mobile'] = '?0';
            await route.continue({ headers });
        });

        // Initialize page pool
        for (let i = 0; i < this.maxPages; i++) {
            const page = await context.newPage();
            this.pagePool.push(page);
        }

        this.page = this.pagePool[0];
        return context;
    }

    async _handleAttachment(attachment) {
        const fileInput = await this.page.$('input[type="file"]');
        await fileInput.setInputFiles(attachment);
        await this.page.waitForSelector('[aria-label="Send"]');
    }

    async _reconnect() {
        if (this.retryCount < this.options.maxRetries) {
            this.retryCount++;
            await new Promise(resolve => setTimeout(resolve, this.options.reconnectInterval));
            await this.login(this.options.email, this.options.password);
        } else {
            throw new Error('Max reconnection attempts reached');
        }
    }

    async _setupListeners() {
        await this.page.evaluate(() => {
            window.addEventListener('unload', () => {
                window.needsReconnect = true;
            });
        });

        this.page.on('response', async response => {
            if (response.url().includes('/messages/')) {
                const data = await response.json().catch(() => ({}));
                if (data.message) {
                    this.emit('message.new', data);
                }
            }
        });

        // Add typing indicator listener
        this.page.on('console', msg => {
            if (msg.text().includes('typing_status')) {
                const data = JSON.parse(msg.text());
                this.emit('typing', data);
            }
        });

        // Add presence listener
        setInterval(async () => {
            const activeUsers = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('[data-active="true"]'))
                    .map(el => el.getAttribute('data-id'));
            });
            this.emit('presence', activeUsers);
        }, 10000);

        // Add message reaction listener
        this.page.on('response', async response => {
            if (response.url().includes('/reactions/')) {
                const data = await response.json().catch(() => ({}));
                if (data.reaction) {
                    this.emit('message_reaction', data);
                }
            }
        });
    }

    async sendMessageWithMentions(threadID, msg, mentions) {
        return this._performAction('sendWithMentions', async () => {
            await this.page.goto(`https://www.facebook.com/messages/t/${threadID}`);
            
            let messageText = msg;
            for (const mention of mentions) {
                messageText = messageText.replace(
                    `@${mention.tag}`,
                    `@[${mention.id}]`
                );
            }
            
            await this.page.fill('div[contenteditable="true"]', messageText);
            await this.page.keyboard.press('Enter');
            return true;
        });
    }

    async _saveSession() {
        const sessionData = await this.browser.contexts()[0].storageState();
        const encryptedData = this.encryption.encrypt(JSON.stringify(sessionData));
        
        if (!fs.existsSync(this.options.sessionPath)) {
            fs.mkdirSync(this.options.sessionPath, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(this.options.sessionPath, 'session.enc'),
            JSON.stringify(encryptedData)
        );
    }

    async _loadSession(context) {
        const sessionPath = path.join(this.options.sessionPath, 'session.enc');
        if (fs.existsSync(sessionPath)) {
            const encryptedData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            const sessionData = JSON.parse(this.encryption.decrypt(encryptedData));
            await context.addCookies(sessionData.cookies || []);
            this.isConnected = true;
        }
    }

    async _validateSession() {
        try {
            await this.page.waitForSelector('[data-pagelet="Stories"]', { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async _performLogin(email, password) {
        try {
            // Validate login attempt frequency
            this.loginSecurity.validateLoginAttempt();

            // Enhanced login security
            await this.page.goto('https://www.facebook.com/login');
            
            // Clear any existing data
            await this.page.context().clearCookies();
            await this.page.context().clearPermissions();
            
            // Apply human behavior pattern
            const pattern = await this.loginSecurity.simulateHumanBehavior(this.page);
            
            // Random initial delay
            await this.page.waitForTimeout(pattern.preLoginDelay);

            // Secure credential handling
            const credentialHash = this.loginSecurity.hashCredentials(email, password);
            
            // Advanced detection prevention
            await this.page.evaluate(() => {
                // Modify navigator properties
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });
                // Hide automation markers
                window.chrome = { runtime: {} };
            });

            // Type email with human-like pattern
            await this.page.type('input[name="email"]', email, {
                delay: pattern.typeDelays.min + Math.random() * 
                       (pattern.typeDelays.max - pattern.typeDelays.min)
            });

            await this.page.waitForTimeout(pattern.preLoginDelay / 2);

            // Type password with different pattern
            await this.page.type('input[name="pass"]', password, {
                delay: pattern.typeDelays.min + Math.random() * 
                       (pattern.typeDelays.max - pattern.typeDelays.min)
            });

            // Random delay before submit
            await this.page.waitForTimeout(Math.random() * 1000 + 500);

            // Handle login button with natural movement
            const loginButton = await this.page.$('button[name="login"]');
            const buttonBox = await loginButton.boundingBox();
            await this.page.mouse.move(
                buttonBox.x + buttonBox.width / 2,
                buttonBox.y + buttonBox.height / 2,
                { steps: 10 }
            );
            await this.page.mouse.down();
            await this.page.waitForTimeout(Math.random() * 100);
            await this.page.mouse.up();

            // Enhanced 2FA handling
            try {
                const twoFactorInput = await this.page.waitForSelector(
                    'input[name="approvals_code"]',
                    { timeout: 5000 }
                );
                if (twoFactorInput) {
                    this.emit('2fa.required');
                    const code = await new Promise(resolve => {
                        this.once('2fa.code', resolve);
                    });
                    await this.page.type('input[name="approvals_code"]', code, {
                        delay: Math.random() * 100 + 50
                    });
                    await this.page.click('button[name="submit"]');
                }
            } catch (e) {
                // No 2FA required
            }

            // After clicking login button, check for captcha
            const captchaResult = await this.captchaSolver.handleCaptcha(this.page);
            if (!captchaResult) {
                // Wait for manual captcha solution
                await new Promise((resolve) => {
                    this.captchaSolver.onCaptcha((event, data) => {
                        if (event === 'captcha.solved') {
                            resolve();
                        }
                    });
                });
            }

            // Advanced validation
            const isValid = await this._validateLogin();
            if (!isValid) {
                throw new Error('Login validation failed');
            }

            // Secure session storage
            await this._saveSession();
            
            // Store encrypted credentials for reconnection
            this.options.email = email;
            this.options.password = password;

        } catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    async _validateLogin() {
        try {
            // Try multiple selectors to confirm login
            const selectors = [
                '[data-pagelet="Stories"]',
                'div[role="main"]',
                '[aria-label="Facebook"]'
            ];

            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    return true;
                } catch {
                    continue;
                }
            }

            // Check URL to verify login
            const currentUrl = this.page.url();
            if (currentUrl.includes('facebook.com/home') || 
                currentUrl.includes('facebook.com/?sk=h_chr')) {
                return true;
            }

            // Check for error messages
            const errorText = await this.page.$eval('body', el => el.innerText);
            if (errorText.includes('incorrect') || 
                errorText.includes('blocked') || 
                errorText.includes('checkpoint')) {
                return false;
            }

            return false;
        } catch {
            return false;
        }
    }

    async _getFreePage() {
        for (const page of this.pagePool) {
            if (!page._busy) {
                page._busy = true;
                return page;
            }
        }
        // All pages are busy, use the first one
        return this.pagePool[0];
    }

    async _releasePage(page) {
        page._busy = false;
    }

    async _cleanup() {
        this.cache.clear();
        for (const page of this.pagePool) {
            await page.close().catch(() => {});
        }
        this.pagePool = [];
        if (this.browser) {
            await this.browser.close().catch(() => {});
        }
    }

    // Add performance monitoring
    getPerformanceStats() {
        return {
            cache: this.cache.getStats(),
            rateLimit: {
                queue: this.rateLimit.queue.length,
                requests: this.rateLimit.requests.size
            },
            connections: {
                active: this.pagePool.filter(p => p._busy).length,
                total: this.pagePool.length
            },
            memory: process.memoryUsage()
        };
    }

    // Add method to handle manual captcha solving
    async solveCaptcha(solution) {
        this.captchaSolver.emit('captcha.solved', solution);
    }
}

// Create default instance
const nexus = NexusFCA.getInstance();

module.exports = { NexusFCA, nexus };
