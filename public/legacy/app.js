const uploadForm = document.getElementById('upload-form');
const docsInput = document.getElementById('documents');
const uploadStatus = document.getElementById('upload-status');
const docsList = document.getElementById('docs-list');
const refreshDocsBtn = document.getElementById('refresh-docs');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message');
const chatLog = document.getElementById('chat-log');
const clearHistoryBtn = document.getElementById('clear-history');
const uploadBtn = document.getElementById('upload-btn');

function setUploadState(isUploading, message) {
  uploadBtn.disabled = isUploading;
  docsInput.disabled = isUploading;
  uploadStatus.classList.toggle('uploading', isUploading);
  uploadStatus.textContent = message;
}

function addMessage(role, text, citations = []) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = role === 'user' ? 'You' : 'Gemini';

  const textEl = document.createElement('div');
  textEl.textContent = text;

  wrapper.append(roleEl, textEl);

  if (citations.length > 0) {
    const src = document.createElement('div');
    src.className = 'sources';
    src.textContent = `Sources: ${citations.map((c) => c.title).join(' | ')}`;
    wrapper.appendChild(src);
  }

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function refreshDocuments() {
  const response = await fetch('/api/documents');
  const data = await response.json();

  docsList.innerHTML = '';

  if (!response.ok) {
    const li = document.createElement('li');
    li.textContent = `Error: ${data.error || 'Unable to load documents.'}`;
    docsList.appendChild(li);
    return;
  }

  if (!data.documents || data.documents.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No documents indexed yet.';
    docsList.appendChild(li);
    return;
  }

  for (const doc of data.documents) {
    const li = document.createElement('li');
    li.textContent = doc.displayName || doc.name || 'Unnamed document';
    docsList.appendChild(li);
  }
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!docsInput.files || docsInput.files.length === 0) {
    setUploadState(false, 'Choose at least one file.');
    return;
  }

  setUploadState(true, 'Uploading and indexing. This can take a while for PDFs...');

  const formData = new FormData();
  for (const file of docsInput.files) {
    formData.append('documents', file);
  }
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      setUploadState(false, `Upload failed: ${data.error || 'Unknown error.'}`);
      return;
    }

    setUploadState(false, `Uploaded: ${data.uploaded.join(', ')}`);
    docsInput.value = '';
    await refreshDocuments();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    setUploadState(false, `Upload failed: ${message}`);
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  addMessage('user', message);
  messageInput.value = '';

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const data = await response.json();
  if (!response.ok) {
    addMessage('model', `Error: ${data.error || 'Chat failed.'}`);
    return;
  }

  const answerText = data.grounded
    ? data.answer || '(empty response)'
    : `${data.answer || '(empty response)'}\n\nNo matching grounded evidence was found in your uploaded documents.`;
  addMessage('model', answerText, data.citations || []);
});

refreshDocsBtn.addEventListener('click', refreshDocuments);

clearHistoryBtn.addEventListener('click', async () => {
  await fetch('/api/history/clear', { method: 'POST' });
  chatLog.innerHTML = '';
});

refreshDocuments().catch((err) => {
  const li = document.createElement('li');
  li.textContent = `Error: ${err.message}`;
  docsList.appendChild(li);
});
