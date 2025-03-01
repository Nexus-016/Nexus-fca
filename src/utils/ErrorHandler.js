class ErrorHandler {
    constructor() {
        this.errors = new Map();
        this.retryMap = new Map();
    }

    async handleError(error, context) {
        const errorType = this._getErrorType(error);
        
        switch(errorType) {
            case 'LOGIN_FAILED':
                return this._handleLoginError(error, context);
            
            case 'RATE_LIMIT':
                return this._handleRateLimit(error, context);
            
            case 'CHECKPOINT':
                return this._handleCheckpoint(error, context);
            
            case 'BLOCKED':
                return this._handleBlocked(error, context);
            
            case 'SESSION_EXPIRED':
                return this._handleSessionExpired(error, context);
            
            default:
                throw error;
        }
    }

    _getErrorType(error) {
        const message = error.message.toLowerCase();
        
        if(message.includes('login')) return 'LOGIN_FAILED';
        if(message.includes('rate limit')) return 'RATE_LIMIT';
        if(message.includes('checkpoint')) return 'CHECKPOINT';
        if(message.includes('blocked')) return 'BLOCKED';
        if(message.includes('session')) return 'SESSION_EXPIRED';
        
        return 'UNKNOWN';
    }

    async _handleLoginError(error, context) {
        const retryCount = this.retryMap.get('login') || 0;
        
        if(retryCount < 3) {
            this.retryMap.set('login', retryCount + 1);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return true; // Retry
        }
        
        throw new Error('Maximum login retries exceeded');
    }

    async _handleRateLimit(error, context) {
        const waitTime = parseInt(error.message.match(/\d+/)?.[0] || '60') * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return true;
    }

    async _handleCheckpoint(error, context) {
        context.emit('checkpoint.required', {
            error,
            resolve: async (code) => {
                await context.submitCheckpoint(code);
            }
        });
        return false;
    }

    async _handleBlocked(error, context) {
        await context.rotateProxy();
        return true;
    }

    async _handleSessionExpired(error, context) {
        await context.clearSession();
        return true;
    }
}

module.exports = ErrorHandler;
