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
    types: [],
    selectedTypeKey: 'page',
    currentTab: null,
    // Properties state
    tagPropertyId: null,
    availableTags: [],
    selectedTagIds: []
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
    typeSelect: document.getElementById('typeSelect'),
    saveBtn: document.getElementById('saveBtn'),
    saveBtnText: document.getElementById('saveBtnText'),
    appNameInput: document.getElementById('appNameInput'),
    startChallengeBtn: document.getElementById('startChallengeBtn'),
    codeSection: document.getElementById('codeSection'),
    codeInput: document.getElementById('codeInput'),
    verifyCodeBtn: document.getElementById('verifyCodeBtn'),
    tagsContainer: document.getElementById('tagsContainer'),
    tagsDropdown: document.getElementById('tagsDropdown'),
    tagsDropdownList: document.getElementById('tagsDropdownList'),
    tagSearchInput: document.getElementById('tagSearchInput'),
    selectedTagsDisplay: document.getElementById('selectedTagsDisplay')
};

// Tab management
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
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
            const now = Date.now();
            const timestamp = result.selectedTextTimestamp || 0;
            if (now - timestamp < 5000) {
                const formattedText = result.selectedText
                    .split('\n')
                    .map(line => `> ${line}`)
                    .join('\n');
                elements.pageDescription.value = formattedText;
                await chrome.storage.local.remove(['selectedText', 'selectedTextTimestamp']);
                showStatus('Selected text has been added', 'success');
            }
        }
    } catch (error) {
        console.error('Selected text could not be loaded:', error);
    }
}

// Load properties for a space (to find tag property)
async function loadProperties(spaceId) {
    try {
        console.log('Loading properties for space:', spaceId);
        const response = await fetch(`${API_BASE_URL}/spaces/${spaceId}/properties`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (response.ok) {
            const data = await response.json();
            const properties = data.data || [];
            console.log('Properties loaded:', properties.length);

            // Find tag property (multi_select format with key "tag")
            const tagProperty = properties.find(p =>
                p.key === 'tag' && p.format === 'multi_select'
            );

            if (tagProperty) {
                state.tagPropertyId = tagProperty.id;
                console.log('Tag property found:', tagProperty.id);
                await loadTags(spaceId, tagProperty.id);
            } else {
                console.log('No tag property found in space');
                state.tagPropertyId = null;
                state.availableTags = [];
                state.selectedTagIds = [];
                renderTags();
            }
        }
    } catch (error) {
        console.error('Properties could not be loaded:', error);
        state.tagPropertyId = null;
        state.availableTags = [];
        renderTags();
    }
}

// Load tags for a property
async function loadTags(spaceId, propertyId) {
    try {
        console.log('Loading tags for property:', propertyId);
        elements.tagsContainer.innerHTML = '<span class="tags-loading">Loading tags...</span>';

        const response = await fetch(`${API_BASE_URL}/spaces/${spaceId}/properties/${propertyId}/tags`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (response.ok) {
            const data = await response.json();
            state.availableTags = data.data || [];
            console.log('Tags loaded:', state.availableTags.length);
            renderTags();
        } else {
            console.error('Tags load error:', response.status);
            state.availableTags = [];
            renderTags();
        }
    } catch (error) {
        console.error('Tags could not be loaded:', error);
        state.availableTags = [];
        renderTags();
    }
}

// Render tags UI
function renderTags(filterText = '') {
    if (!state.tagPropertyId) {
        elements.tagsContainer.innerHTML = '<span class="no-tags">No tag property available</span>';
        return;
    }

    if (state.availableTags.length === 0) {
        elements.tagsContainer.innerHTML = '<span class="no-tags">No tags found. Create tags in Anytype first.</span>';
        return;
    }

    // Filter tags based on search text
    const filteredTags = filterText
        ? state.availableTags.filter(tag =>
            (tag.name || tag.key || '').toLowerCase().includes(filterText.toLowerCase())
        )
        : state.availableTags;

    elements.tagsContainer.innerHTML = '';

    if (filteredTags.length === 0) {
        elements.tagsContainer.innerHTML = '<span class="no-tags">No matching tags</span>';
        return;
    }

    filteredTags.forEach(tag => {
        const tagEl = document.createElement('span');
        const colorClass = `tag-${tag.color || 'grey'}`;
        const isSelected = state.selectedTagIds.includes(tag.id);

        tagEl.className = `tag-chip ${colorClass}${isSelected ? ' selected' : ''}`;
        tagEl.textContent = tag.name || tag.key || 'Unnamed';
        tagEl.dataset.id = tag.id;

        tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTag(tag.id);
        });

        elements.tagsContainer.appendChild(tagEl);
    });

    // Update selected tags display
    renderSelectedTags();
}

// Render selected tags in the input area
function renderSelectedTags() {
    elements.selectedTagsDisplay.innerHTML = '';

    state.selectedTagIds.forEach(tagId => {
        const tag = state.availableTags.find(t => t.id === tagId);
        if (tag) {
            const tagEl = document.createElement('span');
            const colorClass = `tag-${tag.color || 'grey'}`;
            tagEl.className = `selected-tag ${colorClass}`;
            tagEl.innerHTML = `${tag.name || tag.key || 'Unnamed'}<span class="remove-tag" data-id="${tag.id}">×</span>`;

            tagEl.querySelector('.remove-tag').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTag(tag.id);
            });

            elements.selectedTagsDisplay.appendChild(tagEl);
        }
    });

    // Update placeholder visibility
    if (state.selectedTagIds.length > 0) {
        elements.tagSearchInput.placeholder = '';
    } else {
        elements.tagSearchInput.placeholder = 'Search or select tags...';
    }
}

// Toggle tag selection
function toggleTag(tagId) {
    const index = state.selectedTagIds.indexOf(tagId);
    if (index > -1) {
        state.selectedTagIds.splice(index, 1);
    } else {
        state.selectedTagIds.push(tagId);
    }
    renderTags(elements.tagSearchInput.value);
    console.log('Selected tags:', state.selectedTagIds);
}

// Setup tag dropdown events
function setupTagDropdownEvents() {
    // Show dropdown on input focus
    elements.tagSearchInput.addEventListener('focus', () => {
        elements.tagsDropdownList.classList.remove('hidden');
        renderTags(elements.tagSearchInput.value);
    });

    // Filter tags on input
    elements.tagSearchInput.addEventListener('input', (e) => {
        renderTags(e.target.value);
    });

    // Click on input wrapper to focus
    elements.tagsDropdown.querySelector('.tags-input-wrapper').addEventListener('click', () => {
        elements.tagSearchInput.focus();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.tagsDropdown.contains(e.target)) {
            elements.tagsDropdownList.classList.add('hidden');
            elements.tagSearchInput.value = '';
        }
    });
}

// Initialize tag dropdown events after DOM loaded
document.addEventListener('DOMContentLoaded', () => {
    setupTagDropdownEvents();
});

// Load types for a space
async function loadTypes(spaceId) {
    try {
        console.log('Loading types for space:', spaceId);
        const typesResponse = await fetch(`${API_BASE_URL}/spaces/${spaceId}/types`, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (typesResponse.ok) {
            const data = await typesResponse.json();
            let types = data.data || data.types || (Array.isArray(data) ? data : []);
            if (!Array.isArray(types)) {
                types = [];
            }
            state.types = types;
            elements.typeSelect.innerHTML = '';

            if (types.length === 0) {
                elements.typeSelect.innerHTML = `
                    <option value="page" selected>Page</option>
                    <option value="note">Note</option>
                    <option value="task">Task</option>
                    <option value="bookmark">Bookmark</option>
                `;
            } else {
                const commonTypes = ['page', 'note', 'task', 'bookmark'];
                const sortedTypes = types.sort((a, b) => {
                    const aKey = a.key || a.type_key || '';
                    const bKey = b.key || b.type_key || '';
                    const aIndex = commonTypes.indexOf(aKey);
                    const bIndex = commonTypes.indexOf(bKey);
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return (a.name || '').localeCompare(b.name || '');
                });

                sortedTypes.forEach(type => {
                    const option = document.createElement('option');
                    const typeKey = type.key || type.type_key || type.id;
                    const typeName = type.name || type.title || typeKey;
                    option.value = typeKey;
                    option.textContent = typeName;
                    if (typeKey === 'page') {
                        option.selected = true;
                        state.selectedTypeKey = 'page';
                    }
                    elements.typeSelect.appendChild(option);
                });
            }

            if (!state.selectedTypeKey) {
                state.selectedTypeKey = 'page';
                elements.typeSelect.value = 'page';
            }
        } else {
            elements.typeSelect.innerHTML = `
                <option value="page" selected>Page</option>
                <option value="note">Note</option>
                <option value="task">Task</option>
                <option value="bookmark">Bookmark</option>
            `;
        }
    } catch (error) {
        console.error('Types could not be loaded:', error);
        elements.typeSelect.innerHTML = `
            <option value="page" selected>Page</option>
            <option value="note">Note</option>
            <option value="task">Task</option>
            <option value="bookmark">Bookmark</option>
        `;
    }
}

// Load saved state
async function loadState() {
    const saved = await chrome.storage.local.get(['apiKey', 'selectedSpaceId']);
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.selectedSpaceId) state.selectedSpaceId = saved.selectedSpaceId;
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
        setTimeout(() => elements.status.classList.add('hidden'), 3000);
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
        const response = await fetch(`${API_BASE_URL}/spaces`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Anytype-Version': API_VERSION
            }
        });

        if (response.ok) {
            const responseData = await response.json();
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
            showStatus(`Invalid API Key or connection error: ${response.status}`, 'error');
        }
    } catch (error) {
        showStatus('Connection error: ' + error.message, 'error');
    } finally {
        elements.connectBtn.innerHTML = 'Connect';
        elements.connectBtn.disabled = false;
    }
});

// Challenge Authentication
elements.startChallengeBtn.addEventListener('click', async () => {
    const appName = elements.appNameInput.value.trim() || 'Web Clipper';
    elements.startChallengeBtn.innerHTML = '<span class="loading"></span> Starting...';
    elements.startChallengeBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/challenges`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Anytype-Version': API_VERSION },
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
            headers: { 'Content-Type': 'application/json', 'Anytype-Version': API_VERSION },
            body: JSON.stringify({ challenge_id: state.challengeId, code: code })
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
        elements.verifyCodeBtn.innerHTML = 'Verify';
        elements.verifyCodeBtn.disabled = false;
    }
});

// Disconnect
elements.disconnectBtn.addEventListener('click', async () => {
    state.apiKey = null;
    state.selectedSpaceId = null;
    state.selectedCollectionId = null;
    state.tagPropertyId = null;
    state.availableTags = [];
    state.selectedTagIds = [];
    await chrome.storage.local.remove(['apiKey', 'selectedSpaceId']);

    elements.authSection.classList.remove('hidden');
    elements.mainSection.classList.add('hidden');
    elements.apiKeyInput.value = '';
    elements.codeInput.value = '';
    elements.codeSection.classList.add('hidden');
    elements.tagsContainer.innerHTML = '<span class="tags-loading">Select a space to load tags...</span>';
    elements.selectedTagsDisplay.innerHTML = '';
    elements.tagSearchInput.value = '';
    elements.tagSearchInput.placeholder = 'Search or select tags...';

    showStatus('Disconnected', 'info');
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
            let spaces = responseData.data || responseData.spaces || [];
            if (Array.isArray(responseData)) spaces = responseData;
            if (!Array.isArray(spaces)) {
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
                if (space.id === state.selectedSpaceId) option.selected = true;
                elements.spaceSelect.appendChild(option);
            });

            if (state.selectedSpaceId) {
                await loadCollections(state.selectedSpaceId);
                await loadTypes(state.selectedSpaceId);
                await loadProperties(state.selectedSpaceId);
            }
        } else {
            showStatus(`Space list couldn't be loaded: ${response.status}`, 'error');
        }
    } catch (error) {
        showStatus('Space list couldn\'t be loaded: ' + error.message, 'error');
    }
}

// Space selection change
elements.spaceSelect.addEventListener('change', async (e) => {
    const spaceId = e.target.value;
    state.selectedTagIds = []; // Reset selected tags when space changes

    if (spaceId) {
        state.selectedSpaceId = spaceId;
        await saveState();
        await loadCollections(spaceId);
        await loadTypes(spaceId);
        await loadProperties(spaceId);
    } else {
        state.selectedSpaceId = null;
        state.selectedCollectionId = null;
        state.tagPropertyId = null;
        state.availableTags = [];
        elements.collectionSection.classList.add('hidden');
        elements.tagsContainer.innerHTML = '<span class="tags-loading">Select a space to load tags...</span>';
        elements.selectedTagsDisplay.innerHTML = '';
        elements.tagSearchInput.placeholder = 'Search or select tags...';
    }
});

// Type selection change
elements.typeSelect.addEventListener('change', (e) => {
    state.selectedTypeKey = e.target.value;
});

// Load collections for a space
async function loadCollections(spaceId) {
    try {
        let collections = [];

        try {
            const response = await fetch(`${API_BASE_URL}/spaces/${spaceId}/lists`, {
                headers: {
                    'Authorization': `Bearer ${state.apiKey}`,
                    'Anytype-Version': API_VERSION
                }
            });

            if (response.ok) {
                const data = await response.json();
                collections = data.data || data.lists || (Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.log('Lists endpoint error:', e);
        }

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
                    collections = objects.filter(obj => {
                        return obj.type === 'set' || obj.type === 'collection' ||
                            obj.type_key === 'set' || obj.type_key === 'collection' ||
                            obj.layout === 'set' || obj.layout === 'collection';
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
                    No collections found<br>
                    <small style="color: #999;">You can save directly to Space</small>
                </div>`;
        } else {
            collections.forEach(collection => {
                const item = document.createElement('div');
                item.className = 'collection-item';
                item.textContent = collection.name || collection.title || 'Untitled';
                item.dataset.id = collection.id;

                item.addEventListener('click', () => {
                    document.querySelectorAll('.collection-item').forEach(i => i.classList.remove('selected'));
                    if (state.selectedCollectionId === collection.id) {
                        state.selectedCollectionId = null;
                    } else {
                        item.classList.add('selected');
                        state.selectedCollectionId = collection.id;
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
                <small style="color: #999;">You can save directly to Space</small>
            </div>`;
    }
}

// Build properties array for API request
function buildPropertiesArray(url, title, description, typeKey) {
    const properties = [];

    // Add source URL property for all types
    if (url) {
        properties.push({
            key: 'source',
            url: url
        });
    }

    // Add tags property if any selected
    if (state.selectedTagIds.length > 0 && state.tagPropertyId) {
        properties.push({
            key: 'tag',
            multi_select: state.selectedTagIds
        });
    }

    return properties;
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
        // Build properties array
        const properties = buildPropertiesArray(url, title, description, state.selectedTypeKey);

        // Build body with URL and description
        let bodyContent = `**URL:** [${url}](${url})`;
        if (description) {
            bodyContent += `\n\n${description}`;
        }

        // Base object data
        const objectData = {
            name: title,
            icon: { emoji: "🔗", format: "emoji" },
            body: bodyContent,
            type_key: state.selectedTypeKey || 'page',
            properties: properties
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

            // For bookmark type, wait a bit then update the name
            // because Anytype fetches metadata from URL and overrides the name
            if (state.selectedTypeKey === 'bookmark' && createdObjectId && title) {
                try {
                    // Wait for Anytype to finish fetching metadata
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    console.log('Updating bookmark name to:', title);
                    const updateResponse = await fetch(
                        `${API_BASE_URL}/spaces/${state.selectedSpaceId}/objects/${createdObjectId}`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${state.apiKey}`,
                                'Content-Type': 'application/json',
                                'Anytype-Version': API_VERSION
                            },
                            body: JSON.stringify({ name: title })
                        }
                    );

                    if (updateResponse.ok) {
                        console.log('Bookmark name updated successfully');
                    } else {
                        console.log('Bookmark name update failed:', updateResponse.status);
                    }
                } catch (error) {
                    console.log('Could not update bookmark name:', error);
                }
            }

            // Add to collection if selected
            if (state.selectedCollectionId && createdObjectId) {
                try {
                    await fetch(
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
                } catch (error) {
                    console.log('Could not add to collection:', error);
                }
            }

            showStatus('Saved successfully!', 'success');

            // Reset form
            elements.pageDescription.value = '';
            state.selectedTagIds = [];
            renderTags();
            renderSelectedTags();

            // Refresh page info
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
        elements.saveBtnText.innerHTML = 'Save to Anytype';
        elements.saveBtn.disabled = false;
    }
});