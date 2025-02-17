// public/js/video.js

const socket = io();
let peerConnection = null;
let localStream = null;
let connectionAttempts = 0;
let connectionEstablished = false;
let searchDelay = 1000; // 1-second delay before searching again
let iceCandidatesQueue = []; // Moved to global scope
let reconnectionDelay = 1000; // Start with 1 second
let unreadMessages = 0; // Counter for unread messages
let callStartTime = null;

// DOM Elements
const findStrangerBtn = document.getElementById('nextBtn');
const confirmSkipBtn = document.getElementById('confirmSkipBtn'); // Confirmation button
const chatToggleBtn = document.getElementById('chatToggleBtn'); // Chat toggle button for mobile
const userVideo = document.getElementById('userVideo');
const strangerVideo = document.getElementById('strangerVideo');
const spinnerOverlay = document.createElement('div');
const reportBtn = document.getElementById('reportBtn');
reportBtn.classList.add('hidden');

// Chatbox Elements
const chatBox = document.getElementById('chatBox'); // Desktop chatbox
const chatModal = document.getElementById('chatModal'); // Mobile chat modal
const chatMessages = chatBox.querySelector('.chat-messages'); // Messages area in desktop chatbox
const chatInput = chatBox.querySelector('.chat-input'); // Input in desktop chatbox
const sendChatBtn = chatBox.querySelector('.send-chat-btn'); // Send button in desktop chatbox
const toggleChatSizeBtn = document.getElementById('toggleChatSizeBtn'); // Collapse/Expand button for desktop

// Chat Elements in Modal (Mobile)
const modalChatMessages = chatModal.querySelector('.chat-messages');
const modalChatInput = chatModal.querySelector('.chat-input');
const modalSendChatBtn = chatModal.querySelector('.send-chat-btn');
const closeChatModalBtn = document.getElementById('closeChatModalBtn'); // Close button for mobile modal

// Detect if the device is mobile
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

// Spinner overlay setup
spinnerOverlay.className = 'spinner-overlay';
spinnerOverlay.innerHTML = '<div class="spinner"></div>';
document.body.appendChild(spinnerOverlay);

// Initialize local video and audio stream with error handling
async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        userVideo.srcObject = localStream;
        console.log("Local stream started.");
        return localStream;
    } catch (error) {
        console.error("Error accessing local media:", error);
        showError("Could not access camera or microphone. Please check your device settings.");
        return null;
    }
}

// Initialize the peer connection and handle ICE candidates, track events, and connection state
async function initializePeerConnection() {
    if (!localStream) {
        localStream = await startLocalVideo();
        if (!localStream) return;
    }

    const configuration = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            // Additional STUN/TURN servers can be added here
        ],
    };
    peerConnection = new RTCPeerConnection(configuration);

    // Reset the ICE candidates queue
    iceCandidatesQueue = [];

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            if (
                peerConnection &&
                peerConnection.remoteDescription &&
                peerConnection.remoteDescription.type
            ) {
                console.log("Sending ICE candidate to partner.");
                socket.emit('videoSignal', { signalData: { candidate: event.candidate.toJSON() } });
            } else {
                console.log("Queueing ICE candidate.");
                iceCandidatesQueue.push(event.candidate.toJSON());
            }
        }
    };

    peerConnection.ontrack = (event) => {
        console.log("Received remote stream.");
        if (!strangerVideo.srcObject) {
            strangerVideo.srcObject = event.streams[0];
            hideSpinner();
        }
    };

    let disconnectTimer;

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection state changed:", peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log("Connection established with remote peer.");
            clearTimeout(disconnectTimer);
        } else if (peerConnection.connectionState === 'disconnected') {
            disconnectTimer = setTimeout(() => {
                console.log("Connection lost. Resetting call.");
                resetCall();
                startSearchForStranger();
            }, 5000); // Wait for 5 seconds before resetting
        } else if (peerConnection.connectionState === 'failed') {
            console.log("Connection failed. Resetting call.");
            resetCall();
            startSearchForStranger();
        }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE Connection State Changed:", peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
            console.log("ICE connection failed. Attempting to restart ICE.");
            peerConnection.restartIce();
        }
    };

    if (localStream) {
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    }
}

// Event listener for "Find Stranger" / "Skip" button with confirmation button handling
findStrangerBtn.addEventListener('click', () => {
    console.log("Button clicked:", findStrangerBtn.textContent);

    if (findStrangerBtn.textContent === "Find Stranger") {
        // Start searching for a partner
        findStrangerBtn.textContent = "Searching...";
        findStrangerBtn.disabled = true;
        console.log("Searching for partner...");
        startSearchForStranger();
    } else if (findStrangerBtn.textContent === "Skip") {
        // Show confirmation button and hide the skip button
        findStrangerBtn.style.display = "none";
        confirmSkipBtn.style.display = "inline-block";
        console.log("Confirming skip with 'Sure?'");

        // Timeout to revert back if "Sure?" is not confirmed
        setTimeout(() => {
            if (confirmSkipBtn.style.display === "inline-block") {
                confirmSkipBtn.style.display = "none";
                findStrangerBtn.style.display = "inline-block";
                console.log("Reverting 'Sure?' back to 'Skip'");
            }
        }, 3000);
    }
});

// Confirmation button event listener
confirmSkipBtn.addEventListener('click', () => {
    console.log("Skip confirmed. Ending call and searching again.");
    socket.emit('endCall'); // Emit end call to server
    resetCall();
    findStrangerBtn.textContent = "Searching...";
    findStrangerBtn.disabled = true;
    confirmSkipBtn.style.display = "none"; // Hide confirmation button
    findStrangerBtn.style.display = "inline-block"; // Show original button
    if (isMobile) {
        chatToggleBtn.style.display = "none"; // Hide chat toggle button when not connected
    }
    startSearchForStranger();
});

function startSearchForStranger() {
    findStrangerBtn.textContent = "Searching...";
    findStrangerBtn.disabled = true;
    showSpinner();
    socket.emit('findVideoPartner');
}

function resetCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
        userVideo.srcObject = null;
    }
    strangerVideo.srcObject = null;
    connectionEstablished = false;
    hideSpinner();
    findStrangerBtn.textContent = "Find Stranger";
    findStrangerBtn.disabled = false;
    findStrangerBtn.style.display = "inline-block";
    confirmSkipBtn.style.display = "none";
    if (isMobile) {
        chatToggleBtn.style.display = "none"; // Hide chat toggle button when not connected
    }

    // Reset report button
    reportBtn.classList.add('hidden');
    reportBtn.disabled = false;

    // Clear chat messages
    chatMessages.innerHTML = '';
    chatInput.value = '';
    chatInput.disabled = true; // Disable chat input when not connected
    sendChatBtn.disabled = true;

    // Hide chat modal on mobile
    if (isMobile) {
        chatModal.classList.remove('show');
        modalChatMessages.innerHTML = '';
        modalChatInput.value = '';
        modalChatInput.disabled = true;
        modalSendChatBtn.disabled = true;
    } else {
        chatBox.style.display = 'none';
        chatBox.classList.remove('desktop-visible');
        chatBox.classList.remove('collapsed'); // Ensure chatbox is expanded by default
        toggleChatSizeBtn.innerHTML = '&#9660;';
    }

    // Reset connection attempts and reconnection delay
    connectionAttempts = 0;
    reconnectionDelay = 1000;
    unreadMessages = 0;
    hideChatNotificationDot();
}


// Function to update UI elements upon connection
function updateUIOnConnection() {
    if (isMobile) {
        chatToggleBtn.style.display = "inline-block"; // Show chat toggle button on mobile when connected
        // Hide chat modal initially
        chatModal.classList.remove('show');
        modalChatMessages.innerHTML = '';
        modalChatInput.value = '';
        modalChatInput.disabled = false;
        modalSendChatBtn.disabled = false;
    } else {
        chatBox.style.display = 'flex'; // Show chatbox on desktop when connected
        chatBox.classList.add('desktop-visible'); // Make chatbox visible on desktop
        chatBox.classList.remove('collapsed'); // Ensure chatbox is expanded by default
        toggleChatSizeBtn.innerHTML = '&#9660;';
        chatMessages.innerHTML = '';
        chatInput.value = '';
        chatInput.disabled = false; // Enable chat input
        sendChatBtn.disabled = false;
    }

    // Enable the report button
    reportBtn.disabled = false;
    reportBtn.classList.remove('hidden');
}


// Handle partner found event
socket.on('videoPartnerFound', async ({ initiator }) => {
    console.log("Video partner found. Initiator:", initiator);

    if (!peerConnection) {
        await initializePeerConnection();
    }

    if (peerConnection) {
        findStrangerBtn.textContent = "Skip";
        findStrangerBtn.disabled = false;

        updateUIOnConnection();

        if (initiator) {
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit('videoSignal', { signalData: { type: offer.type, sdp: offer.sdp } });

                connectionEstablished = true;
                console.log("Offer sent; waiting for answer.");
            } catch (error) {
                console.error("Error creating offer:", error);
                handleConnectionError();
            }
        }
    } else {
        console.error("Peer connection could not be established.");
        handleConnectionError();
    }
    callStartTime = Date.now();
});

function handleConnectionError() {
    resetCall();
    connectionAttempts++;
    if (connectionAttempts <= 5) {
        setTimeout(startSearchForStranger, reconnectionDelay);
        reconnectionDelay *= 2; // Exponential backoff
    } else {
        showError("Failed to establish a connection after multiple attempts.");
        reconnectionDelay = 1000; // Reset delay
        connectionAttempts = 0;
    }
}

// Handle incoming signaling data, including offers, answers, and ICE candidates
socket.on('videoSignal', async ({ signalData }) => {
    try {
        if (!peerConnection) {
            await initializePeerConnection();
        }

        if (signalData.type === "offer") {
            console.log("Received offer from partner.");
            await peerConnection.setRemoteDescription(signalData);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('videoSignal', { signalData: { type: answer.type, sdp: answer.sdp } });

            // Send any queued ICE candidates
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                socket.emit('videoSignal', { signalData: { candidate } });
            }
        } else if (signalData.type === "answer") {
            console.log("Received answer from partner.");
            await peerConnection.setRemoteDescription(signalData);

            // Send any queued ICE candidates
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                socket.emit('videoSignal', { signalData: { candidate } });
            }
        } else if (signalData.candidate) {
            const candidate = new RTCIceCandidate(signalData.candidate);
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                await peerConnection.addIceCandidate(candidate);
                console.log("Added ICE candidate.");
            } else {
                console.log("Queuing ICE candidate until remote description is set.");
                iceCandidatesQueue.push(candidate);
            }
        }
    } catch (error) {
        console.error("Error handling signal:", error);
        handleConnectionError();
    }
});

socket.on('callEnded', (data) => {
    const { reason } = data;
    if (reason === 'partner_left' || reason === 'reported') {
        showError("Stranger left, finding new person.");
    } else {
        showError("Call ended.");
    }
    resetCall();
    startSearchForStranger();
});

socket.on('partnerLeft', (data) => {
    if (data.reason === 'disconnected') {
        showError("Stranger disconnected.");
    } else {
        showError("Stranger left.");
    }
    resetCall();
    startSearchForStranger();
});

// Retry connection if the server becomes temporarily unavailable
socket.on('connect_error', (error) => {
    if (socket.active){
    }
    else{
    console.error("Connection error:", error);
    showError("Connection lost. Retrying...");
    setTimeout(() => socket.connect(), 1000);
    }
});

// Handle 'reportLimitExceeded' event from the server
socket.on('reportLimitExceeded', (data) => {
    const { message } = data;
    alert(message);
    console.log('Report limit exceeded:', message);
});

// Handle 'reportError' event from the server
socket.on('reportError', (data) => {
    const { message } = data;
    alert(message);
    console.log('Report error:', message);
});


// Spinner display functions
function showSpinner() {
    spinnerOverlay.style.display = 'flex';
}

function hideSpinner() {
    spinnerOverlay.style.display = 'none';
}

// Error display function
function showError(message) {
    let errorDiv = document.getElementById('errorDiv');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorDiv';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = '#fff';
        errorDiv.style.padding = '10px 20px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.zIndex = '1000';
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    // Hide after some time
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// ==================== Chat Functionality ====================

// Event listener for sending chat messages (Desktop)
sendChatBtn.addEventListener('click', () => sendChatMessage('desktop'));

// Event listener for sending chat messages (Mobile Modal)
modalSendChatBtn.addEventListener('click', () => sendChatMessage('mobile'));

// Send message on Enter key (Desktop)
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage('desktop');
    }
});

// Send message on Enter key (Mobile Modal)
modalChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage('mobile');
    }
});

function sendChatMessage(device) {
    let message;
    if (device === 'desktop') {
        message = chatInput.value.trim();
    } else {
        message = modalChatInput.value.trim();
    }

    if (message === '') return;

    // Display your own message
    displayChatMessage('You', message, device);

    if (device === 'desktop') {
        chatInput.value = '';
    } else {
        modalChatInput.value = '';
    }

    // Send the message to the server
    socket.emit('videoChatMessage', message);
}

socket.on('videoChatMessage', (data) => {
    const { text } = data;
    displayChatMessage('Stranger', text);
    // If chat modal is not open on mobile, increment unread messages
    if (isMobile && !chatModal.classList.contains('show')) {
        unreadMessages++;
        showChatNotificationDot();
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayChatMessage(sender, message, device = null) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', sender === 'You' ? 'you' : 'stranger');
    msgDiv.innerHTML = escapeHtml(message);

    if (isMobile || device === 'mobile') {
        // Append message to chat modal
        modalChatMessages.appendChild(msgDiv);
        modalChatMessages.scrollTop = modalChatMessages.scrollHeight;
    } else {
        // Append message to chat box
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Chat Toggle Button Event Listener (Mobile Only)
if (isMobile) {
    chatToggleBtn.addEventListener('click', () => {
        // Show chat modal
        chatModal.classList.add('show');

        // Reset unread messages
        unreadMessages = 0;
        hideChatNotificationDot();
    });
}


// Close Chat Modal Button Event Listener (Mobile)
closeChatModalBtn.addEventListener('click', () => {
    if (isMobile) {
        chatModal.classList.remove('show');
    }
});

// Toggle Chat Size Button Event Listener (Desktop)
toggleChatSizeBtn.addEventListener('click', () => {
    if (!isMobile) {
        chatBox.classList.toggle('collapsed');
        if (chatBox.classList.contains('collapsed')) {
            toggleChatSizeBtn.innerHTML = '&#9650;'; // ▲
        } else {
            toggleChatSizeBtn.innerHTML = '&#9660;'; // ▼
        }
    }
});

// Adjust chat input area when collapsed (Desktop)
chatBox.addEventListener('transitionend', () => {
    if (!isMobile) {
        if (chatBox.classList.contains('collapsed')) {
            chatBox.style.height = chatInput.offsetHeight + 'px';
        } else {
            chatBox.style.height = '';
        }
    }
});

// Adjust video layout based on screen size
function adjustVideoLayout() {
    if (window.innerWidth >= 769) {
        // Desktop: Adjust stranger video width
        strangerVideo.style.width = '100%'; // Full width
    } else {
        // Mobile: Full width
        strangerVideo.style.width = '100%';
    }
}

function showChatNotificationDot() {
    const chatNotificationDot = document.getElementById('chatNotificationDot');
    if (chatNotificationDot) {
        chatNotificationDot.style.display = 'block';
    }
}

function hideChatNotificationDot() {
    const chatNotificationDot = document.getElementById('chatNotificationDot');
    if (chatNotificationDot) {
        chatNotificationDot.style.display = 'none';
    }
}


// video.js

reportBtn.addEventListener('click', () => {
    const confirmReport = confirm('Are you sure you want to report this user for inappropriate behavior?');
    if (confirmReport) {
        const reportReason = prompt('Please provide a brief reason for reporting (optional):');

        const callEndTime = Date.now();
        const callDuration = callEndTime - (callStartTime || callEndTime);

        // Emit 'reportUser' with 'type' specified as 'video'
        socket.emit('reportUser', { type: 'video', reason: reportReason, callDuration });

        alert('Thank you for your report. Our team will review this session.');

        reportBtn.disabled = true;

        resetCall();
        findStrangerBtn.textContent = "Searching...";
        findStrangerBtn.disabled = true;
        if (isMobile) {
            chatToggleBtn.style.display = "none";
        }
        startSearchForStranger();
    }
});



// Call the function on window resize
window.addEventListener('resize', adjustVideoLayout);
adjustVideoLayout(); // Initial call
