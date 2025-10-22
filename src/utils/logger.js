const winston = require('winston');
const path = require('node:path');

// Create logs directory if it doesn't exist
const fs = require('node:fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Safe stringify helper to avoid circular references
function safeStringify(obj) {
    try {
        return JSON.stringify(obj, (_k, v) => {
            if (typeof v === 'bigint') return String(v);
            return v;
        });
    } catch (e) {
        // Fallback - return a best-effort string representation
        // Log the error using console.debug if available
        if (console && typeof console.debug === 'function') {
            console.debug('safeStringify failed:', e?.message);
        }
        // Return a safe fallback string
        return '[unserializable]';
    }
}

// Custom format for better readability
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
    // Normalize timestamp to a string (avoid stringifying arbitrary objects)
    let timestampStr;
    if (typeof timestamp === 'string') timestampStr = timestamp;
    else if (timestamp instanceof Date) timestampStr = timestamp.toISOString();
    else timestampStr = new Date().toISOString();
        const messageStr = (typeof message === 'string') ? message : safeStringify(message);
        const logMessage = `${timestampStr} [${level.toUpperCase()}]: ${messageStr}`;
        let stackStr = '';
        if (stack) {
            stackStr = (typeof stack === 'string') ? stack : safeStringify(stack);
        }
        return stackStr ? `${logMessage}\n${stackStr}` : logMessage;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'scottbot' },
    transports: [
        // Error logs - separate file for errors only
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Combined logs - all levels
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Console output with colors for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Handle uncaught exceptions
logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(logsDir, 'exceptions.log'),
        maxsize: 5242880,
        maxFiles: 3
    })
);

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason: safeStringify(reason), promise: safeStringify(promise) });
});

// Suppress common Node.js warnings to keep console clean
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    // Filter out common warnings we don't need to see
    const suppressWarnings = [
        'ExperimentalWarning',
        'DeprecationWarning',
        'MaxListenersExceededWarning'
    ];
    
    if (!suppressWarnings.some(type => warning.name.includes(type))) {
        logger.warn('Process warning:', warning.message);
    }
});

module.exports = logger;