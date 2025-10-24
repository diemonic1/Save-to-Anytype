// Background script for Anytype Web Clipper (Firefox Compatible)

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

console.log('Background script loading... (Firefox compatible)');

// Create context menus on installation
browserAPI.runtime.onInstalled.addListener(function () {
    console.log('Save to Anytype installed');

    // Remove all existing context menus first
    browserAPI.contextMenus.removeAll(function () {
        console.log('Old context menus removed');

        // Create page context menu
        browserAPI.contextMenus.create({
            id: "save-to-anytype",
            title: "Save to Anytype",
            contexts: ["page", "link"]
        }, function () {
            if (browserAPI.runtime.lastError) {
                console.error('Error creating save-to-anytype menu:', browserAPI.runtime.lastError.message);
            } else {
                console.log('✓ Context menu "save-to-anytype" created');
            }
        });

        // Create selection context menu
        browserAPI.contextMenus.create({
            id: "save-selection-to-anytype",
            title: "Save the Selected Text to Anytype",
            contexts: ["selection"]
        }, function () {
            if (browserAPI.runtime.lastError) {
                console.error('Error creating save-selection menu:', browserAPI.runtime.lastError.message);
            } else {
                console.log('✓ Context menu "save-selection-to-anytype" created');
            }
        });
    });
});

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener(async function (info, tab) {
    console.log('Context menu clicked:', info.menuItemId);

    if (info.menuItemId === "save-to-anytype") {
        // Normal page save
        console.log('Opening popup for page save');
        await handleContextMenuClick(tab, null);
    }
    else if (info.menuItemId === "save-selection-to-anytype") {
        // Save selected text
        console.log('Saving selected text');
        await handleContextMenuClick(tab, info.selectionText);
    }
});

// Firefox'ta openPopup() çalışmadığı için alternatif çözüm
async function handleContextMenuClick(tab, selectionText) {
    try {
        if (selectionText) {
            await browserAPI.storage.local.set({
                selectedText: selectionText,
                selectedTextTimestamp: Date.now()
            });
            console.log('Selected text saved to storage');
        }

        try {
            await browserAPI.action.openPopup();
            console.log('Popup opened successfully');
        } catch (error) {
            console.log('openPopup not supported, showing notification');

            // Alternatif: Badge göster
            browserAPI.action.setBadgeText({ text: "!" });
            browserAPI.action.setBadgeBackgroundColor({ color: "#667eea" });

            // Alternatif: Notification göster (opsiyonel - izin gerektirir)
            // browserAPI.notifications.create({
            //     type: "basic",
            //     iconUrl: "icon48.png",
            //     title: "Anytype Web Clipper",
            //     message: "Kaydetmek için eklenti ikonuna tıklayın"
            // });

            console.log('Badge set - user needs to click extension icon');
        }
    } catch (error) {
        console.error('Error handling context menu click:', error);
    }
}

// Message handling for communication between popup and content scripts
browserAPI.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log('Message received:', request.action);

    if (request.action === "getTabInfo") {
        browserAPI.tabs.query({ active: true, currentWindow: true }, function (tabs) {
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

    // Clear badge when popup opens
    if (request.action === "popupOpened") {
        browserAPI.action.setBadgeText({ text: "" });
        sendResponse({ success: true });
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

// Clear badge on startup
browserAPI.runtime.onStartup.addListener(function () {
    browserAPI.action.setBadgeText({ text: "" });
});

console.log('Background script loaded successfully (Firefox compatible)');
