// Service worker is a script that your browser runs in the background, separate from a web page, opening the door to features that don't need a web page 
// or user interaction.
// Service worker script will be forcefully terminated after about 30 seconds of inactivity, and restarted when it's next needed.
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/66618269#66618269

// This code is not used. But without it, the extension does not work
let isTranscribing = false;
let transcriptArray = [];

function jsonToYaml(json) {
    return json.map(entry => {
        return `Name: ${entry.Name}\nText: ${entry.Text}\nTime: ${entry.Time}\n----`;
    }).join('\n');
}

function saveTranscripts(meetingTitle, transcriptArray, meetingDate) {
    // Sanitize the filename by removing invalid characters
    const sanitizedTitle = (meetingTitle || 'Meeting').replace(/[^a-z0-9]/gi, '_');
    const sanitizedDate = (meetingDate || new Date().toLocaleDateString()).replace(/\//g, '-');
    const fileName = `${sanitizedTitle}_${sanitizedDate}.txt`;

    const yaml = `Meeting Date: ${meetingDate}\n\n` + jsonToYaml(transcriptArray);
    
    // Convert the content to a base64 string
    const bytes = new TextEncoder().encode(yaml);
    const base64 = btoa(String.fromCharCode(...bytes));
    const dataUrl = `data:text/plain;base64,${base64}`;

    chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: true
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError);
        } else {
            console.log('Download started with ID:', downloadId);
        }
    });
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('Service worker received message:', message);
    
    switch (message.message) {
        case 'download_captions':
            console.log('download_captions triggered!', message);
            saveTranscripts(
                message.meetingTitle, 
                message.transcriptArray, 
                message.meetingDate
            );
            break;
            
        case 'save_captions':
            console.log('save_captions triggered!');
            const [tab] = await chrome.tabs.query({
                active: true,
                lastFocusedWindow: true
            });
            console.log("Tabs query result:", tab);

            if (tab) {
                chrome.tabs.sendMessage(tab.id, {
                    message: "return_transcript"
                });
            }
            break;
            
        default:
            break;
    }
});
