class RateLimit {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000; // 1 minute
        this.maxRequests = options.maxRequests || 30; // requests per window
        this.requests = new Map();
        this.queue = [];
        this.minDelay = 1000; // minimum delay between requests
        this.maxDelay = 3000; // maximum delay between requests
    }

    async throttle() {
        const delay = Math.floor(Math.random() * (this.maxDelay - this.minDelay) + this.minDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async checkLimit(key = 'default') {
        await this.throttle();

        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Clean old requests
        this.requests.forEach((timestamps, userKey) => {
            this.requests.set(userKey, timestamps.filter(time => time > windowStart));
        });

        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }

        const userRequests = this.requests.get(key);

        // Check if limit exceeded
        if (userRequests.length >= this.maxRequests) {
            return new Promise((resolve) => {
                this.queue.push({ key, resolve });
            });
        }

        // Add new request timestamp
        userRequests.push(now);
        this.requests.set(key, userRequests);

        // Process queue if possible
        this._processQueue();

        return Promise.resolve();
    }

    _processQueue() {
        setInterval(() => {
            if (this.queue.length > 0) {
                const now = Date.now();
                const windowStart = now - this.windowMs;
                
                const nextRequest = this.queue[0];
                const userRequests = this.requests.get(nextRequest.key).filter(time => time > windowStart);

                if (userRequests.length < this.maxRequests) {
                    const { resolve } = this.queue.shift();
                    userRequests.push(now);
                    this.requests.set(nextRequest.key, userRequests);
                    resolve();
                }
            }
        }, 100);
    }
}

module.exports = RateLimit;
