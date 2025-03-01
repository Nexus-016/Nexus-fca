class CaptchaSolver {
    constructor() {
        this.captchaCallbacks = new Map();
    }

    async handleCaptcha(page) {
        try {
            // Check for different types of captcha
            const captchaSelectors = [
                '#captcha',
                'input[name="captcha_response"]',
                'iframe[src*="captcha"]',
                '#recaptcha',
                '.g-recaptcha'
            ];

            for (const selector of captchaSelectors) {
                const captchaElement = await page.$(selector);
                if (captchaElement) {
                    // Emit event for manual solving
                    if (this.captchaCallbacks.size > 0) {
                        const screenshot = await page.screenshot({
                            clip: await captchaElement.boundingBox()
                        });
                        
                        return new Promise((resolve) => {
                            this.emit('captcha.required', {
                                image: screenshot,
                                callback: async (solution) => {
                                    if (selector.includes('recaptcha')) {
                                        await this._solveRecaptcha(page, solution);
                                    } else {
                                        await page.fill('input[name="captcha_response"]', solution);
                                    }
                                    resolve(true);
                                }
                            });
                        });
                    }
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Captcha handling error:', error);
            return false;
        }
    }

    async _solveRecaptcha(page, token) {
        await page.evaluate((rcToken) => {
            window.grecaptcha.getResponse = () => rcToken;
            document.querySelector('#g-recaptcha-response').innerHTML = rcToken;
        }, token);
    }

    onCaptcha(callback) {
        const id = Date.now().toString();
        this.captchaCallbacks.set(id, callback);
        return () => this.captchaCallbacks.delete(id);
    }

    emit(event, data) {
        this.captchaCallbacks.forEach(callback => callback(event, data));
    }
}

module.exports = CaptchaSolver;
