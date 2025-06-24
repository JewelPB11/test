class FreeCalendarAgent {
    constructor() {
        this.isAuthenticated = false;
        this.gapi = null;
        this.recognition = null;
        this.isListening = false;
        this.init();
    }

    async init() {
        await this.loadGoogleAPI();
        this.initializeVoiceRecognition();
        this.setupEventListeners();
    }

    async loadGoogleAPI() {
        return new Promise((resolve) => {
            gapi.load('client:auth2', () => {
                gapi.client.init({
                    apiKey: 'AIzaSyApbSe-0JbzMvqljUdAxIwS05Nkd-I9giM',
                    clientId: '311892052369-9058tc8h80cmlv98bb62mbg094e6vgii.apps.googleusercontent.com',
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
                    scope: 'https://www.googleapis.com/auth/calendar'
                }).then(() => resolve());
            });
        });
    }

    initializeVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                const command = event.results[0][0].transcript;
                this.updateStatus(`🎙️ You said: "${command}"`);
                this.processVoiceCommand(command);
            };

            this.recognition.onerror = (event) => {
                this.updateStatus('❌ Voice recognition error. Try again.');
                this.isListening = false;
                this.updateVoiceButton();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.updateVoiceButton();
            };
        }
    }

    setupEventListeners() {
        document.getElementById('authBtn').addEventListener('click', () => this.authenticate());
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceRecognition());
    }

    async authenticate() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            await authInstance.signIn();
            this.isAuthenticated = true;
            this.updateStatus('✅ Authenticated with Google Calendar');
            document.getElementById('authBtn').textContent = 'Signed In';
            document.getElementById('authBtn').disabled = true;
            document.getElementById('voiceBtn').disabled = false;
        } catch (error) {
            this.updateStatus('❌ Authentication failed');
            console.error('Auth error:', error);
        }
    }

    toggleVoiceRecognition() {
        if (!this.isListening) {
            this.startListening();
        } else {
            this.stopListening();
        }
    }

    startListening() {
        if (this.recognition) {
            this.isListening = true;
            this.updateVoiceButton();
            this.updateStatus('🎤 Listening... Speak your command');
            this.recognition.start();
        }
    }

    stopListening() {
        if (this.recognition) {
            this.recognition.stop();
            this.isListening = false;
            this.updateVoiceButton();
        }
    }

    updateVoiceButton() {
        const btn = document.getElementById('voiceBtn');
        btn.textContent = this.isListening ? '🛑 Stop Listening' : '🎤 Start Voice Command';
    }

    async processVoiceCommand(command) {
        const intent = this.parseIntent(command.toLowerCase());

        switch (intent.action) {
            case 'check_calendar':
                await this.checkCalendar(intent.timeframe);
                break;
            case 'add_event':
                await this.addEvent(intent.details);
                break;
            default:
                this.speak("I didn't understand that. Try saying 'check my calendar today' or 'add a meeting tomorrow at 2 PM'.");
        }
    }

    parseIntent(command) {
        if (command.includes('check') || command.includes('show') || command.includes('what')) {
            return {
                action: 'check_calendar',
                timeframe: this.extractTimeframe(command)
            };
        }

        if (command.includes('add') || command.includes('schedule') || command.includes('create')) {
            return {
                action: 'add_event',
                details: this.extractEventDetails(command)
            };
        }

        return { action: 'unknown' };
    }

    extractTimeframe(command) {
        if (command.includes('today')) return 'today';
        if (command.includes('tomorrow')) return 'tomorrow';
        if (command.includes('week')) return 'week';
        return 'today';
    }

    extractEventDetails(command) {
        const title = command.replace(/(add|schedule|create)/, '').trim();
        return {
            title: title || 'New Event',
            time: 'tomorrow 2:00 PM',
            duration: 60
        };
    }

    async checkCalendar(timeframe) {
        try {
            const timeMin = new Date();
            const timeMax = new Date();

            if (timeframe === 'tomorrow') {
                timeMin.setDate(timeMin.getDate() + 1);
                timeMax.setDate(timeMax.getDate() + 1);
            } else if (timeframe === 'week') {
                timeMax.setDate(timeMax.getDate() + 7);
            }

            timeMin.setHours(0, 0, 0, 0);
            timeMax.setHours(23, 59, 59, 999);

            const response = await gapi.client.calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                showDeleted: false,
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.result.items;
            this.displayEvents(events, timeframe);

            if (events.length === 0) {
                this.speak(`You have no events ${timeframe}.`);
            } else {
                this.speak(`You have ${events.length} event${events.length > 1 ? 's' : ''} ${timeframe}.`);
            }
        } catch (error) {
            this.updateStatus('❌ Error checking calendar');
            console.error('Calendar error:', error);
        }
    }

    displayEvents(events, timeframe) {
        const container = document.getElementById('calendar-events');
        container.innerHTML = `<h3>📅 Events for ${timeframe}</h3>`;

        if (events.length === 0) {
            container.innerHTML += '<p>No events found.</p>';
            return;
        }

        events.forEach(event => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'event-item';

            const start = new Date(event.start.dateTime || event.start.date);
            const startTime = event.start.dateTime ? start.toLocaleTimeString() : 'All day';

            eventDiv.innerHTML = `
                <strong>${event.summary || 'Untitled Event'}</strong><br>
                <small>⏰ ${startTime}</small>
            `;

            container.appendChild(eventDiv);
        });
    }

    async addEvent(details) {
        try {
            const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

            const event = {
                summary: details.title,
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            };

            await gapi.client.calendar.events.insert({
                calendarId: 'primary',
                resource: event
            });

            this.updateStatus(`✅ Event created: ${details.title}`);
            this.speak('Event added successfully!');
        } catch (error) {
            this.updateStatus('❌ Error creating event');
            console.error('Event creation error:', error);
        }
    }

    speak(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.8;
            utterance.pitch = 1;
            speechSynthesis.speak(utterance);
        }
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FreeCalendarAgent();
});
