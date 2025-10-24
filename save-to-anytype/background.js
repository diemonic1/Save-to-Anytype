// Background service worker for Anytype Web Clipper

console.log('Background script loading...');

// Utility function to get the appropriate browser API
function getAPI() {
    if (typeof chrome !== 'undefined' && chrome.contextMenus) {
        return chrome;
    }
    if (typeof browser !== 'undefined' && browser.contextMenus) {
        return browser;
    }
    console.error('No browser API available!');
    return null;
}

// Create context menus on installation
chrome.runtime.onInstalled.addListener(function () {
    console.log('Save to Anytype installed');

    const api = getAPI();
    if (!api) {
        console.error('Browser API not available, cannot create context menus');
        return;
    }

    // Remove all existing context menus first
    api.contextMenus.removeAll(function () {
        console.log('Old context menus removed');

        // Create page context menu
        api.contextMenus.create({
            id: "save-to-anytype",
            title: "Save to Anytype",
            contexts: ["page", "link"]
        }, function () {
            if (chrome.runtime.lastError) {
                console.error('Error creating save-to-anytype menu:', chrome.runtime.lastError.message);
            } else {
                console.log('✓ Context menu "save-to-anytype" created');
            }
        });

        // Create selection context menu
        chrome.contextMenus.create({
            id: "save-selection-to-anytype",
            title: "Save the Selected Text to Anytype",
            contexts: ["selection"]
        }, function () {
            if (chrome.runtime.lastError) {
                console.error('Error creating save-selection menu:', chrome.runtime.lastError.message);
            } else {
                console.log('✓ Context menu "save-selection-to-anytype" created');
            }
        });
    });
});

// Handle context menu clicks
if (chrome && chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(async function (info, tab) {
        console.log('Context menu clicked:', info.menuItemId);

        if (info.menuItemId === "save-to-anytype") {
            // Normal page save - just open popup
            console.log('Opening popup for page save');
            try {
                await chrome.action.openPopup();
            } catch (error) {
                console.error('Could not open popup:', error);
            }
        }
        else if (info.menuItemId === "save-selection-to-anytype") {
            // Save selected text
            console.log('Saving selected text');
            try {
                // Get selected text from content script
                const response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
                console.log('Selected text response:', response);

                if (response && response.selectedText) {
                    // Save selected text to storage
                    await chrome.storage.local.set({
                        selectedText: response.selectedText,
                        selectedTextTimestamp: Date.now()
                    });
                    console.log('Selected text saved to storage');
                }

                // Open popup
                await chrome.action.openPopup();
            } catch (error) {
                console.error('Error handling selection:', error);
                // Still try to open popup
                try {
                    await chrome.action.openPopup();
                } catch (popupError) {
                    console.error('Could not open popup:', popupError);
                }
            }
        }
    });
} else {
    console.error('contextMenus API not available');
}

// Message handling for communication between popup and content scripts
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log('Message received:', request.action);

    if (request.action === "getTabInfo") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                console.log('Sending tab info:', tabs[0].title);
                sendResponse({
                    title: tabs[0].title,
                    url: tabs[0].url
                });
            }
        });
        return true; // Keep the message channel open for async response
    }

    if (request.action === "saveToAnytype") {
        console.log('Saving to Anytype...');
        handleSaveToAnytype(request.data)
            .then(function (response) {
                console.log('Save successful');
                sendResponse({ success: true, data: response });
            })
            .catch(function (error) {
                console.error('Save failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

// Helper function to save to Anytype
async function handleSaveToAnytype(data) {
    console.log('handleSaveToAnytype called with:', data);

    const apiKey = data.apiKey;
    const spaceId = data.spaceId;
    const collectionId = data.collectionId;
    const title = data.title;
    const url = data.url;
    const description = data.description;

    const API_BASE_URL = 'http://localhost:31009/v1';
    const API_VERSION = '2025-05-20';

    // Create object in Anytype
    const objectData = {
        name: title,
        icon: {
            emoji: "🔗",
            format: "emoji"
        },
        body: '# ' + title + '\n\n[' + url + '](' + url + ')\n\n' + (description || ''),
        type_key: "page"
    };

    console.log('Creating object with data:', objectData);

    const response = await fetch(API_BASE_URL + '/spaces/' + spaceId + '/objects', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'Anytype-Version': API_VERSION
        },
        body: JSON.stringify(objectData)
    });

    if (!response.ok) {
        throw new Error('Failed to create object in Anytype');
    }

    const responseData = await response.json();
    const createdObject = responseData.object;

    console.log('Object created:', createdObject);

    // If a collection is selected, add the object to it
    if (collectionId && createdObject && createdObject.id) {
        try {
            console.log('Adding to collection:', collectionId);

            await fetch(API_BASE_URL + '/spaces/' + spaceId + '/lists/' + collectionId + '/objects', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json',
                    'Anytype-Version': API_VERSION
                },
                body: JSON.stringify({ objects: [createdObject.id] })
            });

            console.log('Added to collection successfully');
        } catch (error) {
            console.log('Could not add to collection:', error);
        }
    }

    return createdObject;
}

// Keep service worker alive
chrome.alarms.create('keep-alive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'keep-alive') {
        console.log('Service worker keep-alive ping');
    }
});

console.log('Background script loaded successfully');