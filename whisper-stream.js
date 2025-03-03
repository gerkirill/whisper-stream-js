#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import axios from 'axios';
import { Command } from 'commander';
import { promisify } from 'util';
import FormData from 'form-data';
import clipboard from 'clipboardy';

const execPromise = promisify(exec);
const program = new Command();

// Default configuration and versioning
const VERSION = "1.0.0";

// Setting the default values for the script parameters
let minVolume = "1%";                // Minimum volume threshold
let silenceLength = 1.5;             // Minimum silence duration in seconds
let oneshot = false;                 // Flag to determine if the script should run once or continuously
let duration = 0;                    // Duration of the recording in seconds (0 means continuous)
let model = "whisper-1";             // Model for the OpenAI API
let token = "";                      // OpenAI API token
let outputDir = "";                  // Directory to save the transcriptions
let prompt = "";                     // Prompt for the API call
let language = "";                   // Language code for transcription
let translate = false;               // Flag to indicate translation to English
let audioFile = "";                  // Specific audio file for transcription
let pipeToCmd = "";                  // Command to pipe the transcribed text to
let quietMode = false;               // Flag to determine if the banner and settings should be suppressed
let granularities = "none";          // Timestamp granularities for transcription: segment or word

// Array to store the names of output audio files
const outputFiles = [];
// Variable to store accumulated transcriptions
let accumulatedText = "";
// Variables to store child processes
let recordingProcess = null;
let soxProcess = null;

// Configure command-line options
program
  .version(VERSION, '-V, --version', 'Show the version number')
  .option('-v, --volume <value>', 'Set the minimum volume threshold (default: 1%)')
  .option('-s, --silence <value>', 'Set the minimum silence length (default: 1.5)')
  .option('-o, --oneshot', 'Enable one-shot mode')
  .option('-d, --duration <value>', 'Set the recording duration in seconds (default: 0, continuous)')
  .option('-t, --token <value>', 'Set the OpenAI API token')
  .option('-p, --path <value>', 'Set the output directory path to create the transcription file')
  .option('-g, --granularities <value>', 'Set the timestamp granularities (segment or word)')
  .option('-r, --prompt <value>', 'Set the prompt for the API call')
  .option('-l, --language <value>', 'Set the language in ISO-639-1 format')
  .option('-f, --file <value>', 'Set the audio file to be transcribed')
  .option('-tr, --translate', 'Translate the transcribed text to English')
  .option('-p2, --pipe-to <cmd>', 'Pipe the transcribed text to the specified command (e.g., \'wc -m\')')
  .option('-q, --quiet', 'Suppress the banner and settings')
  .helpOption('-h, --help', 'Display this help message');

program.parse(process.argv);
const options = program.opts();

// Apply command-line options
if (options.volume) {
  minVolume = options.volume;
  if (!minVolume.endsWith('%')) {
    minVolume += '%';
  }
}
if (options.silence) silenceLength = parseFloat(options.silence);
if (options.oneshot) oneshot = true;
if (options.duration) duration = parseInt(options.duration);
if (options.token) token = options.token;
if (options.path) {
  outputDir = options.path;
  // Check if the output directory exists
  if (!fs.existsSync(outputDir)) {
    console.error(`Directory does not exist: ${outputDir}`);
    process.exit(1);
  }
}
if (options.granularities) granularities = options.granularities;
if (options.prompt) prompt = options.prompt;
if (options.language) language = options.language;
if (options.translate) translate = true;
if (options.pipeToCmd) pipeToCmd = options.pipeToCmd;
if (options.file) {
  audioFile = options.file;
  checkAudioFile(audioFile);
}
if (options.quiet) quietMode = true;

// Fetch OpenAI API token from environment if not provided as an argument
if (!token) {
  token = process.env.OPENAI_API_KEY || '';
}

// If no token is provided as an argument or environment variable, exit the script
if (!token) {
  console.error("No OpenAI API key provided. Please provide it as an argument or environment variable.");
  process.exit(1);
}

// Check the validity of the provided audio file
function checkAudioFile(file) {
  // Check if the file exists
  if (!fs.existsSync(file)) {
    console.error(`File does not exist: ${file}`);
    process.exit(1);
  }

  // Check if the file is not empty
  const stats = fs.statSync(file);
  if (stats.size === 0) {
    console.error(`File is empty: ${file}`);
    process.exit(1);
  }

  // Check if the file size is under 25MB
  if (stats.size > 26214400) {
    console.error(`File size is over 25MB: ${file}`);
    process.exit(1);
  }

  // Check if the file format is acceptable
  const ext = path.extname(file).toLowerCase().substring(1);
  const acceptableFormats = ['m4a', 'mp3', 'webm', 'mp4', 'mpga', 'wav', 'mpeg'];
  if (!acceptableFormats.includes(ext)) {
    console.error(`File format is not acceptable: ${file}`);
    process.exit(1);
  }
}

// Function to get the name of the current audio input device
async function getInputDevice() {
  try {
    const platform = os.platform();
    if (platform === 'darwin') {
      // macOS
      try {
        const { stdout } = await execPromise('SwitchAudioSource -t input -c');
        return stdout.trim();
      } catch (error) {
        return null;
      }
    } else if (platform === 'linux') {
      // Linux
      try {
        const { stdout } = await execPromise('arecord -l | grep -oP "(?<=card )\\d+(?=:\\s.*\\[)"');
        return `hw:${stdout.trim()}`;
      } catch (error) {
        return null;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Function to get the volume of the audio input
async function getInputVolume() {
  try {
    const platform = os.platform();
    if (platform === 'darwin') {
      // macOS
      try {
        const { stdout } = await execPromise('osascript -e "input volume of (get volume settings)"');
        return `${stdout.trim()}%`;
      } catch (error) {
        return null;
      }
    } else if (platform === 'linux') {
      // Linux
      try {
        const { stdout } = await execPromise(`amixer sget Capture | grep 'Left:' | awk -F'[][]' '{ print $2 }'`);
        return stdout.trim();
      } catch (error) {
        return null;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Function to display current settings
async function displaySettings() {
  if (quietMode) {
    return;
  }

  console.log('');
  console.log('\x1b[1;34mWhisper Stream Speech-to-Text Transcriber\x1b[0m', VERSION);
  console.log('\x1b[1;33m-----------------------------------------------\x1b[0m');
  console.log('Current settings:');
  console.log(`  Volume threshold: ${minVolume}`);
  console.log(`  Silence length: ${silenceLength} seconds`);
  console.log(`  Input language: ${language || 'Not specified'}`);

  if (translate) {
    console.log(`  Translate to English: ${translate}`);
  }

  if (outputDir) {
    console.log(`  Output Dir: ${outputDir}`);
  }

  // Get the input device
  const inputDevice = await getInputDevice();
  if (inputDevice) {
    console.log(`  Input device: ${inputDevice}`);
  }

  // Get the input volume
  const inputVolume = await getInputVolume();
  if (inputVolume) {
    console.log(`  Input volume: ${inputVolume}`);
  }

  console.log('\x1b[1;33m-----------------------------------------------\x1b[0m');
  console.log('To stop the app, press \x1b[0;36mCtrl+C\x1b[0m');
  console.log('');
}

// Display a rotating spinner animation
function spinner(text = '') {
  const spinChars = ['|', '/', '-', '\\'];
  let i = 0;

  return setInterval(() => {
    process.stdout.write(`\r\x1b[1;31m${spinChars[i]}\x1b[0m ${text}`);
    i = (i + 1) % spinChars.length;
  }, 100);
}

// Convert the audio to text using the OpenAI Whisper API
async function convertAudioToText(outputFile) {
  const baseUrl = translate
    ? 'https://api.openai.com/v1/audio/translations'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const formData = new FormData();
  formData.append('file', fs.createReadStream(outputFile), {
    filename: path.basename(outputFile),
    contentType: 'audio/mpeg'
  });
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');

  // Add optional parameters
  if (granularities !== 'none') {
    formData.append('timestamp_granularities[]', granularities);
  }

  if (prompt) {
    formData.append('prompt', prompt);
  }

  if (language) {
    formData.append('language', language);
  }

  const maxRetries = 3;
  let retries = 0;
  let response;

  while (retries < maxRetries) {
    try {
      response = await axios.post(baseUrl, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        }
      });
      break;
    } catch (error) {
      retries++;
      process.stdout.write('\x1b[1;31m.\x1b[0m');
      if (retries >= maxRetries) {
        console.error('\nFailed to convert audio to text after multiple attempts.');
        return '';
      }
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  process.stdout.write('\r\x1b[K');

  // If response is undefined after retries, return empty string
  if (!response) {
    console.error('Failed to get a response from the API');
    return '';
  }

  let transcription;
  if (granularities !== 'none') {
    transcription = JSON.stringify(response.data);
  } else {
    transcription = response.data.text;
  }

  console.log(transcription);

  if (pipeToCmd) {
    try {
      const { stdout } = await execPromise(`echo "${transcription}" | ${pipeToCmd}`);
      console.log(stdout);
    } catch (error) {
      console.error(`Error executing pipe command: ${error.message}`);
    }
  }

  // Remove the output audio file unless the `-f` option is specified
  if (!audioFile) {
    fs.unlinkSync(outputFile);
  }

  // Accumulate the transcribed text
  accumulatedText += transcription + '\n';

  // Also save to a temporary file
  fs.appendFileSync('temp_transcriptions.txt', transcription + '\n');

  return transcription;
}

// Handle the script termination: clean up and save transcriptions
function handleExit() {
  // Kill all child processes
  if (recordingProcess) {
    recordingProcess.kill();
  }
  if (soxProcess) {
    soxProcess.kill();
  }
  process.removeAllListeners();

  // Remove all output audio files
  for (const file of outputFiles) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // Read from temp_transcriptions.txt if it exists
  if (fs.existsSync('temp_transcriptions.txt')) {
    accumulatedText = fs.readFileSync('temp_transcriptions.txt', 'utf8');
    fs.unlinkSync('temp_transcriptions.txt');
    process.stdout.write('\r\x1b[K\n');
  } else {
    process.stdout.write('\r\x1b[K');
    process.exit(0);
  }

  // If output directory is specified, create a file with the accumulated text in the specified directory
  if (outputDir) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filePath = granularities !== 'none'
      ? path.join(outputDir, `transcription_${timestamp}.json`)
      : path.join(outputDir, `transcription_${timestamp}.txt`);

    fs.writeFileSync(filePath, accumulatedText);
  }

  // Copy the accumulated text to the clipboard
  if (accumulatedText.trim()) {
    try {
      clipboard.writeSync(accumulatedText);
      console.log('\x1b[0;36mTranscription copied to clipboard.\x1b[0m');
    } catch (error) {
      console.error(`Error copying to clipboard: ${error.message}`);
    }
  }

  process.exit(0);
}

// If an audio file is provided, convert it to text and then exit
async function processAudioFile() {
  if (!audioFile) return false;

  // Print banner and settings unless quiet mode is enabled
  if (!quietMode) {
    console.log('');
    console.log('\x1b[1;34mWhisper Stream Transcriber\x1b[0m', VERSION);
    console.log('\x1b[1;33m-----------------------------------------------\x1b[0m');
    console.log('Current settings:');
    console.log(`  Input language: ${language || 'Not specified'}`);

    if (translate) {
      console.log(`  Translate to English: ${translate}`);
    }

    if (outputDir) {
      console.log(`  Output Dir: ${outputDir}`);
    }

    console.log(`  Input file: ${audioFile}`);
    console.log('\x1b[1;33m-----------------------------------------------\x1b[0m');
    console.log('\x1b[0;36mPlease wait ...\x1b[0m');
    console.log('');
  }

  await convertAudioToText(audioFile);
  handleExit();
  return true;
}

// Main function to run the script
async function main() {
  // Handle script termination
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  // If an audio file is provided, process it and exit
  if (await processAudioFile()) return;

  // Display the current configuration/settings of the script
  await displaySettings();

  // Check if required tools are installed
  try {
    await execPromise('sox --version');
  } catch (error) {
    console.error('Error: Sox is not installed. Please install it to use this script.');
    process.exit(1);
  }

  // Main loop to continuously record audio, detect silence, and transcribe audio
  let isRecording = false;
  let outputFile = '';
  let soxProcess = null;

  // Function to start recording
  function startRecording() {
    if (isRecording) return;

    isRecording = true;
    outputFile = `output_${Date.now()}.mp3`;
    outputFiles.push(outputFile);

    // Create a command to record audio with silence detection
    let command = 'rec';
    let args = [
      '-q', '-V0', '-e', 'signed', '-L', '-c', '1', '-b', '16', '-r', '44100', '-t', 'raw',
      '-', 'silence', '1', '0.1', minVolume, '1', silenceLength.toString(), minVolume
    ];

    if (duration > 0) {
      args.splice(args.indexOf('-'), 0, 'trim', '0', duration.toString());
    }

    // Start the recording process
    recordingProcess = spawn(command, args);

    // Create a process to convert raw audio to mp3
    soxProcess = spawn('sox', [
      '-t', 'raw', '-r', '44100', '-b', '16', '-e', 'signed', '-c', '1',
      '-', outputFile
    ]);

    // Pipe the output of rec to sox
    recordingProcess.stdout.pipe(soxProcess.stdin);

    // Handle errors
    recordingProcess.on('error', (error) => {
      console.error(`Recording error: ${error.message}`);
      isRecording = false;
    });

    soxProcess.on('error', (error) => {
      console.error(`Sox error: ${error.message}`);
      isRecording = false;
    });

    // When the recording is complete
    soxProcess.on('close', async (code) => {
      isRecording = false;

      // Check if the audio file is created successfully
      if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
        // If oneshot mode is enabled, exit after one recording
        const fileToConvert = outputFile; // get a copy of the outputFile variable before it is overwritten by the next recording
        if (!oneshot) {
          startRecording();
        }
        // Start the spinner
        const spinnerInterval = spinner();

        // Convert the MP3 audio to text using the Whisper API
        await convertAudioToText(fileToConvert);

        // Stop the spinner
        clearInterval(spinnerInterval);

        // If oneshot mode is enabled, exit after one recording
        if (oneshot) {
          handleExit();
        }
      } else {
        console.log('No audio recorded.');
        // Start the next recording if not in oneshot mode
        if (!oneshot) {
          startRecording();
        } else {
          handleExit();
        }
      }
    });
  }

  // Start the first recording
  startRecording();
}

// Run the main function
main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});