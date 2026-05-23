let consoleLog = function (messageText, ...argsL) {
    if (argsL !== undefined && argsL.length > 0)
        console.log("[SaveToAnytype] %c[Back]%c " + messageText + " %c[Params]%c", "color: green; font-weight: bold;", "", "color: blue; font-weight: bold;", "", argsL);
    else
        console.log("[SaveToAnytype] %c[Back]%c " + messageText, "color: green; font-weight: bold;", "");
}

let consoleError = function (messageText, ...argsL) {
    if (argsL !== undefined && argsL.length > 0)
        console.error("[SaveToAnytype] %c[Back]%c " + messageText + " %c[Params]%c", "color: green; font-weight: bold;", "", "color: blue; font-weight: bold;", "", argsL);
    else
        console.error("[SaveToAnytype] %c[Back]%c " + messageText, "color: green; font-weight: bold;", "");
}

consoleLog('Background script loading...');

//#region Work with page data

function findLargestVisibleImage() {
    const imgs = Array.from(document.querySelectorAll("img"));

    let largestImg = null;
    let largestArea = 0;

    imgs.forEach(img => {
        const rect = img.getBoundingClientRect();

        // Пропускаем скрытые элементы
        if (rect.width <= 0 || rect.height <= 0) return;
        if (!img.src) return;

        const style = window.getComputedStyle(img);
        if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            parseFloat(style.opacity) === 0
        ) return;

        // Пропускаем “пустые” изображения
        if (img.naturalWidth <= 1 || img.naturalHeight <= 1) return;

        // Проверяем, что хотя бы центр изображения видим и не перекрыт
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(cx, cy);

        if (!img.contains(topElement) && topElement !== img) return;

        // Площадь на экране
        const area = rect.width * rect.height;

        if (area > largestArea) {
            largestArea = area;
            largestImg = img;
        }
    });

    return largestImg?.src || null;
}

function findDescription() {
    // 1. meta description
    let el = document.querySelector('meta[name="description"]');
    if (el?.content?.trim()) return el.content.trim();

    // 2. og:description
    el = document.querySelector('meta[property="og:description"]');
    if (el?.content?.trim()) return el.content.trim();

    // 3. twitter:description
    el = document.querySelector('meta[name="twitter:description"]');
    if (el?.content?.trim()) return el.content.trim();

    // 4. first meaningful <p>
    const p = Array.from(document.querySelectorAll("p"))
        .map(p => p.innerText.trim())
        .find(text => text.length > 30 && text.length < 100);
    if (p) return p;

    // 5. title
    if (document.title?.trim()) return document.title.trim();

    // 6. fallback
    return '';
}

function extractPageText() {
    try {
        if (!document || !document.body) {
            throw new Error('Document body not found');
        }

        const getIframeContent = (iframe) => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc || !iframeDoc.body) return '';
                const iframeClone = iframeDoc.body.cloneNode(true);
                iframeClone.querySelectorAll('script, style, nav, footer, aside, .ads, .comments').forEach(el => el.remove());
                return `<div class="iframe-content">${iframeClone.innerHTML}</div>`;
            } catch (e) {
                return '';
            }
        };

        const bodyClone = document.body.cloneNode(true);

        const iframes = document.querySelectorAll('iframe');
        let iframeContents = [];
        iframes.forEach((iframe) => {
            const content = getIframeContent(iframe);
            if (content) iframeContents.push(content);
        });

        const unwanted = bodyClone.querySelectorAll(
            'script, style, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal, #save-to-anytype-overlay'
        );
        unwanted.forEach(el => el.remove());

        const mainSelectors = ['main', 'article', '.content', '.post', '.entry', '[role="main"]', '#content', '.main'];
        let mainContent = null;

        for (const selector of mainSelectors) {
            const found = bodyClone.querySelector(selector);
            if (found && found.innerHTML.trim().length > 100) {
                mainContent = found;
                break;
            }
        }

        let finalContent = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;

        if (iframeContents.length > 0) {
            finalContent += '<h2>Embedded Content</h2>' + iframeContents.join('<hr>');
        }

        return finalContent;

    } catch (error) {
        return "PAGE PARSE ERROR";
    }
}

async function uploadFile(uploadUrl, file, token, apiVersion) {

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
            'Accept': 'application/json',
            'Anytype-Version': apiVersion
        },
        body: formData
    });

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `File upload failed: status: ${response.status}, errorText: ${errorText}, uploadUrl: ${uploadUrl}`
        );
    }

    return await response.json();
}

async function uploadImageFromUrl(uploadUrl, imageUrl, token, apiVersion) {
    const response =
        await fetch(imageUrl);

    if (!response.ok) {
        throw new Error(
            "Failed to download image"
        );
    }

    const blob =
        await response.blob();

    const extension =
        blob.type.split("/")[1] || "png";

    const file = new File(
        [blob],
        `image.${extension}`,
        {
            type: blob.type
        }
    );

    return await uploadFile(
        uploadUrl,
        file,
        token,
        apiVersion
    );
}

async function uploadHtmlPage(uploadUrl, pageUrl, token, apiVersion) {
    const response =
        await fetch(pageUrl);

    if (!response.ok) {
        throw new Error(
            "Failed to download html page"
        );
    }

    const html =
        await response.text();

    const file = new File(
        [html],
        "page.html",
        {
            type: "text/html"
        }
    );

    return await uploadFile(
        uploadUrl,
        file,
        token,
        apiVersion
    );
}

async function uploadScreenshot(uploadUrl, token, apiVersion) {
    const dataUrl =
        await chrome.tabs.captureVisibleTab(
            null,
            {
                format: "png"
            }
        );

    const response =
        await fetch(dataUrl);

    const blob =
        await response.blob();

    const file = new File(
        [blob],
        "screenshot.png",
        {
            type: "image/png"
        }
    );

    return await uploadFile(
        uploadUrl,
        file,
        token,
        apiVersion
    );
}

//#endregion

// Utility function to get the appropriate browser API
function getAPI() {
    if (typeof chrome !== 'undefined' && chrome.contextMenus) {
        return chrome;
    }
    if (typeof browser !== 'undefined' && browser.contextMenus) {
        return browser;
    }
    consoleError('No browser API available!');
    return null;
}

// Create context menus on installation
function CreateContextMenusButtons(request) {
    consoleLog('CreateContextMenusButtons');

    const api = getAPI();
    if (!api) {
        consoleError('Browser API not available, cannot create context menus');
        return;
    }

    // Remove all existing context menus first
    api.contextMenus.removeAll(function () {
        consoleLog('Old context menus removed');
        consoleLog('request', request);

        // Create page context menu
        api.contextMenus.create({
            id: "save-to-Anytype",
            title: request.menuOption1,
            contexts: ["page", "link"]
        }, function () {
            if (chrome.runtime.lastError) {
                consoleError('Error creating save-to-Anytype menu:', chrome.runtime.lastError.message);
            } else {
                consoleLog('✓ Context menu "save-to-Anytype" created');
            }
        });

        // Create selection context menu
        chrome.contextMenus.create({
            id: "save-selection-to-Anytype",
            title: request.menuOption2,
            contexts: ["selection"]
        }, function () {
            if (chrome.runtime.lastError) {
                consoleError('Error creating save-selection menu:', chrome.runtime.lastError.message);
            } else {
                consoleLog('✓ Context menu "save-selection-to-Anytype" created');
            }
        });
    });
};

// Handle context menu clicks
if (chrome && chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(async function (info, tab) {
        consoleLog('Context menu clicked:', info.menuItemId);

        if (info.menuItemId === "save-to-Anytype") {
            // Normal page save - just open popup
            consoleLog('Opening popup for page save');
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "OPEN_OVERLAY" });
            } catch (error) {
                consoleError('Could not open popup:', error);
            }
        }
        else if (info.menuItemId === "save-selection-to-Anytype") {
            // Save selected text
            consoleLog('Saving selected text');
            try {
                // Get selected text from content scriptlet response = null;
                let response = null;
                try {
                    response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
                } catch (err) {
                    consoleError("sendMessage failed — probably no content script on this tab:", err);
                }

                if (response && response.selectedText) {
                    // Save selected text to storage
                    await chrome.storage.local.set({
                        selectedText: response.selectedText,
                        selectedTextTimestamp: Date.now()
                    });
                    consoleLog('Selected text saved to storage');
                }

                // Open popup
                await chrome.tabs.sendMessage(tab.id, { action: "OPEN_OVERLAY" });
            } catch (error) {
                consoleError('Error handling selection:', error);
                // Still try to open popup
                try {
                    await chrome.tabs.sendMessage(tab.id, { action: "OPEN_OVERLAY" });
                } catch (popupError) {
                    consoleError('Could not open popup:', popupError);
                }
            }
        }
    });
} else {
    consoleError('contextMenus API not available');
}

// Message handling for communication between popup and content scripts
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === "log") {
        if (request.args !== undefined && request.args.length > 0)
            console.log("[SaveToAnytype] %c[Popap]%c " + request.message + " %c[Params]%c", "color: yellow; font-weight: bold;", "", "color: blue; font-weight: bold;", "", request.args);
        else
            console.log("[SaveToAnytype] %c[Popap]%c " + request.message, "color: yellow; font-weight: bold;", "");
    }
    else if (request.type === "error") {
        if (request.args !== undefined && request.args.length > 0)
            console.error("[SaveToAnytype] %c[Popap]%c " + request.message + " %c[Params]%c", "color: yellow; font-weight: bold;", "", "color: blue; font-weight: bold;", "", request.args);
        else
            console.error("[SaveToAnytype] %c[Popap]%c " + request.message, "color: yellow; font-weight: bold;", "");
    }

    if (request.action === "getTabInfo") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                consoleLog('Sending tab info:', tabs[0].title);
                sendResponse({
                    title: tabs[0].title,
                    url: tabs[0].url
                });
            }
        });
        return true; // Keep the message channel open for async response
    }

    if (request.action === "CreateContextMenusButtons") {
        consoleLog('Saving to Anytype menu options ', request);
        CreateContextMenusButtons(request);
        return true;
    }

    if (request.action === "GET_TABS") {
        chrome.tabs.query(
            { active: true, currentWindow: true },
            (tabs) => {
                sendResponse(tabs);
            }
        );
        return true;
    }

    if (request.action === "executeScript_findLargestVisibleImage") {
        chrome.scripting.executeScript(
            {
                target: request.target,
                func: findLargestVisibleImage
            },
            (result) => {
                consoleLog(result);
                sendResponse(result);
            }
        );
        return true;
    }

    if (request.action === "executeScript_findDescription") {
        chrome.scripting.executeScript(
            {
                target: request.target,
                func: findDescription
            },
            (result) => {
                consoleLog(result);
                sendResponse(result);
            }
        );
        return true;
    }

    if (request.action === "executeScript_extractPageText") {
        chrome.scripting.executeScript(
            {
                target: request.target,
                func: extractPageText
            },
            (result) => {
                consoleLog(result);
                sendResponse(result);
            }
        );
        return true;
    }

    if (request.action === "executeScript_UploadImageFromUrl") {
        (async () => {
            const result =
                await uploadImageFromUrl(
                    request.uploadUrl,
                    request.imageUrl,
                    request.token,
                    request.apiVersion
                );

            sendResponse({
                success: true,
                data: result
            });

            return;
        })();
    }

    if (request.action === "executeScript_UploadHtmlFile") {
        (async () => {
            const result =
                await uploadHtmlPage(
                    request.uploadUrl,
                    request.pageUrl,
                    request.token,
                    request.apiVersion
                );

            sendResponse({
                success: true,
                data: result
            });

            return;
        })();
    }

    if (request.action === "executeScript_UploadScreenshot") {
        (async () => {
            const result =
                await uploadScreenshot(
                    request.uploadUrl,
                    request.token,
                    request.apiVersion
                );

            sendResponse({
                success: true,
                data: result
            });

            return;
        })();
    }
});

chrome.action.onClicked.addListener(async (tab) => {
    const url = tab.url;

    const Qr = [
        "chrome://",
        "chrome.google.com/webstore'",
        "https://www.homedepot.com",
        "edge://",
        "arc://",
        "view-source:",
        "devtools:",
        "chrome-extension://",
        "about:",
        "about:",
        "https://chromewebstore.google.com/"
    ];

    if (url == undefined || Qr.some((t) => url.startsWith(t)) || url == "") {
        await chrome.action.setPopup({
            popup: "popupBlocked.html",
            tabId: tab.id,
        });
        await chrome.action.openPopup();
    } else {
        chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_OVERLAY" });
    }
});

// Keep service worker alive
chrome.alarms.create('keep-alive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'keep-alive') {
        consoleLog('Service worker keep-alive ping');
    }
});

consoleLog('Background script loaded successfully');