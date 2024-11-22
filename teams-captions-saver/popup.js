// popup.js
document.addEventListener('DOMContentLoaded', function () {
    console.log('popup.js loaded!');

    const saveButton = document.getElementById('saveButton');
    const meetingList = document.getElementById('savedMeetings');

    if (!saveButton || !meetingList) {
        console.error('Required elements not found in popup.html');
        return;
    }

    // Save Current Captions Button - Direct download without storage
    saveButton.addEventListener('click', function () {
        console.log('save_captions clicked!');
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "return_transcript"
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                        alert('Error retrieving captions. Make sure you are in a Teams meeting with captions enabled.');
                        return;
                    }
                    if (response && response.transcriptArray && response.transcriptArray.length > 0) {
                        // Send message to service worker to download the captions
                        chrome.runtime.sendMessage({
                            message: 'download_captions',
                            transcriptArray: response.transcriptArray,
                            meetingTitle: response.meetingTitle,
                            meetingDate: response.meetingDate
                        });
                    } else {
                        alert(response?.error || 'No captions found. Make sure captions are enabled in the Teams meeting.');
                    }
                });
            }
        });
    });

    // Add new "Save to Storage" button
    const saveToStorageButton = document.createElement('button');
    saveToStorageButton.textContent = 'Save to Storage';
    saveToStorageButton.style.backgroundColor = '#6c757d';
    
    saveToStorageButton.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs || !tabs[0]) {
                alert('Please make sure you are in a Teams meeting tab.');
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, {
                message: "store_current_captions"
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    alert('Please make sure you are in a Teams meeting with captions enabled.');
                    return;
                }

                if (response && response.success) {
                    displaySavedMeetings();
                    alert('Captions saved successfully!');
                } else {
                    alert(response?.error || 'Failed to save captions. Please make sure captions are enabled in Teams.');
                }
            });
        });
    });

    // Insert the new button after the existing save button
    saveButton.parentNode.insertBefore(saveToStorageButton, saveButton.nextSibling);

    // Function to display saved meetings
    function displaySavedMeetings() {
        chrome.storage.local.get(['savedMeetings'], function(result) {
            const savedMeetings = result.savedMeetings || [];
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
                    
                    if (meeting) {
                        chrome.runtime.sendMessage({
                            message: "download_captions",
                            transcriptArray: meeting.transcripts,
                            meetingTitle: meeting.title,
                            meetingDate: meeting.date,
                            meetingDetails: meeting.details
                        });
                    }
                });
            });

            // Add click handlers for delete buttons
            meetingList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const meetingId = this.dataset.meetingId;
                    if (confirm('Are you sure you want to delete this meeting?')) {
                        chrome.storage.local.get(['savedMeetings'], function(result) {
                            const updatedMeetings = result.savedMeetings.filter(m => m.id !== Number(meetingId));
                            chrome.storage.local.set({ savedMeetings: updatedMeetings }, function() {
                                displaySavedMeetings(); // Refresh the list
                            });
                        });
                    }
                });
            });
        });
    }

    // Display saved meetings when popup opens
    displaySavedMeetings();
});
