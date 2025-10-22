const fs = require('node:fs').promises;
const path = require('node:path');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const zlib = require('node:zlib');
const logger = require('./logger');

class BackupManager {
    constructor(config = {}) {
        this.backupDir = config.backupDir || './backups';
        this.maxBackups = config.maxBackups || 10;
        this.compressionLevel = config.compressionLevel || 6;
        this.autoBackupInterval = config.autoBackupInterval || 86400000; // 24 hours
        this.excludePatterns = config.excludePatterns || [
            'node_modules',
            'logs',
            '*.log',
            '.env',
            'backups'
        ];
        
        this.BACKUP_TYPES = {
            FULL: 'full',
            INCREMENTAL: 'incremental',
            CONFIG_ONLY: 'config_only',
            DATA_ONLY: 'data_only'
        };
        
        this.isBackupRunning = false;
        this.lastBackupTime = null;
        this.backupHistory = [];
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        await this.initializeBackupSystem();
        this.isInitialized = true;
    }

    async waitForInitialization() {
        return this.initialize();
    }

    async initializeBackupSystem() {
        try {
            // Create backup directory if it doesn't exist
            await fs.mkdir(this.backupDir, { recursive: true });
            
            // Load backup history
            await this.loadBackupHistory();
            
            // Setup auto-backup if enabled
            if (this.autoBackupInterval > 0) {
                this.setupAutoBackup();
            }
            
            logger.info('Backup system initialized', {
                backupDir: this.backupDir,
                maxBackups: this.maxBackups,
                autoBackupInterval: this.autoBackupInterval
            });
            
        } catch (error) {
            logger.error('Failed to initialize backup system', { error: error.message });
        }
    }

    async loadBackupHistory() {
        try {
            const historyFile = path.join(this.backupDir, 'backup_history.json');
            const historyData = await fs.readFile(historyFile, 'utf8');
            this.backupHistory = JSON.parse(historyData);
        } catch (error) {
            // History file doesn't exist or is corrupted, start fresh
            logger.debug('Backup history file not found or corrupted, starting fresh', { error: error.message });
            this.backupHistory = [];
        }
    }

    async saveBackupHistory() {
        try {
            const historyFile = path.join(this.backupDir, 'backup_history.json');
            await fs.writeFile(historyFile, JSON.stringify(this.backupHistory, null, 2));
        } catch (error) {
            logger.error('Failed to save backup history', { error: error.message });
        }
    }

    setupAutoBackup() {
        setInterval(async () => {
            try {
                if (!this.isBackupRunning) {
                    logger.info('Starting automatic backup');
                    await this.createBackup(this.BACKUP_TYPES.INCREMENTAL, true);
                }
            } catch (error) {
                logger.error('Auto-backup failed', { error: error.message });
            }
        }, this.autoBackupInterval);
        
        logger.info('Auto-backup scheduled', { 
            interval: `${this.autoBackupInterval / 1000 / 60} minutes` 
        });
    }

    async createBackup(type = this.BACKUP_TYPES.FULL, isAutomatic = false) {
        if (this.isBackupRunning) {
            throw new Error('Backup already in progress');
        }

        this.isBackupRunning = true;
        const startTime = Date.now();
        
        try {
            const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
            const backupName = `backup_${type}_${timestamp}`;
            const backupPath = path.join(this.backupDir, `${backupName}.tar.gz`);
            
            logger.info('Starting backup', { type, backupName, isAutomatic });

            // Create backup based on type
            let files = [];
            switch (type) {
                case this.BACKUP_TYPES.FULL:
                    files = await this.getFullBackupFiles();
                    break;
                case this.BACKUP_TYPES.INCREMENTAL:
                    files = await this.getIncrementalBackupFiles();
                    break;
                case this.BACKUP_TYPES.CONFIG_ONLY:
                    files = await this.getConfigFiles();
                    break;
                case this.BACKUP_TYPES.DATA_ONLY:
                    files = await this.getDataFiles();
                    break;
                default:
                    throw new Error(`Unknown backup type: ${type}`);
            }

            // Create compressed archive
            await this.createCompressedArchive(files, backupPath);
            
            // Get backup info
            const stats = await fs.stat(backupPath);
            const duration = Date.now() - startTime;
            
            const backupInfo = {
                id: backupName,
                type,
                timestamp: new Date().toISOString(),
                size: stats.size,
                filesCount: files.length,
                duration,
                isAutomatic,
                path: backupPath,
                checksums: await this.generateChecksums(files)
            };

            // Add to history
            this.backupHistory.unshift(backupInfo);
            await this.saveBackupHistory();
            
            // Clean up old backups
            await this.cleanupOldBackups();
            
            this.lastBackupTime = new Date();
            
            logger.info('Backup completed successfully', {
                backupName,
                size: `${Math.round(stats.size / 1024 / 1024 * 100) / 100}MB`,
                duration: `${duration}ms`,
                filesCount: files.length
            });

            return backupInfo;

        } catch (error) {
            logger.error('Backup failed', { error: error.message, type });
            throw error;
        } finally {
            this.isBackupRunning = false;
        }
    }

    async getFullBackupFiles() {
        const projectRoot = process.cwd();
        return await this.getFilesRecursively(projectRoot, this.excludePatterns);
    }

    async getIncrementalBackupFiles() {
        const lastBackup = this.backupHistory.find(backup => 
            backup.type === this.BACKUP_TYPES.FULL || backup.type === this.BACKUP_TYPES.INCREMENTAL
        );
        
        if (!lastBackup) {
            // No previous backup, do full backup
            return await this.getFullBackupFiles();
        }

        const cutoffTime = new Date(lastBackup.timestamp);
        const projectRoot = process.cwd();
        const allFiles = await this.getFilesRecursively(projectRoot, this.excludePatterns);
        
        // Filter files modified since last backup
        const modifiedFiles = [];
        for (const file of allFiles) {
            try {
                const stats = await fs.stat(file);
                if (stats.mtime > cutoffTime) {
                    modifiedFiles.push(file);
                }
            } catch (error) {
                // File might have been deleted, skip it
                logger.debug('File not accessible during backup filtering', { file, error: error.message });
                continue;
            }
        }

        return modifiedFiles;
    }

    async getConfigFiles() {
        const configPatterns = [
            'package.json',
            'package-lock.json',
            'config.json',
            '.env.example',
            'src/config/**',
            '*.config.js',
            '*.config.json'
        ];
        
        return await this.getFilesByPatterns(configPatterns);
    }

    async getDataFiles() {
        const dataPatterns = [
            '*.db',
            '*.sqlite',
            '*.sqlite3',
            'data/**',
            'database/**',
            'conversations/**',
            'logs/**'
        ];
        
        return await this.getFilesByPatterns(dataPatterns);
    }

    async getFilesRecursively(dir, excludePatterns = []) {
        const files = [];
        
        async function scanDirectory(currentDir) {
            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    const relativePath = path.relative(process.cwd(), fullPath);
                    
                    // Check if file/directory should be excluded
                    const shouldExclude = excludePatterns.some(pattern => {
                        if (relativePath.includes(pattern.replace('*', ''))) {
                            return true;
                        }
                        const regex = new RegExp(pattern.replace('*', '.*'));
                        return regex.exec(entry.name) !== null;
                    });
                    
                    if (shouldExclude) {
                        continue;
                    }
                    
                    if (entry.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                logger.warn('Error reading directory', { dir: currentDir, error: error.message });
            }
        }
        
        await scanDirectory(dir);
        return files;
    }

    async getFilesByPatterns(patterns) {
        const files = [];
        const projectRoot = process.cwd();
        
        for (const pattern of patterns) {
            if (pattern.includes('**')) {
                // Recursive pattern
                const baseDir = pattern.split('**')[0];
                const fullDir = path.join(projectRoot, baseDir);
                try {
                    const recursiveFiles = await this.getFilesRecursively(fullDir);
                    files.push(...recursiveFiles);
                } catch (error) {
                    // Directory doesn't exist, skip
                    logger.debug('Directory not found for backup pattern', { pattern, error: error.message });
                    continue;
                }
            } else {
                // Simple file pattern
                const fullPath = path.join(projectRoot, pattern);
                try {
                    await fs.access(fullPath);
                    files.push(fullPath);
                } catch (error) {
                    // File doesn't exist, skip
                    logger.debug('File not found for backup pattern', { pattern, error: error.message });
                    continue;
                }
            }
        }
        
        return files;
    }

    async createCompressedArchive(files, outputPath) {
        const archive = [];
        
        for (const file of files) {
            try {
                const content = await fs.readFile(file);
                const relativePath = path.relative(process.cwd(), file);
                archive.push({
                    path: relativePath,
                    content: content.toString('base64')
                });
            } catch (error) {
                logger.warn('Failed to read file for backup', { file, error: error.message });
            }
        }
        
        const archiveData = JSON.stringify(archive);
        const compressed = zlib.gzipSync(archiveData, { level: this.compressionLevel });
        
        await fs.writeFile(outputPath, compressed);
    }

    async generateChecksums(files) {
                            const crypto = require('node:crypto');
        const checksums = {};
        
        for (const file of files) {
            try {
                const content = await fs.readFile(file);
                const hash = crypto.createHash('sha256').update(content).digest('hex');
                checksums[path.relative(process.cwd(), file)] = hash;
            } catch (error) {
                // File read error, skip checksum
                logger.debug('Unable to read file for checksum', { file, error: error.message });
                continue;
            }
        }
        
        return checksums;
    }

    async restoreBackup(backupId, targetDir = null) {
        const backup = this.backupHistory.find(b => b.id === backupId);
        if (!backup) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const restoreDir = targetDir || process.cwd();
        const backupPath = backup.path;
        
        logger.info('Starting restore', { backupId, targetDir: restoreDir });

        try {
            // Read compressed backup
            const compressedData = await fs.readFile(backupPath);
            const decompressed = zlib.gunzipSync(compressedData);
            const archive = JSON.parse(decompressed.toString());
            
            // Restore files
            for (const item of archive) {
                const targetPath = path.join(restoreDir, item.path);
                const targetDirPath = path.dirname(targetPath);
                
                // Create directory if it doesn't exist
                await fs.mkdir(targetDirPath, { recursive: true });
                
                // Write file content
                const content = Buffer.from(item.content, 'base64');
                await fs.writeFile(targetPath, content);
            }
            
            logger.info('Restore completed successfully', {
                backupId,
                filesRestored: archive.length,
                targetDir: restoreDir
            });

            return {
                success: true,
                filesRestored: archive.length,
                targetDir: restoreDir
            };

        } catch (error) {
            logger.error('Restore failed', { backupId, error: error.message });
            throw error;
        }
    }

    async verifyBackup(backupId) {
        const backup = this.backupHistory.find(b => b.id === backupId);
        if (!backup) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        try {
            // Check if backup file exists
            await fs.access(backup.path);
            
            // Verify file integrity by attempting to decompress
            const compressedData = await fs.readFile(backup.path);
            const decompressed = zlib.gunzipSync(compressedData);
            const archive = JSON.parse(decompressed.toString());
            
            // Verify checksums if available
            let verificationResult = {
                fileExists: true,
                canDecompress: true,
                filesCount: archive.length,
                checksumVerification: null
            };

            if (backup.checksums) {
                const currentChecksums = {};
                for (const item of archive) {
                    const content = Buffer.from(item.content, 'base64');
                    const crypto = require('node:crypto');
                    const hash = crypto.createHash('sha256').update(content).digest('hex');
                    currentChecksums[item.path] = hash;
                }
                
                verificationResult.checksumVerification = {
                    passed: JSON.stringify(currentChecksums) === JSON.stringify(backup.checksums),
                    differences: this.findChecksumDifferences(backup.checksums, currentChecksums)
                };
            }

            return verificationResult;

        } catch (error) {
            logger.error('Backup verification failed', { backupId, error: error.message });
            return {
                fileExists: false,
                canDecompress: false,
                error: error.message
            };
        }
    }

    findChecksumDifferences(original, current) {
        const differences = [];
        
        for (const [file, hash] of Object.entries(original)) {
            if (!current[file]) {
                differences.push({ file, issue: 'missing' });
            } else if (current[file] !== hash) {
                differences.push({ file, issue: 'modified' });
            }
        }
        
        for (const file of Object.keys(current)) {
            if (!original[file]) {
                differences.push({ file, issue: 'extra' });
            }
        }
        
        return differences;
    }

    async cleanupOldBackups() {
        if (this.backupHistory.length <= this.maxBackups) {
            return;
        }

        const backupsToDelete = this.backupHistory.slice(this.maxBackups);
        
        for (const backup of backupsToDelete) {
            try {
                await fs.unlink(backup.path);
                logger.info('Deleted old backup', { backupId: backup.id });
            } catch (error) {
                logger.warn('Failed to delete old backup', { 
                    backupId: backup.id, 
                    error: error.message 
                });
            }
        }
        
        this.backupHistory = this.backupHistory.slice(0, this.maxBackups);
        await this.saveBackupHistory();
    }

    async deleteBackup(backupId) {
        const backupIndex = this.backupHistory.findIndex(b => b.id === backupId);
        if (backupIndex === -1) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const backup = this.backupHistory[backupIndex];
        
        try {
            await fs.unlink(backup.path);
            this.backupHistory.splice(backupIndex, 1);
            await this.saveBackupHistory();
            
            logger.info('Backup deleted', { backupId });
            return true;
        } catch (error) {
            logger.error('Failed to delete backup', { backupId, error: error.message });
            throw error;
        }
    }

    getBackupHistory() {
        return this.backupHistory.map(backup => ({
            ...backup,
            sizeFormatted: this.formatFileSize(backup.size),
            durationFormatted: this.formatDuration(backup.duration)
        }));
    }

    getBackupStats() {
        const totalSize = this.backupHistory.reduce((sum, backup) => sum + backup.size, 0);
        const avgSize = this.backupHistory.length > 0 ? totalSize / this.backupHistory.length : 0;
        
        return {
            totalBackups: this.backupHistory.length,
            totalSize: this.formatFileSize(totalSize),
            averageSize: this.formatFileSize(avgSize),
            lastBackup: this.lastBackupTime,
            isRunning: this.isBackupRunning,
            nextAutoBackup: this.autoBackupInterval > 0 ? 
                new Date(Date.now() + this.autoBackupInterval) : null
        };
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

module.exports = BackupManager;