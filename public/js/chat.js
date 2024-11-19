// chat.js

// Initialize Socket.IO client
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

// ==================== Ping-Pong Mechanism ====================

// Send a ping to the server every 2 seconds to keep the connection alive
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
        console.log('Ping sent to server');
    }
}, 2000);

// Listen for 'pong' event from the server to confirm the connection is alive
socket.on('pong', () => {
    console.log('Pong received from server');
});

// ==================== DOM Elements ====================

const findStrangerBtn = document.querySelector('.find-stranger-btn');
const chatBox = document.getElementById('chat-box');
const chatMessages = document.querySelector('.chat-messages');
const messageInput = document.querySelector('.message-input');
const sendMessageBtn = document.querySelector('.send-message-btn');
const nextChatBtn = document.querySelector('.next-chat-btn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const idleMessage = document.getElementById('idleMessage');
const reportBtn = document.getElementById('reportBtn');

// Audio elements
const typingSound = document.getElementById('typingSound');
const sentMessageSound = document.getElementById('sentMessageSound');
const receivedMessageSound = document.getElementById('receivedMessageSound');
const searchingSound = document.getElementById('searchingSound');
const connectedSound = document.getElementById('connectedSound');

// ==================== State Variables ====================

let isTyping = false;
let typingTimeout;
let isNextChatConfirming = false;
let nextChatTimeout;
let isSearching = false;
let isConnected = true;
let isSoundOn = false;


// ==================== Report User ====================
reportBtn.addEventListener('click', () => {
    const confirmReport = confirm('Are you sure you want to report this user for inappropriate behavior?');
    if (confirmReport) {
        // Emit a 'reportUser' event to the server
        socket.emit('reportUser', { type: 'chat' });

        // Notify the user that the report has been submitted
        alert('Thank you for your report. Our team will review this conversation.');
    }
});

// ==================== Sound Control ====================

function toggleSound() {
    isSoundOn = !isSoundOn;
    soundToggleBtn.textContent = isSoundOn ? '🔊' : '🔈';
    soundToggleBtn.classList.toggle('muted', !isSoundOn);

    // Mute or unmute all audio elements
    [typingSound, sentMessageSound, receivedMessageSound, searchingSound, connectedSound].forEach(sound => {
        sound.muted = !isSoundOn;
    });
}

function playSound(sound) {
    if (isSoundOn && !sound.muted) {
        sound.currentTime = 0; // Reset to start
        sound.play().catch(error => {
            console.error('Error playing sound:', error);
        });
    }
}

// ==================== UI Interaction Functions ====================

function findStranger() {
    if (isSearching) {
        console.log('Already searching for a stranger.');
        return; // Prevent multiple searches
    }
    if (!isConnected) {
        displayNotification('Cannot search while disconnected from the server.');
        return;
    }

    isSearching = true;
    socket.emit('findStranger');
    findStrangerBtn.disabled = true;
    findStrangerBtn.innerText = 'Searching...';

    // Update the idle message
    showIdleMessage('Searching for a stranger...');
    playSound(searchingSound);
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    socket.emit('message', message);
    displayMessage('You', message);
    messageInput.value = '';
    sendMessageBtn.disabled = true;
    socket.emit('stopTyping');
    playSound(sentMessageSound);
}

function nextChat() {
    if (isSearching) {
        console.log('Cannot click Next while searching.');
        return;
    }
    if (!isNextChatConfirming) {
        isNextChatConfirming = true;
        nextChatBtn.textContent = 'Sure?';
        nextChatBtn.classList.add('confirm-next');

        // Reset confirmation state after 5 seconds
        nextChatTimeout = setTimeout(() => {
            isNextChatConfirming = false;
            nextChatBtn.textContent = 'Next';
            nextChatBtn.classList.remove('confirm-next');
        }, 5000);
    } else {
        // User confirmed, proceed to skip
        clearTimeout(nextChatTimeout);
        isSearching = true;
        nextChatBtn.disabled = true;
        sendMessageBtn.disabled = true;
        messageInput.disabled = true;
        socket.emit('nextChat');
        console.log('You skipped the chat.');
        displayNotification('You skipped the chat');
        prepareForNextChat();
        playSound(searchingSound);
    }
}

function prepareForNextChat() {
    clearChat();
    messageInput.value = '';
    sendMessageBtn.disabled = true;
    messageInput.disabled = true;
    isTyping = false;
    clearTimeout(typingTimeout);
    hideTypingIndicator();
    reportBtn.classList.add('hidden');

    // Reset next chat confirmation
    isNextChatConfirming = false;
    nextChatBtn.textContent = 'Next';
    nextChatBtn.classList.remove('confirm-next');
    clearTimeout(nextChatTimeout);

    nextChatBtn.disabled = true;
    isSearching = true;

    // Keep the "Find Stranger" button hidden
    findStrangerBtn.style.display = 'none';
    findStrangerBtn.disabled = true;
    findStrangerBtn.innerText = 'Searching...';

    console.log('Searching for a new stranger...');
    displayNotification('Searching for a new stranger...');
}

function showIdleMessage(text) {
    idleMessage.textContent = text;
    idleMessage.classList.remove('hide');
    idleMessage.classList.add('show');
}

function hideIdleMessage() {
    idleMessage.classList.remove('show');
    idleMessage.classList.add('hide');
}


// ==================== Display Functions ====================

function displayMessage(sender, message) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'You' ? 'you' : 'stranger');
    msgDiv.textContent = message;

    // Trigger CSS animation by setting opacity to 1
    msgDiv.style.opacity = '0';
    chatMessages.insertBefore(msgDiv, document.getElementById('typingIndicator'));
    setTimeout(() => {
        msgDiv.style.opacity = '1';
    }, 10); // Slight delay to allow transition

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function displayNotification(notification) {
    const notifDiv = document.createElement('div');
    notifDiv.classList.add('message', 'notification');
    notifDiv.textContent = notification;
    chatMessages.appendChild(notifDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChat() {
    chatMessages.innerHTML = '';

    // Re-add the typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typingIndicator';
    typingIndicator.classList.add('typing-indicator');
    typingIndicator.style.display = 'none';
    typingIndicator.textContent = 'Stranger is typing...';
    chatMessages.appendChild(typingIndicator);
}

function showTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'block';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    playSound(typingSound);
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }
}

// ==================== Typing Handling ====================

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stopTyping');
    }, 5000);
}

// ==================== Event Listeners ====================

// Listen for input events on the message input field
messageInput.addEventListener('input', () => {
    sendMessageBtn.disabled = !messageInput.value.trim();
    handleTyping();
});

// Listen for keypress events to send messages on Enter key
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendMessageBtn.disabled) {
        e.preventDefault();
        sendMessage();
    }
});

// Listen for clicks on the "Find Stranger" button
findStrangerBtn.addEventListener('click', findStranger);

// Listen for clicks on the "Send Message" button
sendMessageBtn.addEventListener('click', sendMessage);

// Listen for clicks on the "Next Chat" button
nextChatBtn.addEventListener('click', nextChat);

// Listen for clicks on the "Sound Toggle" button
soundToggleBtn.addEventListener('click', toggleSound);

// ==================== Socket.IO Event Handlers ====================

// Handle 'partnerFound' event from the server
socket.on('partnerFound', (data) => {
    isSearching = false;
    // Reset 'Next' button and confirmation state
    isNextChatConfirming = false;
    nextChatBtn.textContent = 'Next';
    nextChatBtn.classList.remove('confirm-next');
    clearTimeout(nextChatTimeout);
    nextChatBtn.disabled = false;

    findStrangerBtn.style.display = 'none';
    hideIdleMessage();
    reportBtn.classList.remove('hidden');
    chatBox.style.display = 'flex'; // Show chat box when partner is found
    clearChat(); // Clear previous messages
    displayNotification('Connected to a stranger 💬');
    messageInput.disabled = false;
    sendMessageBtn.disabled = true; // Disable send button until there's input
    nextChatBtn.disabled = false;
    messageInput.focus();
    console.log('Connected to a stranger.');
    adjustChatMessagesHeight(); // Adjust height when chat box is displayed
    playSound(connectedSound);
});

// Handle incoming messages from the server
socket.on('message', (data) => {
    const { from, text } = data;
    displayMessage('Stranger', text);
    playSound(receivedMessageSound);
});

// Handle 'partnerLeft' event from the server
socket.on('partnerLeft', (data) => {
    const { reason } = data;
    if (reason === 'skipped') {
        displayNotification('Stranger skipped the chat.️');
        console.log('Stranger skipped the chat.');
    } else if (reason === 'disconnected') {
        displayNotification('Stranger left the chat.');
        console.log('Stranger disconnected.');
    }
    showIdleMessage('Stranger left. Finding new person.');
    reportBtn.classList.add('hidden');
    prepareForNextChat();
    socket.emit('findStranger');
    playSound(searchingSound);
});

// Handle 'noPartner' event from the server
socket.on('noPartner', (data) => {
    const { message } = data;
    displayNotification(message);
    showIdleMessage('No partners found. Click "Find Stranger" to try again.');
    console.log('No partner:', message);
});

// Handle typing events from the server
socket.on('partnerTyping', () => {
    showTypingIndicator();
});

socket.on('partnerStopTyping', () => {
    hideTypingIndicator();
});

// Handle connection events
socket.on('connect', () => {
    console.log('Connected to server.');
    isConnected = true;
    findStrangerBtn.disabled = false;
    findStrangerBtn.innerText = 'Find Stranger';
    if (chatBox.style.display === 'flex') {
        // If chat box was open, reset the chat
        clearChat();
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        nextChatBtn.disabled = true;
        displayNotification('Reconnected to server. Please find a new stranger.');
        showIdleMessage('Click "Find Stranger" to start searching.');
        chatBox.style.display = 'none';
        findStrangerBtn.style.display = 'block';
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server.');
    isConnected = false;
    isSearching = false;
    findStrangerBtn.disabled = true;
    findStrangerBtn.innerText = 'Disconnected';
    nextChatBtn.disabled = true;
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;
    reportBtn.classList.add('hidden');
    displayNotification('Disconnected from server. Please check your connection.');
});

// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    displayNotification('Connection error. Retrying...');
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    displayNotification('An error occurred. Please try again.');
});

// ==================== Initialization ====================

// Disable message input and buttons initially
messageInput.disabled = true;
sendMessageBtn.disabled = true;
nextChatBtn.disabled = true;
findStrangerBtn.disabled = false;
findStrangerBtn.innerText = 'Find Stranger';
chatBox.style.display = 'none';

// Initialize sound toggle button
soundToggleBtn.textContent = '🔈';
soundToggleBtn.classList.add('muted');

// Ensure the typing indicator exists in the DOM
if (!document.getElementById('typingIndicator')) {
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typingIndicator';
    typingIndicator.classList.add('typing-indicator');
    typingIndicator.style.display = 'none';
    typingIndicator.textContent = 'Stranger is typing...';
    chatMessages.appendChild(typingIndicator);
}

// Handle 'reportLimitExceeded' event from the server
socket.on('reportLimitExceeded', (data) => {
    const { message } = data;
    alert(message); // Display an alert to the user
    console.log('Report limit exceeded:', message);
});

// Handle 'reportError' event from the server
socket.on('reportError', (data) => {
    const { message } = data;
    alert(message); // Inform the user of the error
    console.log('Report error:', message);
});


// ==================== Utility Functions ====================

function adjustChatMessagesHeight() {
    const chatInputArea = document.querySelector('.chat-input-area');
    const chatHeader = document.querySelector('.chat-header');
    const findStrangerBtnHeight = findStrangerBtn.offsetHeight;
    const windowHeight = window.innerHeight;
    const chatMessages = document.querySelector('.chat-messages');

    let chatMessagesHeight;

    if (chatBox.style.display === 'flex') {
        // Chat box is visible
        chatMessagesHeight = windowHeight - chatHeader.offsetHeight - chatInputArea.offsetHeight - 20; // 20px for padding/margin
    } else {
        // Find Stranger button is visible
        chatMessagesHeight = windowHeight - chatHeader.offsetHeight - findStrangerBtnHeight - 40; // 40px for padding/margin
    }

    chatMessages.style.height = `${chatMessagesHeight}px`;
}

function setupResponsiveChat() {
    window.addEventListener('resize', adjustChatMessagesHeight);
    window.addEventListener('orientationchange', adjustChatMessagesHeight);
    adjustChatMessagesHeight();
}

// Theme Toggle Functionality
const themeToggleBtn = document.getElementById('themeToggleBtn');
themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    // Update the icon based on the current mode
    themeToggleBtn.textContent = document.body.classList.contains('dark-mode') ? '⚪️️' : '⚫️️️';
    
    // Save the theme preference in localStorage
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});

// Load saved theme preference on page load
window.addEventListener('DOMContentLoaded', () => {
    showIdleMessage('Click "Find Stranger" to start searching.');
    reportBtn.classList.add('hidden');
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '⚪️';
    } else {
        themeToggleBtn.textContent = '⚫️️';
    }
});

function initializeChat() {
    setupResponsiveChat();
}

// Initialize the chat application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeChat);
