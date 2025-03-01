const crypto = require('crypto');

class LoginSecurity {
    constructor() {
        this.loginPatterns = [];
        this.lastLoginAttempt = null;
        this.blockedIPs = new Set();
    }

    generateLoginPattern() {
        // Create random delays between actions
        return {
            preLoginDelay: Math.floor(Math.random() * 2000) + 1000,
            typeDelays: {
                min: Math.floor(Math.random() * 50) + 30,
                max: Math.floor(Math.random() * 100) + 80
            },
            mouseMovePattern: this._generateMousePattern(),
            viewport: this._generateViewport()
        };
    }

    validateLoginAttempt() {
        const now = Date.now();
        if (this.lastLoginAttempt && (now - this.lastLoginAttempt < 60000)) {
            throw new Error('Too many login attempts. Please wait.');
        }
        this.lastLoginAttempt = now;
    }

    _generateMousePattern() {
        // Simulate human-like mouse movements
        return {
            points: Array.from({length: 5}, () => ({
                x: Math.floor(Math.random() * 100),
                y: Math.floor(Math.random() * 100)
            })),
            speed: Math.floor(Math.random() * 3) + 1
        };
    }

    _generateViewport() {
        const commonResolutions = [
            [1366, 768],
            [1920, 1080],
            [1536, 864],
            [1440, 900],
            [1280, 720]
        ];
        return commonResolutions[Math.floor(Math.random() * commonResolutions.length)];
    }

    async simulateHumanBehavior(page) {
        const pattern = this.generateLoginPattern();
        
        // Random mouse movements
        for (const point of pattern.mouseMovePattern.points) {
            await page.mouse.move(point.x, point.y, {
                steps: pattern.mouseMovePattern.speed * 10
            });
        }

        // Random page scroll
        await page.evaluate(() => {
            window.scrollBy(0, Math.random() * 100);
        });

        return pattern;
    }

    hashCredentials(email, password) {
        const hash = crypto.createHash('sha256');
        return hash.update(`${email}:${password}`).digest('hex');
    }
}

module.exports = LoginSecurity;
