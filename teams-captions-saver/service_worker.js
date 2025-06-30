// Service worker is a script that your browser runs in the background, separate from a web page, opening the door to features that don't need a web page 
// or user interaction.
// Service worker script will be forcefully terminated after about 30 seconds of inactivity, and restarted when it's next needed.
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/66618269#66618269

// This code is not used. But without it, the extension does not work
let isTranscribing = false;
let transcriptArray = [];

console.log('🔧 Service worker loaded/reloaded at:', new Date().toISOString());

// full name
// function jsonToYaml(json) {
//     return json.map(entry => {
//         return `[${entry.Time}] ${entry.Name}: ${entry.Text}`;
//     }).join('\n');
// }

// first name only
function jsonToYaml(json) {
    return json.map(entry => {
        let name = entry.Name;

        if (name.includes('-')) {
            // If the name contains a hyphen, output the whole name
            name = name.trim();
        } else {
            // Remove any text within parentheses (e.g., '(External)')
            name = name.replace(/\(.*?\)/g, '').trim();

            // Check if the name is "Adam Dudley"
            if (name.toLowerCase() === "adam dudley") {
                name = "Adam Dudley";
            } else {
                // Split the name by whitespace
                const nameParts = name.split(/\s+/);
                
                if (nameParts.length > 1) {
                    // If there's more than one part, get the first name and initial of the last name
                    const firstName = nameParts[0];
                    const lastNameInitial = nameParts[1].charAt(0);
                    name = `${firstName} ${lastNameInitial}.`;
                } else {
                    // If only one part, use the name as is
                    name = nameParts[0];
                }
            }
        }

        return `[${entry.Time}] ${name}: ${entry.Text}`;
    }).join('\n');
}

// First name and initial of last name
// function jsonToYaml(json) {
//     return json.map(entry => {
//         let name = entry.Name;

//         if (name.includes('-')) {
//             // If the name contains a hyphen, output the whole name
//             name = name.trim();
//         } else {
//             // Remove any text within parentheses (e.g., '(External)')
//             name = name.replace(/\(.*?\)/g, '').trim();

//             // Split the name by whitespace
//             const nameParts = name.split(/\s+/);

//             if (nameParts.length > 1) {
//                 // If there's more than one part, get the first name and initial of the last name
//                 const firstName = nameParts[0];
//                 const lastNameInitial = nameParts[1].charAt(0);
//                 name = `${firstName} ${lastNameInitial}`;
//             } else {
//                 // If only one part, use the name as is
//                 name = nameParts[0];
//             }
//         }

//         return `[${entry.Time}] ${name}: ${entry.Text}`;
//     }).join('\n');
// }



function saveTranscripts(meetingTitle, transcriptArray, meetingDate) {
    console.log('🚀 Starting saveTranscripts...');
    console.log('📝 Meeting title received:', meetingTitle);
    console.log('📊 Transcript array received:', transcriptArray);
    console.log('📊 Transcript array length:', transcriptArray ? transcriptArray.length : 'undefined/null');
    console.log('📅 Meeting date received:', meetingDate);
    
    // Check if transcriptArray is empty or invalid
    if (!transcriptArray || transcriptArray.length === 0) {
        console.error('❌ ERROR: Transcript array is empty or null!');
        console.log('📊 Transcript array details:', {
            isArray: Array.isArray(transcriptArray),
            length: transcriptArray ? transcriptArray.length : 'N/A',
            content: transcriptArray
        });
        return;
    }
    
    // Sanitize the filename by removing invalid characters
    const sanitizedTitle = (meetingTitle || 'Meeting').replace(/[^a-z0-9]/gi, '_');
    console.log('🧹 Sanitized meeting title:', sanitizedTitle);

    const sanitizedDate = (meetingDate || new Date().toLocaleDateString()).replace(/\//g, '-');
    console.log('🧹 Sanitized meeting date:', sanitizedDate);

    const fileName = `${sanitizedTitle}_${sanitizedDate}.txt`;
    console.log('📁 Generated file name:', fileName);

    const yaml = `Meeting Date: ${meetingDate}\n\n` + jsonToYaml(transcriptArray);
    console.log('📄 YAML content prepared. Length:', yaml.length);
    console.log('📄 First 200 characters of YAML:', yaml.substring(0, 200));

    // Create a Blob from the YAML content
    const blob = new Blob([yaml], { type: 'text/plain' });
    console.log('💾 Blob created. Size:', blob.size);

    // Use a FileReader to read the Blob as a data URL
    const reader = new FileReader();
    reader.onload = function (event) {
        const dataUrl = event.target.result; // Base64-encoded data URL
        console.log('🔗 Data URL generated. Length:', dataUrl.length);

        chrome.downloads.download({
            url: dataUrl,
            filename: fileName,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Download failed:', chrome.runtime.lastError);
            } else {
                console.log('✅ Download started with ID:', downloadId);
            }
        });
        console.log('🏁 saveTranscripts complete.');
    };

    reader.onerror = function (event) {
        console.error('❌ Failed to read Blob:', event.target.error);
    };

    reader.readAsDataURL(blob); // Read the Blob as a data URL
}



chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('📨 Service worker received message:', message);
    console.log('📨 Message type:', message.message);
    console.log('📨 Sender info:', sender);
    
    switch (message.message) {
        case 'download_captions':
            console.log('⬇️ download_captions triggered!');
            console.log('📊 Message data:', {
                meetingTitle: message.meetingTitle,
                transcriptArrayLength: message.transcriptArray ? message.transcriptArray.length : 'undefined/null',
                meetingDate: message.meetingDate
            });
            saveTranscripts(
                message.meetingTitle, 
                message.transcriptArray, 
                message.meetingDate
            );
            break;
            
        case 'save_captions':
            console.log('💾 save_captions triggered!');
            console.log('🔍 Querying for active tab...');
            
            try {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    lastFocusedWindow: true
                });
                console.log("📋 Tabs query result:", tab);
                console.log("📋 Tab ID:", tab ? tab.id : 'No tab found');
                console.log("📋 Tab URL:", tab ? tab.url : 'No tab found');

                if (tab) {
                    console.log('📤 Sending return_transcript message to content script...');
                    chrome.tabs.sendMessage(tab.id, {
                        message: "return_transcript"
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('❌ Error sending message to content script:', chrome.runtime.lastError);
                        } else {
                            console.log('✅ Message sent to content script successfully');
                            console.log('📥 Response from content script:', response);
                        }
                    });
                } else {
                    console.error('❌ No active tab found!');
                }
            } catch (error) {
                console.error('❌ Error in save_captions case:', error);
            }
            break;
            
        default:
            console.log('⚠️ Unknown message type:', message.message);
            break;
    }
    
    console.log('📨 Message processing complete for:', message.message);
});
