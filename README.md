# Whisper Stream Speech-to-Text Transcriber (JavaScript)

This repository is a NodeJS port of the original [Whisper Stream Speech-to-Text Transcriber](https://github.com/yohasebe/whisper-stream) by Yoichiro Hasebe.

![whisper-stream](https://github.com/yohasebe/whisper-stream/assets/18207/7b419ba0-a621-40ac-82c6-9c498e038e0d)



This is a **Node.js script** that utilizes the [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) to **transcribe continuous voice input into text**. It uses SoX for audio recording and includes a built-in feature that detects silence between speech segments.

The script is designed to convert voice audio into text each time the system identifies a **specified duration of silence**. This enables the Whisper API to function as if it were capable of real-time speech-to-text conversion. It is also possible to specify the audio file to be converted by Whisper.

After transcription, the text is automatically copied to your system's **clipboard** for immediate use. It can also be saved in a specified directory as a **text file**.

## Installation

### Prerequisites

Make sure you have Node.js and npm installed on your system. You also need the following dependencies:

- `sox` - For audio recording and processing
- For Linux users: `xclip` and optionally `alsa-utils`

#### Installing SoX

On macOS:
```bash
brew install sox
```

On Debian-based Linux distributions:
```bash
sudo apt-get install sox xclip alsa-utils
```

### Installing the Script

1. Clone the repository or download the script files
2. Navigate to the script directory
3. Install the required Node.js dependencies:

```bash
npm install
```

This will install the following dependencies:
- axios - For making HTTP requests to the OpenAI API
- clipboardy - For clipboard operations
- commander - For command-line argument parsing
- form-data - For handling multipart/form-data requests

## Usage

You can start the script with the following command:

```bash
node whisper-stream.js [options]
```

Or if you've set up the script to be executable:

```bash
./whisper-stream.js [options]
```

The available options are:

- `-v, --volume <value>`: Set the minimum volume threshold (default: 1%)
- `-s, --silence <value>`: Set the minimum silence length (default: 1.5)
- `-o, --oneshot`: Enable one-shot mode
- `-d, --duration <value>`: Set the recording duration in seconds (default: 0, continuous)
- `-t, --token <value>`: Set the OpenAI API token
- `-p, --path <value>`: Set the output directory path to create the transcription file
- `-g, --granularities <value>`: Set the timestamp granularities (segment or word)
- `-r, --prompt <value>`: Set the prompt for the API call
- `-l, --language <value>`: Set the input language in ISO-639-1 format
- `-f, --file <value>`: Set the audio file to be transcribed
- `-tr, --translate`: Translate the transcribed text to English
- `-p2, --pipe-to <cmd>`: Pipe the transcribed text to the specified command (e.g., 'wc -w')
- `-q,  --quiet`: Suppress the banner and settings
- `-V, --version`: Show the version number
- `-h, --help`: Display the help message

## Examples

Here are some usage examples with a brief comment on each of them:

`> node whisper-stream.js`

This will start the script with the default settings, recording audio continuously and transcribing it into text using the default volume threshold and silence length. If the OpenAI API token is not provided as an argument, the script will automatically use the value of the `OPENAI_API_KEY` environment variable if it is set.

`> node whisper-stream.js -l ja`

This will start the script with the input language specified as Japanese; see the [Wikipedia](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) page for ISO-639-1 language codes.

`> node whisper-stream.js -tr`

It transcribes the spoken audio in whatever language and presents the text translated into English. Currently, the target language for translation is limited to English.

`> node whisper-stream.js -v 2% -s 2 -o -d 60 -t your_openai_api_token`

This example sets the minimum volume threshold to 2%, the minimum silence length to 2 seconds, enables one-shot mode, sets the recording duration to 60 seconds, and specifies the OpenAI API token.

`> node whisper-stream.js -f ~/Desktop/interview.mp3 -p ~/Desktop/transcripts -l en`

This will transcribe the audio file located at `~/Desktop/interview.mp3`. The input language is specified as English. The output directory is set to `~Desktop/transcripts` to create a transcription text file.

`> node whisper-stream.js -p2 'wc -w'`

This will start the script with the default settings for recording audio and transcribing it. After transcription, the transcribed text will be piped to the `wc -w` command, which counts the number of words in the text. The result, indicating the total word count, will be printed below the original transcribed output.

`> node whisper-stream.js -g segment -p ~/Desktop`

The `-g` option allows you to specify the mode for timestamp granularities. The available modes are segment or word, and specifying either will display detailed transcript data in JSON format. When used in conjunction with the `-p` option to specify a directory, the results will be saved as a JSON file. For more information, see the [`timestamp_granularities[]`](https://platform.openai.com/docs/api-reference/audio/createTranscription#audio-createtranscription-timestamp_granularities) section in OpenAI Whisper API reference.

## Restrictions

Restrictions such as the languages that can be converted by this program, the types of audio files that can be input, and the size of data that can be converted at one time depend on what the Whisper API specifies. Please refer to [Whisper API FAQ](https://help.openai.com/en/articles/7031512-whisper-api-faq).

## License

This software is distributed under the [MIT License](http://www.opensource.org/licenses/mit-license.php).
