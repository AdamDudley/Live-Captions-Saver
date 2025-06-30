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

console.log('🔧 Content script loaded at:', new Date().toISOString());

// Debug function to find potential caption containers
function debugCaptionElements() {
    console.log('🔍 === DEBUGGING CAPTION ELEMENTS ===');
    
    // Check for the old selector first
    const oldContainer = document.querySelector("[data-tid='closed-captions-renderer']");
    console.log('🔎 Old container [data-tid="closed-captions-renderer"]:', oldContainer);
    
    // Look for any elements that might be caption containers
    const potentialContainers = [
        // Old selectors
        "[data-tid='closed-captions-renderer']",
        ".ui-chat__item",
        
        // Potential new selectors
        "[data-tid*='caption']",
        "[data-tid*='transcript']",
        "[data-tid*='live-caption']",
        "[class*='caption']",
        "[class*='transcript']",
        "[class*='live-caption']",
        "[class*='closed-caption']",
        
        // Look for chat-like containers
        "[class*='chat']",
        "[class*='message']",
        "[data-tid*='chat']",
        "[data-tid*='message']",
        
        // Common Microsoft Teams element patterns
        "[data-tid*='renderer']",
        "[class*='renderer']"
    ];
    
    console.log('🔍 Searching for potential caption containers...');
    potentialContainers.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`✅ Found ${elements.length} elements for selector: ${selector}`);
            elements.forEach((el, index) => {
                if (index < 3) { // Only log first 3 to avoid spam
                    console.log(`   [${index}]:`, el);
                    console.log(`   Text content preview:`, el.textContent ? el.textContent.substring(0, 100) : 'No text');
                }
            });
        }
    });
    
    // Look for elements containing speaker names or transcript-like content
    console.log('🔍 Looking for elements with speaker patterns...');
    const allElements = document.querySelectorAll('*');
    let speakerElements = [];
    
    allElements.forEach(el => {
        const text = el.textContent || '';
        // Look for patterns like "Name:" or "Name said:"
        if (text.match(/^[A-Za-z\s]+:/) || text.includes('said:')) {
            if (text.length < 200) { // Avoid very long text blocks
                speakerElements.push({
                    element: el,
                    text: text,
                    classes: el.className,
                    dataAttributes: Array.from(el.attributes).filter(attr => attr.name.startsWith('data-'))
                });
            }
        }
    });
    
    console.log(`🗣️ Found ${speakerElements.length} potential speaker elements:`);
    speakerElements.slice(0, 5).forEach((item, index) => {
        console.log(`   [${index}] Text: "${item.text}"`);
        console.log(`   [${index}] Classes: "${item.classes}"`);
        console.log(`   [${index}] Data attributes:`, item.dataAttributes);
        console.log(`   [${index}] Element:`, item.element);
    });
    
    console.log('🔍 === END CAPTION DEBUGGING ===');
}

// Enhanced function to check captions with debugging
function checkCaptions() {
    console.log('🔎 checkCaptions() called');
    
    // First, try the old selector
    const closedCaptionsContainer = document.querySelector("[data-tid='closed-captions-renderer']");
    console.log('📦 Old captions container found:', !!closedCaptionsContainer);
    
    if (!closedCaptionsContainer) {
        console.log('❌ Old captions container not found - Teams UI may have changed');
        console.log('🔍 Running caption element debugging...');
        debugCaptionElements();
        return;
    }
    
    // Try new structure first (current Teams UI)
    let transcripts = closedCaptionsContainer.querySelectorAll('.fui-ChatMessageCompact');
    console.log('📝 Found NEW format transcript items:', transcripts.length);
    
    // If new structure not found, try old structure for backwards compatibility
    if (transcripts.length === 0) {
        transcripts = closedCaptionsContainer.querySelectorAll('.ui-chat__item');
        console.log('📝 Found OLD format transcript items:', transcripts.length);
    }

    const size = transcripts.length;
    
    if (size === 0) {
        console.log('⚠️ No transcript items found in container using either format');
        console.log('🔍 Running caption element debugging...');
        debugCaptionElements();
        return;
    }

    transcripts.forEach((transcript, index) => {
        console.log(`🔍 Processing transcript ${index + 1}/${size}`);
        
        // Try to get ID - this might not exist in new format, so we'll generate one
        let messageElement = transcript.querySelector('.fui-Flex > .ui-chat__message');
        let ID = messageElement ? messageElement.id : '';
        
        // If no ID found, generate one based on index and timestamp
        if (!ID) {
            ID = `caption_${Date.now()}_${index}`;
        }
        
        console.log(`   ID: "${ID}"`);

        // Try new format selectors first
        let authorElement = transcript.querySelector('[data-tid="author"]');
        let textElement = transcript.querySelector('[data-tid="closed-caption-text"]');
        
        // If new format not found, try old format
        if (!authorElement) {
            authorElement = transcript.querySelector('.ui-chat__message__author');
        }
        if (!textElement) {
            textElement = transcript.querySelector('.fui-StyledText');
        }
        
        console.log(`   Author element found: ${!!authorElement}`);
        console.log(`   Text element found: ${!!textElement}`);

        if (authorElement && textElement) {
            const Name = authorElement.innerText || authorElement.textContent || '';
            const Text = textElement.innerText || textElement.textContent || '';
            const Time = new Date().toLocaleTimeString();
            
            console.log(`   📊 Name: "${Name}", Text: "${Text.substring(0, 50)}..."`);

            // Check if this transcript already exists
            const existingIndex = transcriptArray.findIndex(t => t.ID === ID);

            if (existingIndex > -1) {
                // Update existing entry if text has changed
                if (transcriptArray[existingIndex].Text !== Text) {
                    transcriptArray[existingIndex] = {
                        Name,
                        Text,
                        Time,
                        ID
                    };
                    console.log('   ✅ Updated existing transcript entry');
                }
            } else {
                // Add new entry
                transcriptArray.push({ Name, Text, Time, ID });
                console.log('   ✅ Added new transcript entry');
            }
        } else {
            console.log('   ❌ Missing author or text element for this transcript item');
            console.log(`   🔍 Transcript HTML:`, transcript.outerHTML.substring(0, 200) + '...');
        }
    });
    
    console.log(`📊 Total transcripts in array: ${transcriptArray.length}`);
}

// Function to start transcription
function startTranscription() {
    console.log('🚀 Starting transcription...');
    
    const meetingDurationElement = document.getElementById("call-duration-custom");
    console.log('⏱️ Meeting duration element found:', !!meetingDurationElement);
    
    if (!meetingDurationElement) {
        console.log('⚠️ Meeting duration element not found, retrying in 5 seconds...');
        setTimeout(startTranscription, 5000);
        return false;
    }

    const closedCaptionsContainer = document.querySelector("[data-tid='closed-captions-renderer']");
    console.log('📦 Captions container found:', !!closedCaptionsContainer);
    
    if (!closedCaptionsContainer) {
        console.log("❌ Captions container not found. Please turn on live captions:");
        console.log("   1. Click 'More' (three dots)");
        console.log("   2. Go to 'Language and speech'"); 
        console.log("   3. Click 'Turn on live captions'");
        console.log("🔄 Retrying in 5 seconds...");
        setTimeout(startTranscription, 5000);
        return false;
    }

    // Check if we can find any caption items to confirm captions are working
    let captionItems = closedCaptionsContainer.querySelectorAll('.fui-ChatMessageCompact');
    if (captionItems.length === 0) {
        captionItems = closedCaptionsContainer.querySelectorAll('.ui-chat__item');
    }
    
    console.log('📝 Found caption items during startup:', captionItems.length);
    
    console.log('✅ Transcription setup complete - starting to capture captions');
    capturing = true;
    
    // Set up observer to watch for new captions
    observer = new MutationObserver(checkCaptions);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Do an initial check for any existing captions
    checkCaptions();

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
    console.log('📨 Content script received message:', request);
    console.log('📊 Current state - capturing:', capturing, 'transcriptArray length:', transcriptArray.length);
    
    switch (request.message) {
        case 'return_transcript':
            console.log('📤 Processing return_transcript request');
            console.log('📊 Transcript array contents:', transcriptArray);
            console.log('📝 Meeting title:', lastMeetingTitle);
            console.log('📅 Meeting date:', meetingDate);
            console.log('📋 Meeting details:', meetingDetails);
            
            if (!capturing) {
                console.log('❌ Not currently capturing - checking if we can find captions anyway...');
                
                // Try to run caption debugging to see what's available
                debugCaptionElements();
                
                // Try to manually check for captions one more time
                checkCaptions();
                
                if (transcriptArray.length > 0) {
                    console.log('✅ Found captions even though not capturing! Returning them.');
                    sendResponse({
                        transcriptArray: transcriptArray,
                        meetingTitle: lastMeetingTitle,
                        meetingDate: meetingDate,
                        meetingDetails: meetingDetails
                    });
                } else {
                    console.log('❌ Still no captions found');
                    sendResponse({ error: "No captions were captured. Please, try again. Make sure live captions are enabled in Teams." });
                }
                return;
            }

            console.log('✅ Currently capturing, returning transcript data');
            sendResponse({
                transcriptArray: transcriptArray,
                meetingTitle: lastMeetingTitle,
                meetingDate: meetingDate,
                meetingDetails: meetingDetails
            });
            break;
        
        case 'store_current_captions':
            console.log('💾 Processing store_current_captions request');
            console.log('📊 Transcript array length before storing:', transcriptArray.length);
            
            if (transcriptArray.length === 0) {
                console.log('⚠️ No captions to store - trying to check for captions first');
                checkCaptions();
            }
            
            storeMeetingData();
            sendResponse({ success: true });
            break;

        default:
            console.log('⚠️ Unknown message type:', request.message);
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
