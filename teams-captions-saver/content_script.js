// content_script.js

// Constants and variables
const LEAVE_BUTTON_SELECTOR = "div#hangup-button button";
const transcriptArray = [];
let capturing = false;
let observer = null;
let meetingDate = new Date().toLocaleDateString();
let leaveButtonListener = null;
let leaveButton = null;
let lastMeetingTitle = "";
let meetingDetails = "";
let startTranscriptionTime = null;

// Function to check captions and populate transcriptArray
function checkCaptions() {
    // Update the selector if necessary
    const closedCaptionsContainer = document.querySelector("[data-tid='closed-captions-renderer']");
    if (!closedCaptionsContainer) {
        return;
    }
    const transcripts = closedCaptionsContainer.querySelectorAll('.ui-chat__item');

    const size = transcripts.length;
    // console.log(size); // Uncomment for debugging

    transcripts.forEach(transcript => {
        const ID = transcript.querySelector('.fui-Flex > .ui-chat__message').id;

        if (ID === '' && size > 2) {
            const index = transcriptArray.findIndex(t => t.ID === ID);

            if (index > -1) {
                transcriptArray[index].ID = startTranscriptionTime;
            } else {
                console.log("The initial message ID was already updated with TimeStamp in the transcriptArray");
            }

            return;
        }

        if (transcript.querySelector('.ui-chat__message__author') != null) {
            const Name = transcript.querySelector('.ui-chat__message__author').innerText;
            const Text = transcript.querySelector('.fui-StyledText').innerText;
            const Time = new Date().toLocaleTimeString();

            const index = transcriptArray.findIndex(t => t.ID === ID);

            if (index > -1) {
                if (transcriptArray[index].Text !== Text) {
                    transcriptArray[index] = {
                        Name,
                        Text,
                        Time,
                        ID
                    };
                }
            } else {
                // console.log({ Name, Text, Time, ID }); // Uncomment for debugging
                transcriptArray.push({ Name, Text, Time, ID });
            }
        }
    });
}

// Function to start transcription
function startTranscription() {
    const meetingDurationElement = document.getElementById("call-duration-custom");
    if (!meetingDurationElement) {
        setTimeout(startTranscription, 5000);
        return false;
    }

    const closedCaptionsContainer = document.querySelector("[data-tid='closed-captions-renderer']");
    if (!closedCaptionsContainer) {
        console.log("Please, click 'More' > 'Language and speech' > 'Turn on live captions'");
        setTimeout(startTranscription, 5000);
        return false;
    }

    capturing = true;
    observer = new MutationObserver(checkCaptions);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return true;
}

// Function to handle leave button detection
function handleLeaveButtonDetection(newLeaveButton) {
    try {
        if (leaveButton && leaveButtonListener) {
            console.log("Removing event listener from the previous Leave button...");
            leaveButton.removeEventListener('click', leaveButtonListener);
            leaveButtonListener = null;
        }

        let currentMeetingTitle = document.title
            .replace(/\(\d+\)\s*/, '')
            .replace("Microsoft Teams", '')
            .trim();

        console.log("Current Meeting Title Detected:", currentMeetingTitle);

        if (currentMeetingTitle !== lastMeetingTitle) {
            console.log("New meeting detected. Clearing previous transcript...");
            transcriptArray.length = 0;
            lastMeetingTitle = currentMeetingTitle;
        }

        leaveButton = newLeaveButton;
        handleLeaveTriggerSettingChange();

    } catch (error) {
        console.error("Error handling leave button detection:", error);
    }
}

// Function to handle leave trigger setting change
function handleLeaveTriggerSettingChange() {
    if (!leaveButton) {
        console.log("No Leave button detected yet. Nothing to update.");
        return;
    }

    chrome.storage.local.get(['leaveTrigger'], function (result) {
        const leaveTrigger = result.leaveTrigger || false;

        if (leaveTrigger) {
            console.log("leaveTrigger is enabled, adding event listener to Leave button.");

            if (!leaveButtonListener) {
                leaveButtonListener = () => {
                    console.log("Leave button clicked, saving captions...");
                    chrome.runtime.sendMessage({
                        message: "leave_button_save_captions"
                    });
                };
                leaveButton.addEventListener('click', leaveButtonListener);
            } else {
                console.log("Leave button listener is already attached.");
            }
        } else {
            console.log("leaveTrigger is disabled, removing event listener from Leave button if it exists.");

            if (leaveButtonListener) {
                leaveButton.removeEventListener('click', leaveButtonListener);
                leaveButtonListener = null;
            }
        }
    });
}

// Function to observe dynamic elements
function observeDynamicElements() {
    const observerConfig = {
        childList: true,
        subtree: true,
    };

    const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {

                const newLeaveButton = document.querySelector(LEAVE_BUTTON_SELECTOR);
                if (newLeaveButton && newLeaveButton !== leaveButton) {
                    console.log("New Leave button found. Updating listener...");

                    const now = new Date();
                    startTranscriptionTime = now.getTime();

                    handleLeaveButtonDetection(newLeaveButton);
                }

                const meetingDetailsContainer = document.querySelector('div[data-tid="meeting-details-container"]');
                if (meetingDetailsContainer) {
                    console.log("Meeting details container found.");

                    meetingDetails = getMeetingDetails();
                    if (meetingDetails) {
                        if (meetingDetails === "Unknown") {
                            console.log("Meeting details are still loading. Observing further changes...");
                        } else {
                            console.log("Meeting Details:", meetingDetails);
                        }
                    } else {
                        console.log("We should never get here.");
                    }
                }
            }
        });
    });

    mutationObserver.observe(document.body, observerConfig);
}

// Function to get meeting details
function getMeetingDetails() {
    const meetingDetailsContainer = document.querySelector('div[data-tid="meeting-details-container"]');
    
    if (meetingDetailsContainer) {
        const spans = meetingDetailsContainer.querySelectorAll('span');

        let details = "";
        spans.forEach((span, index) => {
            details += span.textContent.trim();
            if (index < spans.length - 1) {
                details += " ";
            }
        });

        meetingDetails = details;

        console.log("Meeting Details:", meetingDetails);
    } else {
        console.log("Meeting details container not found.");
    }
    return meetingDetails;
}

// Listen for changes in leaveTrigger value
chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local' && changes.leaveTrigger) {
        console.log("leaveTrigger setting has changed. Updating leave button listener...");
        handleLeaveTriggerSettingChange();
    }
});

// Message listener to handle requests from popup or service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.message) {
        case 'return_transcript':
            console.log("response:", transcriptArray);
            if (!capturing) {
                sendResponse({ error: "No captions were captured. Please, try again." });
                return;
            }

            sendResponse({
                transcriptArray: transcriptArray,
                meetingTitle: lastMeetingTitle,
                meetingDate: meetingDate,
                meetingDetails: meetingDetails
            });
            break;
        
        case 'store_current_captions':
            console.log("Storing current captions");
            storeMeetingData();
            sendResponse({ success: true });
            break;

        default:
            break;
    }
    return true;
});

// Function to store meeting data
function storeMeetingData() {
    if (!transcriptArray.length) return;

    chrome.storage.local.get(['savedMeetings'], function(result) {
        let savedMeetings = result.savedMeetings || [];
        
        let currentMeetingTitle = document.title
            .replace(/\(\d+\)\s*/, '')
            .replace("Microsoft Teams", '')
            .trim();

        // Get first and last message times
        const firstMessage = transcriptArray[0];
        const lastMessage = transcriptArray[transcriptArray.length - 1];
        const startTime = firstMessage ? firstMessage.Time : '';
        const endTime = lastMessage ? lastMessage.Time : '';

        const existingMeetingIndex = savedMeetings.findIndex(m => 
            m.title === currentMeetingTitle && 
            m.date === meetingDate
        );

        if (existingMeetingIndex !== -1) {
            // Update existing meeting
            console.log("Updating existing meeting in storage");
            savedMeetings[existingMeetingIndex] = {
                ...savedMeetings[existingMeetingIndex],
                title: currentMeetingTitle,
                date: meetingDate,
                startTime: startTime,
                endTime: endTime,
                transcripts: [...transcriptArray],
                lastUpdated: Date.now()
            };
        } else {
            // Create new meeting entry
            console.log("Creating new meeting entry in storage");
            savedMeetings.unshift({
                id: Date.now(),
                title: currentMeetingTitle,
                date: meetingDate,
                startTime: startTime,
                endTime: endTime,
                transcripts: [...transcriptArray],
                lastUpdated: Date.now()
            });

            if (savedMeetings.length > 20) {
                savedMeetings.pop();
            }
        }

        chrome.storage.local.set({ savedMeetings }, function() {
            console.log('Meeting data ' + (existingMeetingIndex !== -1 ? 'updated' : 'saved'));
        });
    });
}

// Auto-save when mouse goes near the top part of the screen
let lastAutoSaveTime = 0;
const AUTO_SAVE_INTERVAL = 60000; // 1 minute

document.addEventListener('mousemove', function(event) {
    if (event.clientY <= 50) {
        const currentTime = Date.now();
        if (currentTime - lastAutoSaveTime > AUTO_SAVE_INTERVAL) {
            console.log("Auto-saving captions due to mouse near top of screen");
            storeMeetingData();
            lastAutoSaveTime = currentTime;
        }
    }
});

// Save captions when tab visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        console.log('Tab is hidden, saving captions');
        storeMeetingData();
    } else if (document.visibilityState === 'visible') {
        console.log('Tab is visible');
        // Optionally, attempt to restart transcription or perform actions when the tab becomes visible again
    }
});

// Periodically save captions during the meeting
setInterval(function() {
    if (capturing) {
        console.log('Periodic save of captions');
        storeMeetingData();
    }
}, 60000); // Every 60 seconds

// Initialize dynamic elements observer
window.onload = () => {
    console.log("Window loaded. Running content script...");
    startTranscription();
    observeDynamicElements();
};

console.log("content_script.js is running");
