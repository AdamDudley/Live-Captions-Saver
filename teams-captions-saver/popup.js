// popup.js
document.addEventListener('DOMContentLoaded', function () {
    console.log('🔧 popup.js loaded at:', new Date().toISOString());

    const saveButton = document.getElementById('saveButton');
    const meetingList = document.getElementById('savedMeetings');
    const clearHistoryButton = document.getElementById('clearHistoryButton');

    if (!saveButton || !meetingList || !clearHistoryButton) {
        console.error('❌ Required elements not found in popup.html');
        return;
    }

    console.log('✅ Popup elements found successfully');

    // Display version info
    const versionInfo = document.getElementById('version-info');
    const manifest = chrome.runtime.getManifest();
    versionInfo.textContent = `Extension v${manifest.version}`;

    // Get Service Worker version
    chrome.runtime.sendMessage({ message: 'get_version' }, function(response) {
        if (chrome.runtime.lastError) {
            console.error('Error getting service worker version:', chrome.runtime.lastError);
            versionInfo.textContent += ' | SW vN/A';
        } else if (response && response.version) {
            versionInfo.textContent += ` | SW v${response.version}`;
        }
    });

    // Clear History Button
    clearHistoryButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all saved meeting history? This cannot be undone.')) {
            chrome.storage.local.set({ savedMeetings: [] }, function() {
                console.log('✅ Meeting history cleared.');
                displaySavedMeetings(); // Refresh the list
            });
        }
    });

    // Save Current Captions Button - Direct download without storage
    saveButton.addEventListener('click', function () {
        console.log('🎯 Save button clicked!');
        console.log('📋 Querying active tab...');
        
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            console.log('📋 Tab query result:', tabs);
            
            if (tabs[0]) {
                console.log('📤 Sending return_transcript message to tab:', tabs[0].id);
                console.log('📤 Tab URL:', tabs[0].url);
                
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "return_transcript"
                }, function(response) {
                    console.log('📥 Response from content script:', response);
                    
                    if (chrome.runtime.lastError) {
                        console.error('❌ Error sending message to content script:', chrome.runtime.lastError.message);
                        alert('Error retrieving captions. Make sure you are in a Teams meeting with captions enabled.');
                        return;
                    }
                    
                    if (response && response.transcriptArray && response.transcriptArray.length > 0) {
                        console.log('✅ Valid response received from content script');
                        console.log('📊 Transcript array length:', response.transcriptArray.length);
                        console.log('📝 Meeting title:', response.meetingTitle);
                        console.log('📅 Meeting date:', response.meetingDate);
                        
                        // Send message to service worker to download the captions
                        console.log('🚀 Sending download_captions message to service worker...');
                        
                        const messageToSend = {
                            message: 'download_captions',
                            transcriptArray: response.transcriptArray,
                            meetingTitle: response.meetingTitle,
                            meetingDate: response.meetingDate
                        };
                        
                        console.log('📦 Message being sent to service worker:', messageToSend);
                        
                        chrome.runtime.sendMessage(messageToSend, function(serviceWorkerResponse) {
                            if (chrome.runtime.lastError) {
                                console.error('❌ Error sending message to service worker:', chrome.runtime.lastError);
                            } else {
                                console.log('✅ Message sent to service worker successfully');
                                console.log('📥 Service worker response:', serviceWorkerResponse);
                            }
                        });
                    } else {
                        console.warn('⚠️ No valid transcript data received');
                        console.log('📊 Response details:', response);
                        alert(response?.error || 'No captions found. Make sure captions are enabled in the Teams meeting.');
                    }
                });
            } else {
                console.error('❌ No active tab found');
            }
        });
    });

    // Add new "Save to Storage" button
    const saveToStorageButton = document.createElement('button');
    saveToStorageButton.textContent = 'Save to Storage';
    saveToStorageButton.style.backgroundColor = '#6c757d';
    
    saveToStorageButton.addEventListener('click', function() {
        console.log('💾 Save to Storage button clicked!');
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('📋 Tab query for storage save:', tabs);
            
            if (!tabs || !tabs[0]) {
                console.error('❌ No active tab for storage save');
                alert('Please make sure you are in a Teams meeting tab.');
                return;
            }

            console.log('📤 Sending store_current_captions message...');
            
            chrome.tabs.sendMessage(tabs[0].id, {
                message: "store_current_captions"
            }, function(response) {
                console.log('📥 Storage save response:', response);
                
                if (chrome.runtime.lastError) {
                    console.error('❌ Storage save error:', chrome.runtime.lastError);
                    alert('Please make sure you are in a Teams meeting with captions enabled.');
                    return;
                }

                if (response && response.success) {
                    console.log('✅ Captions saved to storage successfully');
                    displaySavedMeetings();
                    alert('Captions saved successfully!');
                } else {
                    console.warn('⚠️ Failed to save captions to storage');
                    alert(response?.error || 'Failed to save captions. Please make sure captions are enabled in Teams.');
                }
            });
        });
    });

    // Insert the new button after the existing save button
    saveButton.parentNode.insertBefore(saveToStorageButton, saveButton.nextSibling);

    // Function to display saved meetings
    function displaySavedMeetings() {
        console.log('📋 Loading saved meetings...');
        
        chrome.storage.local.get(['savedMeetings'], function(result) {
            const savedMeetings = result.savedMeetings || [];
            console.log('📊 Found saved meetings:', savedMeetings.length);
            
            const meetingList = document.getElementById('savedMeetings');
            
            if (savedMeetings.length === 0) {
                meetingList.innerHTML = '<p style="text-align: center">No saved meetings yet</p>';
                return;
            }

            meetingList.innerHTML = savedMeetings.map(meeting => `
                <div class="meeting-item">
                    <div class="meeting-info">
                        <div class="meeting-title">${meeting.title || 'Untitled Meeting'}</div>
                        <div class="meeting-timestamp">
                            <div>Start: ${meeting.startTime || 'N/A'}</div>
                            <div>End: ${meeting.endTime || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="meeting-actions">
                        <button class="save-btn" data-meeting-id="${meeting.id}">Download</button>
                        <button class="delete-btn" data-meeting-id="${meeting.id}">×</button>
                    </div>
                </div>
            `).join('');

            // Add click handlers for save buttons
            meetingList.querySelectorAll('.save-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const meetingId = this.dataset.meetingId;
                    const meeting = savedMeetings.find(m => m.id === Number(meetingId));
                    
                    console.log('📥 Downloading saved meeting:', meetingId);
                    
                    if (meeting) {
                        // Check if there are any transcripts to save
                        if (!meeting.transcripts || meeting.transcripts.length === 0) {
                            alert('This meeting has no saved captions to download.');
                            console.warn('⚠️ Attempted to download a meeting with no transcripts.');
                            return;
                        }

                        console.log('🚀 Sending download message for saved meeting to service worker...');
                        
                        const messageToSend = {
                            message: "download_captions",
                            transcriptArray: meeting.transcripts,
                            meetingTitle: meeting.title,
                            meetingDate: meeting.date,
                            meetingDetails: meeting.details
                        };
                        
                        console.log('📦 Saved meeting message:', messageToSend);
                        
                        chrome.runtime.sendMessage(messageToSend, function(response) {
                            if (chrome.runtime.lastError) {
                                console.error('❌ Error downloading saved meeting:', chrome.runtime.lastError);
                            } else {
                                console.log('✅ Saved meeting download message sent successfully');
                                console.log('📥 Response:', response);
                            }
                        });
                    } else {
                        console.error('❌ Meeting not found:', meetingId);
                    }
                });
            });

            // Add click handlers for delete buttons
            meetingList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const meetingId = this.dataset.meetingId;
                    console.log('🗑️ Deleting meeting:', meetingId);
                    
                    if (confirm('Are you sure you want to delete this meeting?')) {
                        chrome.storage.local.get(['savedMeetings'], function(result) {
                            const updatedMeetings = result.savedMeetings.filter(m => m.id !== Number(meetingId));
                            chrome.storage.local.set({ savedMeetings: updatedMeetings }, function() {
                                console.log('✅ Meeting deleted successfully');
                                displaySavedMeetings(); // Refresh the list
                            });
                        });
                    }
                });
            });
        });
    }

    // Display saved meetings when popup opens
    console.log('🔄 Initializing saved meetings display...');
    displaySavedMeetings();
});
