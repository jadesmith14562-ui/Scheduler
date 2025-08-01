 // Fixed JavaScript for the Meeting Scheduler Frontend
class MeetingScheduler {
    constructor() {
        this.participants = [];
        this.selectedDuration = '';
        this.isSubmitting = false;
        this.apiBaseUrl = this.detectApiUrl();
        this.initializeElements();
        this.setupEventListeners();
        this.setupCustomDropdowns();
        this.setMinDate();
        this.setDefaultTime();
        this.startStatusUpdates();
        
        console.log(`🌐 API Base URL: ${this.apiBaseUrl}`);
    }

    // Detect the correct API URL based on current location
    detectApiUrl() {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        // If we're on localhost or running from file, assume server is on localhost:5000
        if (protocol === 'file:' || hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:5000';
        }
        
        // Otherwise use the same origin
        return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }

    initializeElements() {
        // Form elements
        this.meetingForm = document.getElementById('meetingForm');
        this.meetingTitle = document.getElementById('meetingTitle');
        this.meetingDate = document.getElementById('meetingDate');
        this.meetingTimeHours = document.getElementById('meetingTimeHours');
        this.meetingTimeMinutes = document.getElementById('meetingTimeMinutes');
        this.meetingTimeHidden = document.getElementById('meetingTime');
        this.durationHidden = document.getElementById('duration');
        this.schedulerEmail = document.getElementById('schedulerEmail');
        this.participantEmail = document.getElementById('participantEmail');
        this.addParticipantBtn = document.getElementById('addParticipant');
        this.participantsList = document.getElementById('participantsList');
        this.description = document.getElementById('description');
        this.scheduleBtn = document.getElementById('scheduleBtn');

        // Custom dropdowns
        this.durationDropdown = document.getElementById('durationDropdown');
        this.durationDropdownContent = document.getElementById('durationDropdownContent');

        // Preview elements
        this.previewTitle = document.getElementById('previewTitle');
        this.previewDate = document.getElementById('previewDate');
        this.previewTime = document.getElementById('previewTime');
        this.previewParticipants = document.getElementById('previewParticipants');

        // Popup elements
        this.successPopup = document.getElementById('successPopup');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
    }

    setupEventListeners() {
        // Form submission
        this.meetingForm.addEventListener('submit', (e) => this.handleSubmit(e));

        // Input changes for preview updates
        this.meetingTitle.addEventListener('input', () => this.updatePreview());
        this.meetingDate.addEventListener('change', () => this.updatePreview());
        this.meetingTimeHours.addEventListener('input', () => this.updateTimeFromInputs());
        this.meetingTimeMinutes.addEventListener('input', () => this.updateTimeFromInputs());

        // Time input validation
        this.meetingTimeHours.addEventListener('input', (e) => this.validateTimeInput(e, 'hours'));
        this.meetingTimeMinutes.addEventListener('input', (e) => this.validateTimeInput(e, 'minutes'));

        // Add focus/blur for better UX
        this.meetingTimeHours.addEventListener('focus', () => this.selectAllText(this.meetingTimeHours));
        this.meetingTimeMinutes.addEventListener('focus', () => this.selectAllText(this.meetingTimeMinutes));

        // Participant management
        this.addParticipantBtn.addEventListener('click', () => this.addParticipant());
        this.participantEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addParticipant();
            }
        });

        // Close popup on click outside
        this.successPopup.addEventListener('click', (e) => {
            if (e.target === this.successPopup) {
                this.hideSuccessPopup();
            }
        });

        // Auto-resize textarea
        this.description.addEventListener('input', () => this.autoResizeTextarea());

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            this.closeAllDropdowns(e);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSuccessPopup();
                this.hideToast();
            }
        });
    }

    selectAllText(input) {
        setTimeout(() => input.select(), 0);
    }

    validateTimeInput(e, type) {
        const value = e.target.value;
        
        // Only allow numbers
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        
        if (type === 'hours') {
            // Hours: 00-23
            if (value.length === 2) {
                const hours = parseInt(value);
                if (hours > 23) {
                    e.target.value = '23';
                }
            }
        } else if (type === 'minutes') {
            // Minutes: 00-59
            if (value.length === 2) {
                const minutes = parseInt(value);
                if (minutes > 59) {
                    e.target.value = '59';
                }
            }
        }
        
        // Auto-advance to next field
        if (type === 'hours' && e.target.value.length === 2) {
            this.meetingTimeMinutes.focus();
            this.meetingTimeMinutes.select();
        }
    }

    updateTimeFromInputs() {
        const hours = this.meetingTimeHours.value.padStart(2, '0');
        const minutes = this.meetingTimeMinutes.value.padStart(2, '0');
        
        if (hours && minutes && hours.length === 2 && minutes.length === 2) {
            const timeValue = `${hours}:${minutes}`;
            this.meetingTimeHidden.value = timeValue;
        } else {
            this.meetingTimeHidden.value = '';
        }
        
        this.updatePreview();
    }

    setDefaultTime() {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(Math.round(now.getMinutes() / 30) * 30); // Round to nearest 30 min
        
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        
        this.meetingTimeHours.value = hours;
        this.meetingTimeMinutes.value = minutes;
        this.meetingTimeHidden.value = `${hours}:${minutes}`;

        this.updatePreview();
    }

    setupCustomDropdowns() {
        // Setup duration dropdown only
        this.setupDropdown(this.durationDropdown, this.durationDropdownContent, (value, text) => {
            this.selectedDuration = value;
            this.durationHidden.value = value;
            this.updatePreview();
        });
    }

    setupDropdown(dropdown, content, onSelect) {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        const selectedText = trigger.querySelector('.selected-text');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = content.classList.contains('open');
            
            // Close all other dropdowns
            this.closeAllDropdowns();
            
            if (!isOpen) {
                content.classList.add('open');
                trigger.classList.add('active');
            }
        });

        const options = content.querySelectorAll('.dropdown-option');
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const value = option.getAttribute('data-value');
                const icon = option.querySelector('i').outerHTML;
                const text = option.querySelector('span').textContent;
                
                // Update selected text with icon
                selectedText.innerHTML = `${icon} ${text}`;
                trigger.classList.add('has-value');
                trigger.classList.remove('placeholder');
                
                // Update selected state
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // Close dropdown
                content.classList.remove('open');
                trigger.classList.remove('active');
                
                // Call callback
                onSelect(value, text);
            });
        });
    }

    closeAllDropdowns(except = null) {
        const dropdowns = document.querySelectorAll('.dropdown-content');
        const triggers = document.querySelectorAll('.dropdown-trigger');
        
        dropdowns.forEach(dropdown => {
            if (dropdown !== except) {
                dropdown.classList.remove('open');
            }
        });
        
        triggers.forEach(trigger => {
            if (except === null || !trigger.parentElement.contains(except)) {
                trigger.classList.remove('active');
            }
        });
    }

    setMinDate() {
        const today = new Date();
        const minDate = today.toISOString().split('T')[0];
        this.meetingDate.min = minDate;
    }

    autoResizeTextarea() {
        this.description.style.height = 'auto';
        this.description.style.height = Math.max(100, this.description.scrollHeight) + 'px';
    }

    addParticipant() {
        const email = this.participantEmail.value.trim().toLowerCase();
        
        if (!email) {
            this.showToast('Please enter an email address', 'error');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            this.participantEmail.focus();
            return;
        }

        // Check if email is the same as scheduler email
        const schedulerEmail = this.schedulerEmail.value.trim().toLowerCase();
        if (schedulerEmail && email === schedulerEmail) {
            this.showToast('Scheduler email is automatically included', 'warning');
            this.participantEmail.value = '';
            return;
        }

        if (this.participants.some(p => p.email === email)) {
            this.showToast('This participant is already added', 'warning');
            this.participantEmail.focus();
            this.participantEmail.select();
            return;
        }

        const participant = {
            id: Date.now().toString(),
            email: email
        };

        this.participants.push(participant);
        this.participantEmail.value = '';
        this.renderParticipants();
        this.updatePreview();
        this.showToast(`${email} added successfully`, 'success');
        
        // Focus back to input for easy multiple additions
        this.participantEmail.focus();
    }

    removeParticipant(id) {
        const participant = this.participants.find(p => p.id === id);
        this.participants = this.participants.filter(p => p.id !== id);
        this.renderParticipants();
        this.updatePreview();
        if (participant) {
            this.showToast(`${participant.email} removed`, 'success');
        }
    }

    renderParticipants() {
        if (this.participants.length === 0) {
            this.participantsList.classList.add('hidden');
            return;
        }

        this.participantsList.classList.remove('hidden');
        this.participantsList.innerHTML = this.participants.map(participant => `
            <div class="participant-badge">
                <i class="fas fa-user" style="font-size: 0.75rem; margin-right: 0.25rem;"></i>
                ${participant.email}
                <button type="button" class="remove-participant" onclick="meetingScheduler.removeParticipant('${participant.id}')" title="Remove participant">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    updatePreview() {
        // Update title
        const title = this.meetingTitle.value.trim() || 'Untitled Meeting';
        this.previewTitle.textContent = title;

        // Update date
        const date = this.meetingDate.value;
        if (date) {
            try {
                const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                this.previewDate.textContent = formattedDate;
            } catch (error) {
                this.previewDate.textContent = 'Invalid date';
            }
        } else {
            this.previewDate.textContent = 'No date selected';
        }

        // Update time
        const timeValue = this.meetingTimeHidden.value;
        let timeText = 'No time selected';
        
        if (timeValue) {
            try {
                // Format time nicely
                const [hours, minutes] = timeValue.split(':');
                const hour24 = parseInt(hours);
                const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                const ampm = hour24 >= 12 ? 'PM' : 'AM';
                timeText = `${hour12}:${minutes} ${ampm}`;
                
                if (this.selectedDuration) {
                    timeText += ` (${this.getDurationText(this.selectedDuration)})`;
                }
            } catch (error) {
                timeText = timeValue;
            }
        }
        
        this.previewTime.textContent = timeText;

        // Update participants (including scheduler)
        const count = this.participants.length + 1; // +1 for scheduler
        this.previewParticipants.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
    }

    getDurationText(duration) {
        const minutes = parseInt(duration);
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = minutes / 60;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) return;

        // Validate scheduler email first
        const schedulerEmail = this.schedulerEmail.value.trim().toLowerCase();
        if (!schedulerEmail) {
            this.showToast('Please enter your email address', 'error');
            this.schedulerEmail.focus();
            return;
        }

        if (!this.isValidEmail(schedulerEmail)) {
            this.showToast('Please enter a valid email address', 'error');
            this.schedulerEmail.focus();
            return;
        }

        const formData = {
            title: this.meetingTitle.value.trim(),
            date: this.meetingDate.value,
            time: this.meetingTimeHidden.value,
            duration: parseInt(this.selectedDuration),
            participants: this.participants,
            description: this.description.value.trim(),
            schedulerEmail: schedulerEmail
        };

        console.log('📤 Submitting meeting data:', {
            ...formData,
            participantEmails: formData.participants.map(p => p.email)
        });

        if (!this.validateForm(formData)) {
            return;
        }

        await this.scheduleCall(formData);
    }

    validateForm(data) {
        if (!data.title) {
            this.showToast('Please enter a meeting title', 'error');
            this.meetingTitle.focus();
            return false;
        }

        if (data.title.length > 100) {
            this.showToast('Meeting title is too long (max 100 characters)', 'error');
            this.meetingTitle.focus();
            return false;
        }

        if (!data.date) {
            this.showToast('Please select a date', 'error');
            this.meetingDate.focus();
            return false;
        }

        if (!data.time) {
            this.showToast('Please enter a valid time', 'error');
            this.meetingTimeHours.focus();
            return false;
        }

        if (!data.duration) {
            this.showToast('Please select a duration', 'error');
            return false;
        }

        if (!data.schedulerEmail) {
            this.showToast('Please enter your email address', 'error');
            this.schedulerEmail.focus();
            return false;
        }

        if (!this.isValidEmail(data.schedulerEmail)) {
            this.showToast('Please enter a valid email address', 'error');
            this.schedulerEmail.focus();
            return false;
        }

        // Validate participant emails
        for (const participant of data.participants) {
            if (!this.isValidEmail(participant.email)) {
                this.showToast(`Invalid participant email: ${participant.email}`, 'error');
                return false;
            }
        }

        // Check if the selected date/time is in the future
        try {
            const selectedDateTime = new Date(`${data.date}T${data.time}:00`);
            const now = new Date();
            
            if (isNaN(selectedDateTime.getTime())) {
                this.showToast('Invalid date or time format', 'error');
                return false;
            }
            
            if (selectedDateTime <= now) {
                this.showToast('Please select a future date and time', 'error');
                return false;
            }

            // Check if the meeting is at least 2 minutes in the future
            const twoMinutesFromNow = new Date(now.getTime() + 2 * 60000);
            if (selectedDateTime < twoMinutesFromNow) {
                this.showToast('Please schedule the meeting at least 2 minutes in advance', 'error');
                return false;
            }
        } catch (error) {
            this.showToast('Invalid date or time', 'error');
            return false;
        }

        return true;
    }

    async scheduleCall(data) {
        this.setLoading(true);

        try {
            console.log('📡 Sending request to:', `${this.apiBaseUrl}/api/schedule-meeting`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(`${this.apiBaseUrl}/api/schedule-meeting`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data),
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);
            console.log('📡 Response status:', response.status);
            console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                let errorText;
                try {
                    const errorData = await response.json();
                    errorText = errorData.message || `Server error: ${response.status}`;
                } catch {
                    errorText = await response.text() || `HTTP ${response.status}`;
                }
                console.error('📡 Response error:', errorText);
                throw new Error(errorText);
            }

            const result = await response.json();
            console.log('📡 Response data:', result);

            if (result.success) {
                // Show success popup
                this.showSuccessPopup();

                // Show detailed success toast
                const formattedDate = new Date(data.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
                
                const [hours, minutes] = data.time.split(':');
                const hour24 = parseInt(hours);
                const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                const ampm = hour24 >= 12 ? 'PM' : 'AM';
                const formattedTime = `${hour12}:${minutes} ${ampm}`;
                
                this.showToast(
                    `✅ "${data.title}" scheduled for ${formattedDate} at ${formattedTime}. Email notifications sent!`,
                    'success'
                );

                // Update status in console
                console.log('✅ Meeting scheduled successfully:', {
                    id: result.meeting?.id,
                    title: data.title,
                    dateTime: `${formattedDate} ${formattedTime}`,
                    participants: data.participants.length + 1,
                    notifications: result.meeting?.totalNotifications
                });

                // Reset form after successful submission
                setTimeout(() => {
                    this.resetForm();
                }, 3000);
            } else {
                console.error('❌ Server returned error:', result.message);
                this.showToast(result.message || 'Failed to schedule meeting', 'error');
            }
        } catch (error) {
            console.error('❌ Error scheduling meeting:', error);
            
            if (error.name === 'AbortError') {
                this.showToast('Request timed out. Please check your connection and try again.', 'error');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                this.showToast('Unable to connect to server. Please make sure the server is running on http://localhost:5000', 'error');
                console.error('💡 Server connection tips:');
                console.error('   1. Make sure you started the server: node server.js');
                console.error('   2. Check that the server is running on port 5000');
                console.error('   3. Try accessing http://localhost:5000 directly');
            } else if (error.message.includes('CORS')) {
                this.showToast('CORS error - server configuration issue', 'error');
            } else {
                this.showToast(`Error: ${error.message}`, 'error');
            }
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        this.isSubmitting = loading;
        const button = this.scheduleBtn;
        const icon = button.querySelector('.send-icon') || button.querySelector('.loading-spinner');
        
        if (loading) {
            button.disabled = true;
            button.classList.add('loading');
            if (icon) {
                icon.className = 'loading-spinner';
            }
            // Update button text
            const textContent = button.textContent || button.innerText;
            if (!textContent.includes('Scheduling')) {
                button.innerHTML = button.innerHTML.replace(/Schedule Meeting|Scheduling\.\.\./g, 'Scheduling...');
            }
        } else {
            button.disabled = false;
            button.classList.remove('loading');
            if (icon) {
                icon.className = 'fas fa-paper-plane send-icon';
            }
            // Restore button text
            button.innerHTML = button.innerHTML.replace(/Scheduling\.\.\./g, 'Schedule Meeting');
        }
    }

    showSuccessPopup() {
        this.successPopup.classList.remove('hidden');
        
        // Auto hide after 4 seconds
        setTimeout(() => {
            this.hideSuccessPopup();
        }, 4000);
    }

    hideSuccessPopup() {
        this.successPopup.classList.add('hidden');
    }

    showToast(message, type = 'success') {
        // Clear any existing timeout
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        this.toastMessage.textContent = message;
        this.toast.className = `toast ${type}`;
        this.toast.classList.remove('hidden');

        // Auto hide based on message length and type
        const baseTime = type === 'error' ? 6000 : 4000;
        const extraTime = Math.max(0, (message.length - 50) * 50); // Extra time for longer messages
        const totalTime = baseTime + extraTime;

        this.toastTimeout = setTimeout(() => {
            this.hideToast();
        }, totalTime);
    }

    hideToast() {
        this.toast.classList.add('hidden');
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
    }

    resetForm() {
        console.log('🔄 Resetting form...');
        
        this.meetingForm.reset();
        this.participants = [];
        this.selectedDuration = '';
        this.renderParticipants();
        this.updatePreview();
        this.description.style.height = '100px';
        this.setDefaultTime();
        
        // Reset dropdown
        const trigger = this.durationDropdown.querySelector('.dropdown-trigger');
        const selectedText = trigger.querySelector('.selected-text');
        selectedText.textContent = 'Select duration';
        trigger.classList.remove('has-value');
        trigger.classList.add('placeholder');
        
        // Reset selected options
        const options = this.durationDropdownContent.querySelectorAll('.dropdown-option');
        options.forEach(opt => opt.classList.remove('selected'));

        // Clear hidden fields
        this.durationHidden.value = '';
        this.meetingTimeHidden.value = '';

        console.log('✅ Form reset complete');
    }

    // Status monitoring with better error handling
    startStatusUpdates() {
        // Check server health every 5 minutes
        setInterval(() => {
            this.checkServerHealth();
        }, 5 * 60 * 1000);

        // Initial health check after 2 seconds
        setTimeout(() => {
            this.checkServerHealth();
        }, 2000);
    }

    async checkServerHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });
            
            if (response.ok) {
                const health = await response.json();
                console.log('🏥 Server health:', {
                    status: 'healthy',
                    upcomingMeetings: health.upcomingMeetings,
                    scheduledJobs: health.scheduledJobs,
                    serverTime: health.timestamp
                });
            } else {
                console.warn('⚠️ Server health check returned non-OK status:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ Server health check failed:', error.message);
            if (error.message.includes('Failed to fetch')) {
                console.warn('💡 This usually means the server is not running. Start it with: node server.js');
            }
        }
    }

    // Utility method for testing
    async testEmailService(email = null) {
        const testEmail = email || this.schedulerEmail.value.trim();
        
        if (!testEmail) {
            this.showToast('Please enter an email address to test', 'error');
            return;
        }

    if (!this.isValidEmail(testEmail)) {
            this.showToast('Please enter a valid email address', 'error');
            return;
        }

        try {
            console.log('🧪 Testing email service...');
            const response = await fetch('/api/test-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: testEmail })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast(`Test email sent successfully to ${testEmail}`, 'success');
                console.log('✅ Test email sent:', result.messageId);
            } else {
                this.showToast(`Failed to send test email: ${result.message}`, 'error');
                console.error('❌ Test email failed:', result.error);
            }
        } catch (error) {
            this.showToast('Error testing email service', 'error');
            console.error('❌ Email test error:', error);
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.meetingScheduler = new MeetingScheduler();
        console.log('🚀 Meeting Scheduler initialized successfully');
        console.log('💡 Tip: Use meetingScheduler.testEmailService() to test email functionality');
    } catch (error) {
        console.error('❌ Failed to initialize Meeting Scheduler:', error);
    }
});

// Debug utilities (available in console)
window.debugMeetingScheduler = {
    testEmail: (email) => window.meetingScheduler?.testEmailService(email),
    checkHealth: () => window.meetingScheduler?.checkServerHealth(),
    resetForm: () => window.meetingScheduler?.resetForm(),
    getStatus: () => ({
        participants: window.meetingScheduler?.participants || [],
        selectedDuration: window.meetingScheduler?.selectedDuration || '',
        isSubmitting: window.meetingScheduler?.isSubmitting || false
    })
};