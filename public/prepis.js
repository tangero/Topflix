/**
 * Topflix Speech-to-Text Real-time Transcription
 * Using ElevenLabs ScribeRealtime v2 API
 */

class TranscriptionService {
    constructor() {
        this.ws = null;
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.isRecording = false;
        this.token = null;

        // UI Elements
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.clearButton = document.getElementById('clearButton');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.transcriptionText = document.getElementById('transcriptionText');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.errorText = document.getElementById('errorText');

        // Bind event handlers
        this.startButton.addEventListener('click', () => this.start());
        this.stopButton.addEventListener('click', () => this.stop());
        this.clearButton.addEventListener('click', () => this.clearTranscription());

        // Initialize
        this.updateStatus('ready', 'Připraveno');
    }

    /**
     * Update status indicator
     */
    updateStatus(state, message) {
        this.statusIndicator.className = `status-indicator ${state}`;
        this.statusText.textContent = message;
    }

    /**
     * Show error message
     */
    showError(message) {
        this.errorText.textContent = message;
        this.errorDisplay.classList.remove('hidden');
        this.updateStatus('error', 'Chyba');
    }

    /**
     * Hide error message
     */
    hideError() {
        this.errorDisplay.classList.add('hidden');
    }

    /**
     * Clear transcription text
     */
    clearTranscription() {
        this.transcriptionText.innerHTML = '<p class="placeholder">Transkripce se zobrazí zde...</p>';
    }

    /**
     * Get single-use token from server
     */
    async getToken() {
        try {
            // Try production endpoint first
            let response = await fetch('/api/scribe-token');

            // If running locally and production fails, try local endpoint
            if (!response.ok && window.location.hostname === 'localhost') {
                response = await fetch('http://localhost:8787/api/scribe-token');
            }

            if (!response.ok) {
                throw new Error(`Failed to get token: ${response.status}`);
            }

            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error('Error getting token:', error);
            throw new Error('Nepodařilo se získat autentizační token. Zkontrolujte připojení k internetu.');
        }
    }

    /**
     * Initialize audio capture from microphone
     */
    async initAudio() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create script processor for audio data
            // Using 4096 buffer size for better performance
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processor.onaudioprocess = (e) => {
                if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                const inputData = e.inputBuffer.getChannelData(0);

                // Convert Float32Array to Int16Array (PCM 16-bit)
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    // Clamp values to [-1, 1] and convert to 16-bit
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Convert to base64
                const base64Audio = this.arrayBufferToBase64(pcmData.buffer);

                // Send audio chunk to WebSocket
                this.sendAudioChunk(base64Audio);
            };

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

        } catch (error) {
            console.error('Error initializing audio:', error);
            throw new Error('Nepodařilo se získat přístup k mikrofonu. Zkontrolujte oprávnění.');
        }
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Connect to ElevenLabs WebSocket
     */
    async connectWebSocket() {
        try {
            this.updateStatus('connecting', 'Připojování...');

            // Get authentication token
            this.token = await this.getToken();

            // Connect to WebSocket
            const wsUrl = `wss://api.elevenlabs.io/v1/scribe?token=${this.token}&model_id=scribe_realtime_v2&language=cs`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.updateStatus('recording', 'Nahrávání...');
                this.isRecording = true;
            };

            this.ws.onmessage = (event) => {
                this.handleTranscription(event.data);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showError('Chyba připojení k službě přepisu.');
                this.stop();
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                if (this.isRecording) {
                    this.showError('Připojení bylo ukončeno.');
                    this.stop();
                }
            };

        } catch (error) {
            console.error('Error connecting WebSocket:', error);
            throw error;
        }
    }

    /**
     * Send audio chunk to WebSocket
     */
    sendAudioChunk(base64Audio) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                audio: base64Audio
            };
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Handle transcription response
     */
    handleTranscription(data) {
        try {
            const response = JSON.parse(data);

            // Remove placeholder if present
            const placeholder = this.transcriptionText.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
            }

            if (response.type === 'partial') {
                // Update or create partial transcription
                let partialElement = this.transcriptionText.querySelector('.partial');
                if (!partialElement) {
                    partialElement = document.createElement('span');
                    partialElement.className = 'partial';
                    this.transcriptionText.appendChild(partialElement);
                }
                partialElement.textContent = response.text + ' ';

            } else if (response.type === 'final' || response.type === 'committed') {
                // Remove partial transcription
                const partialElement = this.transcriptionText.querySelector('.partial');
                if (partialElement) {
                    partialElement.remove();
                }

                // Add committed transcription
                const committedElement = document.createElement('span');
                committedElement.className = 'committed';
                committedElement.textContent = response.text + ' ';
                this.transcriptionText.appendChild(committedElement);
            }

            // Auto-scroll to bottom
            this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;

        } catch (error) {
            console.error('Error handling transcription:', error);
        }
    }

    /**
     * Start transcription
     */
    async start() {
        try {
            this.hideError();
            this.startButton.disabled = true;

            // Initialize audio capture
            await this.initAudio();

            // Connect to WebSocket
            await this.connectWebSocket();

            // Update UI
            this.stopButton.disabled = false;
            this.clearTranscription();

        } catch (error) {
            console.error('Error starting transcription:', error);
            this.showError(error.message || 'Nepodařilo se spustit přepis.');
            this.startButton.disabled = false;
        }
    }

    /**
     * Stop transcription
     */
    stop() {
        this.isRecording = false;

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Stop audio processing
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Update UI
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.updateStatus('ready', 'Připraveno');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TranscriptionService();
});
