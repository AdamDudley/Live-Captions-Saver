// content_script.js

// Constants and variables
const LEAVE_BUTTON_SELECTOR = "div#hangup-button button";
let transcriptArray = [];
let capturing = false;
let observer = null;
let meetingDate = new Date().toLocaleDateString();
let leaveButtonListener = null;
let leaveButton = null;
let lastMeetingTitle = "";
let meetingDetails = "";
let startTranscriptionTime = null;

console.log('🔧 Content script loaded at:', new Date().toISOString());

// Debug function to find potential caption containers (not called, but useful for future debugging)
function debugCaptionElements() {
    console.log('🔍 === DEBUGGING CAPTION ELEMENTS ===');
    const potentialContainers = [
        "[data-tid*='caption']", "[data-tid*='transcript']", "[data-tid*='live-caption']",
        "[class*='caption']", "[class*='transcript']", "[class*='live-caption']", "[class*='closed-caption']",
        "[class*='chat']", "[class*='message']", "[data-tid*='chat']", "[data-tid*='message']",
        "[data-tid*='renderer']", "[class*='renderer']"
    ];
    console.log('🔍 Searching for potential caption containers...');
    potentialContainers.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`✅ Found ${elements.length} elements for selector: ${selector}`);
        }
    });
    console.log('🔍 === END CAPTION DEBUGGING ===');
}

// Function to check for and process captions
function checkCaptions() {
    const captionItems = document.querySelectorAll('.fui-ChatMessageCompact');

    captionItems.forEach(item => {
        const idElement = item.querySelector('[data-lpc-hover-target-id]');
        const ID = idElement ? idElement.getAttribute('data-lpc-hover-target-id') : null;

        if (!ID) {
            return; // Skip if we can't get a stable ID
        }

        const authorElement = item.querySelector('[data-tid="author"]');
        const textElement = item.querySelector('[data-tid="closed-caption-text"]');

        if (authorElement && textElement) {
            const Name = (authorElement.innerText || authorElement.textContent || '').trim();
            const Text = (textElement.innerText || textElement.textContent || '').trim();
            const Time = new Date().toLocaleTimeString();

            const existingIndex = transcriptArray.findIndex(t => t.ID === ID);

            if (existingIndex > -1) {
                // Update existing entry if text has changed
                if (transcriptArray[existingIndex].Text !== Text) {
                    transcriptArray[existingIndex].Text = Text;
                }
            } else {
                // Add new entry
                transcriptArray.push({ Name, Text, Time, ID });
            }
        }
    });
}

// Function to start transcription
function startTranscription() {
    console.log('🚀 Starting transcription...');
    
    const captionItems = document.querySelectorAll('.fui-ChatMessageCompact');
    if (captionItems.length === 0) {
        console.log("❌ No caption items found. Please ensure live captions are turned on. Retrying in 5s...");
        setTimeout(startTranscription, 5000);
        return false;
    }
    
    console.log('✅ Transcription setup complete - starting to capture captions');
    capturing = true;
    
    observer = new MutationObserver(checkCaptions);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    checkCaptions(); // Initial check
    return true;
}

// Function to handle leave button detection
function handleLeaveButtonDetection(newLeaveButton) {
    try {
        if (leaveButton && leaveButtonListener) {
            leaveButton.removeEventListener('click', leaveButtonListener);
            leaveButtonListener = null;
        }

        let currentMeetingTitle = document.title.replace(/\(\d+\)\s*/, '').replace("Microsoft Teams", '').trim();
        if (currentMeetingTitle !== lastMeetingTitle) {
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
    if (!leaveButton) return;

    chrome.storage.local.get(['leaveTrigger'], function (result) {
        const leaveTrigger = result.leaveTrigger || false;
        if (leaveTrigger) {
            if (!leaveButtonListener) {
                leaveButtonListener = () => {
                    chrome.runtime.sendMessage({ message: "leave_button_save_captions" });
                };
                leaveButton.addEventListener('click', leaveButtonListener);
            }
        } else {
            if (leaveButtonListener) {
                leaveButton.removeEventListener('click', leaveButtonListener);
                leaveButtonListener = null;
            }
        }
    });
}

// Function to observe dynamic elements
function observeDynamicElements() {
    const observerConfig = { childList: true, subtree: true };
    const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const newLeaveButton = document.querySelector(LEAVE_BUTTON_SELECTOR);
                if (newLeaveButton && newLeaveButton !== leaveButton) {
                    startTranscriptionTime = new Date().getTime();
                    handleLeaveButtonDetection(newLeaveButton);
                }
                const meetingDetailsContainer = document.querySelector('div[data-tid="meeting-details-container"]');
                if (meetingDetailsContainer) {
                    meetingDetails = getMeetingDetails();
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
        return details;
    }
    return "";
}

// Listen for changes in leaveTrigger value
chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local' && changes.leaveTrigger) {
        handleLeaveTriggerSettingChange();
    }
});

// Message listener to handle requests from popup or service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Content script received message:', request);
    
    switch (request.message) {
        case 'return_transcript':
            if (!capturing) {
                checkCaptions();
            }
            if (transcriptArray.length > 0) {
                sendResponse({
                    transcriptArray: transcriptArray,
                    meetingTitle: lastMeetingTitle,
                    meetingDate: meetingDate,
                    meetingDetails: meetingDetails
                });
            } else {
                sendResponse({ error: "No captions were captured. Please make sure live captions are enabled in Teams." });
            }
            break;
        
        case 'store_current_captions':
            if (transcriptArray.length === 0) {
                checkCaptions();
            }
            storeMeetingData();
            sendResponse({ success: true });
            break;

        default:
            // Unknown message type
            break;
    }
    return true; // Keep the message channel open for asynchronous response
});

// Function to store meeting data
function storeMeetingData() {
    if (!transcriptArray.length) return;

    chrome.storage.local.get(['savedMeetings'], function(result) {
        let savedMeetings = result.savedMeetings || [];
        
        let currentMeetingTitle = document.title.replace(/\(\d+\)\s*/, '').replace("Microsoft Teams", '').trim();

        const firstMessage = transcriptArray[0];
        const lastMessage = transcriptArray[transcriptArray.length - 1];
        const startTime = firstMessage ? firstMessage.Time : '';
        const endTime = lastMessage ? lastMessage.Time : '';

        const existingMeetingIndex = savedMeetings.findIndex(m => m.title === currentMeetingTitle && m.date === meetingDate);

        if (existingMeetingIndex !== -1) {
            // Update existing meeting
            savedMeetings[existingMeetingIndex] = {
                ...savedMeetings[existingMeetingIndex],
                transcripts: [...transcriptArray],
                lastUpdated: Date.now()
            };
        } else {
            // Create new meeting entry
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
                savedMeetings.pop(); // Limit history to 20 meetings
            }
        }

        chrome.storage.local.set({ savedMeetings });
    });
}

// Auto-save when mouse goes near the top part of the screen
let lastAutoSaveTime = 0;
const AUTO_SAVE_INTERVAL = 60000; // 1 minute

document.addEventListener('mousemove', function(event) {
    if (event.clientY <= 50) {
        const currentTime = Date.now();
        if (currentTime - lastAutoSaveTime > AUTO_SAVE_INTERVAL) {
            storeMeetingData();
            lastAutoSaveTime = currentTime;
        }
    }
});

// Save captions when tab visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        storeMeetingData();
    }
});

// Periodically save captions during the meeting
setInterval(function() {
    if (capturing) {
        storeMeetingData();
    }
}, 30000); // Every 30 seconds

// Initialize dynamic elements observer
window.onload = () => {
    console.log("Window loaded. Running content script...");
    startTranscription();
    observeDynamicElements();
};

console.log("content_script.js is running");
