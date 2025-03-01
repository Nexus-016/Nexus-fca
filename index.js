const { NexusFCA } = require('./src/NexusFCA');

// Create pre-configured instance
const nexus = new NexusFCA();

// Export both the class and instance
module.exports = {
    NexusFCA,  // For those who want to create custom instances
    nexus      // Pre-configured instance for easy use
};
