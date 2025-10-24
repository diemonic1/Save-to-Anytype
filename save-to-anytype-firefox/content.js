// Content script for capturing selected text

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSelection") {
        const selectedText = window.getSelection().toString().trim();
        sendResponse({ selectedText: selectedText });
    }
    return true;
});
