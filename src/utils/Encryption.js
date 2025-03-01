const crypto = require('crypto');

class Encryption {
    constructor(key = process.env.ENCRYPTION_KEY || 'nexus-fca-secure-key') {
        this.algorithm = 'aes-256-gcm';
        this.key = crypto.scryptSync(key, 'salt', 32);
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return {
            iv: iv.toString('hex'),
            encrypted: encrypted,
            authTag: authTag.toString('hex')
        };
    }

    decrypt(data) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(data.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

module.exports = Encryption;
