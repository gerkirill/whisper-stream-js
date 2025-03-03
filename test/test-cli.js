#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

try {
    // Test the CLI help command
    console.log('Testing whisper-stream CLI...');
    const output = execSync('node ' + path.join(rootDir, 'whisper-stream.js') + ' --help', { encoding: 'utf8' });

    // Check if the output contains expected help text
    if (output.includes('Usage:') && output.includes('Options:') && output.includes('whisper-stream')) {
        console.log('✅ CLI test passed! The whisper-stream CLI is working correctly.');
    } else {
        console.error('❌ CLI test failed! The help command did not return the expected output.');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ CLI test failed with error:', error.message);
    process.exit(1);
}
