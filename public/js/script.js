let targetLink = "";

// Open modal with the specified link
function openModal(link) {
    targetLink = link;
    document.getElementById('myModal').style.display = 'flex';
}

// Proceed to the stored link when "Okay" is clicked
function proceedToLink() {
    document.getElementById('myModal').style.display = 'none';
    window.location.href = targetLink;
}

// Attach event listeners
document.addEventListener("DOMContentLoaded", function() {
    const chatButton = document.getElementById('chatButton');
    const videoButton = document.getElementById('videoButton');
    const modalOkayButton = document.getElementById('modalOkayButton');

    chatButton.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent default link action
        openModal('/chat');
    });

    videoButton.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent default link action
        openModal('/video');
    });

    modalOkayButton.addEventListener('click', proceedToLink);
});
