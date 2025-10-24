// Anytype API Base URL
const API_BASE_URL = 'http://localhost:31009/v1';
const API_VERSION = '2025-05-20';

// State
let state = {
    apiKey: null,
    challengeId: null,
    spaces: [],
    selectedSpaceId: null,
    selectedCollectionId: null,
    collections: [],
    currentTab: null
};

// DOM Elements
const elements = {
    status: document.getElementById('status'),
    authSection: document.getElementById('authSection'),
    mainSection: document.getElementById('mainSection'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    spaceSelect: document.getElementById('spaceSelect'),
    collectionSection: document.getElementById('collectionSection'),
    collectionsList: document.getElementById('collectionsList'),
    pageTitle: document.getElementById('pageTitle'),
    pageUrl: document.getElementById('pageUrl'),
    pageDescription: document.getElementById('pageDescription'),
    saveBtn: document.getElementById('saveBtn'),
    saveBtnText: document.getElementById('saveBtnText'),
    appNameInput: document.getElementById('appNameInput'),
    startChallengeBtn: document.getElementById('startChallengeBtn'),
    codeSection: document.getElementById('codeSection'),
    codeInput: document.getElementById('codeInput'),
    verifyCodeBtn: document.getElementById('verifyCodeBtn')
};

// Tab management
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();

    if (state.apiKey) {
        showMainSection();
        await loadSpaces();
    }

    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        elements.pageTitle.value = tab.title || '';
        elements.pageUrl.value = tab.url || '';
    }

    // Check for selected text from context menu
    await loadSelectedText();
});

// Load selected text from storage
async function loadSelectedText() {
    try {
        const result = await chrome.storage.local.get(['selectedText', 'selectedTextTimestamp']);

        if (result.selectedText) {
            // Check if the selection is recent (within last 5 seconds)
            const now = Date.now();
            const timestamp = result.selectedTextTimestamp || 0;

            if (now - timestamp < 5000) {
                // Format the selected text as markdown quote
                const formattedText = result.selectedText
                    .split('\n')
                    .map(line => `> ${line}`)
                    .join('\n');

                elements.pageDescription.value = formattedText;

                // Clear the stored text
                await chrome.storage.local.remove(['selectedText', 'selectedTextTimestamp']);

                // Show a brief notification
                showStatus('Selected text has been added', 'success');
            }
        }
    } catch (error) {
        console.error('Selected text could not be loaded:', error);
    }
}

// Load saved state
async function loadState() {
    const saved = await chrome.storage.local.get(['apiKey', 'selectedSpaceId']);
    if (saved.apiKey) {
        state.apiKey = saved.apiKey;
    }
    if (saved.selectedSpaceId) {
        state.selectedSpaceId = saved.selectedSpaceId;
    }
}

// Save state
async function saveState() {
    await chrome.storage.local.set({
        apiKey: state.apiKey,
        selectedSpaceId: state.selectedSpaceId
    });
}

// Show status message
function showStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    elements.status.classList.remove('hidden');

    if (type !== 'error') {
        setTimeout(() => {
            elements.status.classList.add('hidden');
        }, 3000);
    }
}

// API Key Connection
elements.connectBtn.addEventListener('click', async () => {
    const apiKey = elements.apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus('Please enter your API Key', 'error');
        return;
    }

    elements.connectBtn.innerHTML = '<span class="loading"></span> Connecting...';
    elements.connectBtn.disabled = true;

    try {
        // Test the API key
        const response = await fetch(`${API_BASE_URL}/spaces`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('Initial API test response:', responseData);

            // Check if we got valid data
            if (responseData && (responseData.data || Array.isArray(responseData))) {
                state.apiKey = apiKey;
                await saveState();
                showStatus('Successfully connected!', 'success');
                showMainSection();
                await loadSpaces();
            } else {
                showStatus('API response is in an unexpected format', 'error');
            }
        } else {
            const errorText = await response.text();
            console.error('API Key test failed:', response.status, errorText);
            showStatus(`Invalid API Key or connection error: ${response.status}`, 'error');
        }
    } catch (error) {
        console.error('Connection error:', error);
        showStatus('Connection errorı: ' + error.message, 'error');
    } finally {
        elements.connectBtn.innerHTML = 'Connect';
        elements.connectBtn.disabled = false;
    }
});

// Challenge Authentication
elements.startChallengeBtn.addEventListener('click', async () => {
    const appName = elements.appNameInput.value.trim() || 'Web Clipper';

    elements.startChallengeBtn.innerHTML = '<span class="loading"></span> Challenge is starting...';
    elements.startChallengeBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/challenges`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Anytype-Version': API_VERSION
            },
            body: JSON.stringify({ app_name: appName })
        });

        if (response.ok) {
            const data = await response.json();
            state.challengeId = data.challenge_id;
            elements.codeSection.classList.remove('hidden');
            showStatus('Enter the 4-digit code displayed in the Anytype app', 'info');
            elements.codeInput.focus();
        } else {
            showStatus('Challenge could not be started', 'error');
        }
    } catch (error) {
        showStatus('Connection error: ' + error.message, 'error');
    } finally {
        elements.startChallengeBtn.innerHTML = 'Start Challenge';
        elements.startChallengeBtn.disabled = false;
    }
});

// Verify Challenge Code
elements.verifyCodeBtn.addEventListener('click', async () => {
    const code = elements.codeInput.value.trim();

    if (!code || code.length !== 4) {
        showStatus('Please enter the 4-digit code', 'error');
        return;
    }

    elements.verifyCodeBtn.innerHTML = '<span class="loading"></span> Verifying...';
    elements.verifyCodeBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/api_keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Anytype-Version': API_VERSION
            },
            body: JSON.stringify({
                challenge_id: state.challengeId,
                code: code
            })
        });

        if (response.ok) {
            const data = await response.json();
            state.apiKey = data.api_key;
            await saveState();
            showStatus('Successfully verified!', 'success');
            showMainSection();
            await loadSpaces();
        } else {
            showStatus('Code could not be verified', 'error');
        }
    } catch (error) {
        showStatus('Connection error: ' + error.message, 'error');
    } finally {
        elements.verifyCodeBtn.innerHTML = 'Doğrula';
        elements.verifyCodeBtn.disabled = false;
    }
});

// Disconnect
elements.disconnectBtn.addEventListener('click', async () => {
    state.apiKey = null;
    state.selectedSpaceId = null;
    state.selectedCollectionId = null;
    await chrome.storage.local.remove(['apiKey', 'selectedSpaceId']);

    elements.authSection.classList.remove('hidden');
    elements.mainSection.classList.add('hidden');
    elements.apiKeyInput.value = '';
    elements.codeInput.value = '';
    elements.codeSection.classList.add('hidden');

    showStatus('Connection lost', 'info');
});

// Show main section
function showMainSection() {
    elements.authSection.classList.add('hidden');
    elements.mainSection.classList.remove('hidden');
}

// Load spaces
async function loadSpaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/spaces`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('Spaces API response:', responseData);

            let spaces = responseData.data || responseData.spaces || responseData.items || [];

            if (Array.isArray(responseData)) {
                spaces = responseData;
            }

            if (!Array.isArray(spaces)) {
                console.error('Unexpected spaces format:', responseData);
                showStatus('Space list in unexpected format', 'error');
                return;
            }

            state.spaces = spaces;

            elements.spaceSelect.innerHTML = '<option value="">Select Space</option>';

            if (spaces.length === 0) {
                showStatus('No space found. Create space in Anytype.', 'error');
                return;
            }

            spaces.forEach(space => {
                const option = document.createElement('option');
                option.value = space.id;
                option.textContent = space.name || space.title || space.id || 'Untitled Space';
                if (space.id === state.selectedSpaceId) {
                    option.selected = true;
                }
                elements.spaceSelect.appendChild(option);
            });

            if (state.selectedSpaceId) {
                await loadCollections(state.selectedSpaceId);
            }
        } else {
            const errorText = await response.text();
            console.error('Space load error:', response.status, errorText);
            showStatus(`Space list couldn\'t be loaded: ${response.status}`, 'error');
        }
    } catch (error) {
        console.error('Space load exception:', error);
        showStatus('Space list couldn\'t be loaded: ' + error.message, 'error');
    }
}

// Space selection change
elements.spaceSelect.addEventListener('change', async (e) => {
    const spaceId = e.target.value;

    if (spaceId) {
        state.selectedSpaceId = spaceId;
        await saveState();
        await loadCollections(spaceId);
    } else {
        state.selectedSpaceId = null;
        state.selectedCollectionId = null;
        elements.collectionSection.classList.add('hidden');
    }
});

// Load collections for a space
async function loadCollections(spaceId) {
    try {
        let collections = [];

        // Primary method: Try lists endpoint
        try {
            const response = await fetch(`${API_BASE_URL}/spaces/${spaceId}/lists`, {
                headers: {
                    'Authorization': `Bearer ${state.apiKey}`,
                    'Anytype-Version': API_VERSION
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Lists endpoint response:', data);
                collections = data.data || data.lists || (Array.isArray(data) ? data : []);

                if (collections.length > 0) {
                    console.log('Found lists/sets:', collections.map(c => ({ id: c.id, name: c.name })));
                }
            }
        } catch (e) {
            console.log('Lists endpoint error:', e);
        }

        // If no lists found, try getting all objects and filter for sets
        if (collections.length === 0) {
            try {
                const response = await fetch(`${API_BASE_URL}/spaces/${spaceId}/objects`, {
                    headers: {
                        'Authorization': `Bearer ${state.apiKey}`,
                        'Anytype-Version': API_VERSION
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const objects = data.data || data.objects || (Array.isArray(data) ? data : []);

                    const uniqueTypes = [...new Set(objects.map(o => o.type || o.type_key || 'unknown'))];
                    console.log('Unique object types in space:', uniqueTypes);

                    collections = objects.filter(obj => {
                        const isSet =
                            obj.type === 'set' ||
                            obj.type === 'collection' ||
                            obj.type_key === 'set' ||
                            obj.type_key === 'collection' ||
                            obj.layout === 'set' ||
                            obj.layout === 'collection' ||
                            obj.layout === 'gallery' ||
                            obj.layout === 'grid' ||
                            obj.layout === 'list' ||
                            obj.layout === 'kanban' ||
                            (obj.view && obj.view.type) ||
                            (obj.name && obj.name.toLowerCase().includes('set'));

                        if (isSet) {
                            console.log('Identified as collection:', obj.name, {
                                id: obj.id,
                                type: obj.type,
                                type_key: obj.type_key,
                                layout: obj.layout
                            });
                        }

                        return isSet;
                    });
                }
            } catch (e) {
                console.log('Objects endpoint error:', e);
            }
        }

        state.collections = collections;

        elements.collectionsList.innerHTML = '';

        if (!collections || collections.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="collection-item" style="font-size: 12px; color: #666;">
                    Collection not found<br>
                    <small style="color: #999;">You can also save directly to Space</small>
                </div>`;
        } else {
            console.log('Displaying collections:', collections.length);
            collections.forEach(collection => {
                const item = document.createElement('div');
                item.className = 'collection-item';
                item.textContent = collection.name || collection.title || collection.id || 'Untitled Set';
                item.dataset.id = collection.id;

                item.addEventListener('click', () => {
                    document.querySelectorAll('.collection-item').forEach(i => {
                        i.classList.remove('selected');
                    });

                    if (state.selectedCollectionId === collection.id) {
                        state.selectedCollectionId = null;
                        console.log('Collection deselected');
                    } else {
                        item.classList.add('selected');
                        state.selectedCollectionId = collection.id;
                        console.log('Collection selected:', collection.id, collection.name);
                    }
                });

                elements.collectionsList.appendChild(item);
            });
        }

        elements.collectionSection.classList.remove('hidden');
    } catch (error) {
        console.log('Collections could not be loaded:', error);
        elements.collectionSection.classList.remove('hidden');
        elements.collectionsList.innerHTML = `
            <div class="collection-item" style="font-size: 12px; color: #666;">
                Collections couldn't be loaded<br>
                <small style="color: #999;">You can also save directly to Space</small>
            </div>`;
    }
}

// Save to Anytype
elements.saveBtn.addEventListener('click', async () => {
    const title = elements.pageTitle.value.trim();
    const url = elements.pageUrl.value.trim();
    const description = elements.pageDescription.value.trim();

    if (!title || !url) {
        showStatus('Title and URL are required', 'error');
        return;
    }

    if (!state.selectedSpaceId) {
        showStatus('Please select a Space', 'error');
        return;
    }

    elements.saveBtnText.innerHTML = '<span class="loading"></span> Saving...';
    elements.saveBtn.disabled = true;

    try {
        // Create object in Anytype
        const objectData = {
            name: title,
            icon: {
                emoji: "🔗",
                format: "emoji"
            },
            body: `# ${title}\n\n**URL:** [${url}](${url})\n\n${description ? `**Description:**\n\n${description}` : ''}`,
            type_key: "page"
        };

        console.log('Sending object data:', objectData);

        const response = await fetch(`${API_BASE_URL}/spaces/${state.selectedSpaceId}/objects`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json',
                'Anytype-Version': API_VERSION
            },
            body: JSON.stringify(objectData)
        });

        const responseText = await response.text();
        console.log('Create object response:', response.status, responseText);

        if (response.ok) {
            let createdObjectId = null;
            try {
                const data = JSON.parse(responseText);
                createdObjectId = data?.object?.id || null;
            } catch (e) {
                console.log('Response is not JSON:', responseText);
            }

            console.log('Object created:', createdObjectId);

            // If a collection is selected, try to add the object to it
            if (state.selectedCollectionId && createdObjectId) {
                try {
                    console.log('Adding to collection:', state.selectedCollectionId, 'Object ID:', createdObjectId);

                    const collectionResponse = await fetch(
                        `${API_BASE_URL}/spaces/${state.selectedSpaceId}/lists/${state.selectedCollectionId}/objects`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${state.apiKey}`,
                                'Content-Type': 'application/json',
                                'Anytype-Version': API_VERSION
                            },
                            body: JSON.stringify({ objects: [createdObjectId] })
                        }
                    );

                    const collectionResponseText = await collectionResponse.text();
                    console.log('Add to collection response:', collectionResponse.status, collectionResponseText);

                    if (!collectionResponse.ok) {
                        console.log('Could not add to collection. Status:', collectionResponse.status, 'Response:', collectionResponseText);
                    } else {
                        console.log('Successfully added to collection');
                    }
                } catch (error) {
                    console.log('Could not add to collection:', error);
                }
            }

            showStatus('Saved!', 'success');

            // Clear form
            elements.pageDescription.value = '';

            // Get next tab info
            setTimeout(async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    elements.pageTitle.value = tab.title || '';
                    elements.pageUrl.value = tab.url || '';
                }
            }, 1000);
        } else {
            let errorMessage = 'Save error';
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.message || errorData.error || responseText;
            } catch (e) {
                errorMessage = responseText;
            }

            showStatus(`Save error: ${errorMessage}`, 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showStatus('Connection error: ' + error.message, 'error');
    } finally {
        elements.saveBtnText.innerHTML = 'Save';
        elements.saveBtn.disabled = false;
    }
});