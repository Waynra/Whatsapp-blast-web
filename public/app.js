// Socket.io initialization
const socket = io();

// UI Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const headerStatusBadge = document.getElementById('headerStatusBadge');
const clientInfo = document.getElementById('clientInfo');
const clientName = document.getElementById('clientName');
const clientPhone = document.getElementById('clientPhone');
const btnDisconnect = document.getElementById('btnDisconnect');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeToggleIcon = document.getElementById('themeToggleIcon');

const authSection = document.getElementById('authSection');
const campaignSection = document.getElementById('campaignSection');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrcodeContainer = document.getElementById('qrcode');

const messageTemplate = document.getElementById('messageTemplate');
const fileDropZone = document.getElementById('fileDropZone');
const contactsFileInput = document.getElementById('contactsFileInput');
const uploadFeedback = document.getElementById('uploadFeedback');
const uploadedFileName = document.getElementById('uploadedFileName');
const contactsCount = document.getElementById('contactsCount');
const contactsPreviewGroup = document.getElementById('contactsPreviewGroup');
const contactsPreviewBox = document.getElementById('contactsPreviewBox');

const delayInput = document.getElementById('delay');
const sleepAfterInput = document.getElementById('sleepAfter');
const sleepDurationInput = document.getElementById('sleepDuration');

const useSpintax = document.getElementById('useSpintax');
const useDynamicVars = document.getElementById('useDynamicVars');
const useEmoji = document.getElementById('useEmoji');
const useWhitespace = document.getElementById('useWhitespace');
const useRandomSuffix = document.getElementById('useRandomSuffix');

const btnStartCampaign = document.getElementById('btnStartCampaign');
const progressCard = document.getElementById('progressCard');
const progressSpinner = document.getElementById('progressSpinner');
const btnPauseCampaign = document.getElementById('btnPauseCampaign');
const btnResumeCampaign = document.getElementById('btnResumeCampaign');
const btnCancelCampaign = document.getElementById('btnCancelCampaign');

const statSuccess = document.getElementById('statSuccess');
const statFailed = document.getElementById('statFailed');
const statProgressCount = document.getElementById('statProgressCount');
const statTotalCount = document.getElementById('statTotalCount');
const statPercentage = document.getElementById('statPercentage');
const progressBarFill = document.getElementById('progressBarFill');
const terminalLogs = document.getElementById('terminalLogs');
const btnClearTerminal = document.getElementById('btnClearTerminal');

const templateList = document.getElementById('templateList');
const reportList = document.getElementById('reportList');

// Tab Selection Elements
const tabUploadFile = document.getElementById('tabUploadFile');
const tabSelectWA = document.getElementById('tabSelectWA');
const tabInputManual = document.getElementById('tabInputManual');
const contentUploadFile = document.getElementById('contentUploadFile');
const contentSelectWA = document.getElementById('contentSelectWA');
const contentInputManual = document.getElementById('contentInputManual');
const manualNumbersInput = document.getElementById('manualNumbersInput');
const parsedManualCount = document.getElementById('parsedManualCount');

// Active WA selection elements
const btnLoadWAData = document.getElementById('btnLoadWAData');
const loadWAIcon = document.getElementById('loadWAIcon');
const waChatSearch = document.getElementById('waChatSearch');
const filterAll = document.getElementById('filterAll');
const filterPrivate = document.getElementById('filterPrivate');
const filterGroups = document.getElementById('filterGroups');
const chkSelectAllChats = document.getElementById('chkSelectAllChats');
const visibleChatsCount = document.getElementById('visibleChatsCount');
const selectedChatsCount = document.getElementById('selectedChatsCount');
const waChatsList = document.getElementById('waChatsList');

// Global State
let loadedNumbers = null;
let uploadedNumbers = null; // Backup for uploaded file contacts
let uploadName = 'web-contacts';
let uploadedFileNameBackup = 'web-contacts'; // Backup for uploaded file name
let currentStatus = { state: 'disconnected', ready: false };
let isCampaignRunning = false;
let manualNumbers = null; // Stored parsed numbers from manual input

// Active WA selection state
let activeTab = 'upload'; // 'upload' or 'whatsapp'
let rawWAData = []; // Array of active chats fetched from API
let selectedChats = new Set(); // Set of serialized chat IDs that are checked
let waFilter = 'all'; // 'all', 'private', 'groups'
let waSearchQuery = '';

// 1. Connection & Status Management
socket.on('status', (status) => {
  currentStatus = status;
  updateStatusUI(status);
});

socket.on('qr', (qr) => {
  renderQRCode(qr);
});

function updateStatusUI(status) {
  // Update Indicators
  statusDot.className = 'status-dot';
  headerStatusBadge.className = 'status-badge';
  
  const menuSections = document.querySelectorAll('.sidebar-menu-section');
  
  if (status.ready) {
    statusDot.classList.add('dot-ready');
    statusText.innerText = 'Connected';
    headerStatusBadge.classList.add('status-connected');
    headerStatusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Connected';
    
    // Show client info
    authSection.style.display = 'none';
    campaignSection.style.display = 'block';
    clientInfo.style.display = 'flex';
    if (status.info) {
      clientName.innerText = status.info.name || 'Unknown';
      clientPhone.innerText = status.info.phone || 'Unknown';
    }
    
    // Show sidebar lists
    menuSections.forEach(section => section.style.display = 'block');
    
    // Enable start button if numbers are loaded and campaign not running
    if (loadedNumbers && loadedNumbers.length > 0 && !isCampaignRunning) {
      btnStartCampaign.removeAttribute('disabled');
    }
  } else {
    clientInfo.style.display = 'none';
    btnStartCampaign.setAttribute('disabled', 'true');
    
    // Hide sidebar lists
    menuSections.forEach(section => section.style.display = 'none');
    
    if (status.state === 'scanning') {
      statusDot.classList.add('dot-scanning');
      statusText.innerText = 'Scan QR Code';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-qrcode"></i> Scan QR';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
    } else if (status.state === 'initializing') {
      statusDot.classList.add('dot-connecting');
      statusText.innerText = 'Initializing...';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
      qrPlaceholder.style.display = 'flex';
      qrcodeContainer.innerHTML = '';
    } else {
      statusDot.classList.add('dot-disconnected');
      statusText.innerText = 'Disconnected';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> Offline';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
    }
  }
}

function renderQRCode(qrText) {
  qrPlaceholder.style.display = 'none';
  qrcodeContainer.innerHTML = '';
  new QRCode(qrcodeContainer, {
    text: qrText,
    width: 232,
    height: 232,
    colorDark: '#0b0f19',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

// 2. Sidebar Lists Loading
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (data.success) {
      templateList.innerHTML = '';
      if (data.templates.length === 0) {
        templateList.innerHTML = '<li class="loading-item">No templates found</li>';
        return;
      }
      data.templates.forEach(name => {
        const li = document.createElement('li');
        li.className = 'template-item';
        li.innerHTML = `<span>${name}</span> <i class="fa-solid fa-chevron-right"></i>`;
        li.addEventListener('click', () => loadTemplateContent(name));
        templateList.appendChild(li);
      });
    }
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

async function loadTemplateContent(name) {
  try {
    const res = await fetch(`/api/templates/${name}`);
    const data = await res.json();
    if (data.success) {
      messageTemplate.value = data.content;
      addLogLine('info', `Loaded template: ${name}`);
    }
  } catch (err) {
    console.error('Error loading template content:', err);
  }
}

async function loadReports() {
  try {
    const res = await fetch('/api/reports');
    const data = await res.json();
    if (data.success) {
      reportList.innerHTML = '';
      if (data.reports.length === 0) {
        reportList.innerHTML = '<li class="loading-item">Belum ada laporan</li>';
        return;
      }
      data.reports.forEach(name => {
        const li = document.createElement('li');
        li.className = 'report-item';
        li.innerHTML = `
          <span>${name}</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <a href="/api/reports/${name}" class="btn-download-report" title="Unduh Laporan" download style="color: var(--color-primary); cursor: pointer;">
              <i class="fa-solid fa-download"></i>
            </a>
            <button class="btn-delete-report" data-name="${name}" title="Hapus Laporan" style="color: var(--text-muted); background: transparent; border: none; cursor: pointer; transition: var(--transition);">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
        
        // Add delete listener
        li.querySelector('.btn-delete-report').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteReport(name);
        });
        
        reportList.appendChild(li);
      });
    }
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

async function deleteReport(name) {
  if (!confirm(`Apakah Anda yakin ingin menghapus laporan "${name}"?`)) return;
  try {
    const res = await fetch(`/api/reports/${name}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      loadReports();
      addLogLine('info', `Laporan ${name} berhasil dihapus.`);
    } else {
      alert(`Gagal menghapus laporan: ${data.error}`);
    }
  } catch (err) {
    console.error('Error deleting report:', err);
  }
}

// 3. File Upload handling
fileDropZone.addEventListener('click', () => contactsFileInput.click());

contactsFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileUpload(e.target.files[0]);
  }
});

fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.classList.add('dragover');
});

fileDropZone.addEventListener('dragleave', () => {
  fileDropZone.classList.remove('dragover');
});

fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('file', file);

  uploadFeedback.style.display = 'none';
  contactsPreviewGroup.style.display = 'none';
  btnStartCampaign.setAttribute('disabled', 'true');

  try {
    const res = await fetch('/api/upload-contacts', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (data.success) {
      loadedNumbers = data.numbers;
      uploadedNumbers = data.numbers;
      uploadName = data.filename;
      uploadedFileNameBackup = data.filename;
      
      // Update UI
      uploadedFileName.innerText = file.name;
      contactsCount.innerText = data.numbers.length;
      uploadFeedback.style.display = 'block';

      // Preview contacts
      contactsPreviewBox.innerHTML = '';
      data.numbers.slice(0, 15).forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'preview-row';
        row.innerHTML = `
          <span class="preview-num">${item.number}</span>
          <span class="preview-name">${item.name || '<i style="opacity:0.5">No Name</i>'}</span>
        `;
        contactsPreviewBox.appendChild(row);
      });
      if (data.numbers.length > 15) {
        const row = document.createElement('div');
        row.className = 'preview-row';
        row.innerHTML = `<span style="opacity:0.5; font-style:italic;">... and ${data.numbers.length - 15} more</span>`;
        contactsPreviewBox.appendChild(row);
      }
      contactsPreviewGroup.style.display = 'block';

      // Enable start button if ready
      if (currentStatus.ready && !isCampaignRunning) {
        btnStartCampaign.removeAttribute('disabled');
      }
      
      addLogLine('success', `File contacts loaded: ${file.name} (${data.numbers.length} numbers)`);
    } else {
      alert(`Gagal upload: ${data.error}`);
    }
  } catch (err) {
    console.error('Error uploading file:', err);
    alert('Terjadi kesalahan saat mengunggah file.');
  }
}

// 4. Campaign Actions
btnStartCampaign.addEventListener('click', async () => {
  const template = messageTemplate.value.trim();
  if (!template) {
    alert('Masukkan template pesan terlebih dahulu.');
    return;
  }
  if (!loadedNumbers || loadedNumbers.length === 0) {
    alert('Upload daftar kontak terlebih dahulu.');
    return;
  }

  const delayVal = parseInt(delayInput.value) * 1000;
  const sleepAfterVal = parseInt(sleepAfterInput.value);
  const sleepDurationVal = parseInt(sleepDurationInput.value) * 1000;

  const campaignData = {
    data: {
      numbers: loadedNumbers,
      textTemplate: template,
      textFileName: 'web-campaign',
      numberFileName: uploadName
    },
    options: {
      delay: delayVal,
      sleepAfter: sleepAfterVal,
      sleepDuration: sleepDurationVal,
      messageVariation: {
        useSpintax: useSpintax.checked,
        useDynamicVars: useDynamicVars.checked,
        useEmoji: useEmoji.checked,
        useWhitespace: useWhitespace.checked,
        useRandomSuffix: useRandomSuffix.checked
      }
    }
  };

  try {
    const res = await fetch('/api/start-campaign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campaignData)
    });
    const result = await res.json();
    if (!result.success) {
      alert(`Gagal memulai: ${result.error}`);
    }
  } catch (err) {
    console.error('Error starting campaign:', err);
  }
});

// Controls
btnPauseCampaign.addEventListener('click', () => fetch('/api/pause-campaign', { method: 'POST' }));
btnResumeCampaign.addEventListener('click', () => fetch('/api/resume-campaign', { method: 'POST' }));
btnCancelCampaign.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin membatalkan kampanye ini?')) {
    fetch('/api/cancel-campaign', { method: 'POST' });
  }
});

btnDisconnect.addEventListener('click', async () => {
  if (confirm('Apakah Anda yakin ingin memutuskan sesi WhatsApp ini?')) {
    // Show instant loading state in UI
    statusDot.className = 'status-dot dot-connecting';
    statusText.innerText = 'Disconnecting...';
    headerStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disconnecting...';
    clientInfo.style.display = 'none';
    
    authSection.style.display = 'block';
    campaignSection.style.display = 'none';
    qrPlaceholder.style.display = 'flex';
    qrcodeContainer.innerHTML = '';

    try {
      await fetch('/api/disconnect', { method: 'POST' });
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  }
});

btnClearTerminal.addEventListener('click', () => {
  terminalLogs.innerHTML = '';
});

// Socket Campaign Events
socket.on('campaign_status', (data) => {
  if (data.status === 'running') {
    isCampaignRunning = true;
    progressCard.style.display = 'block';
    btnStartCampaign.setAttribute('disabled', 'true');
    btnPauseCampaign.style.display = 'inline-flex';
    btnResumeCampaign.style.display = 'none';
    progressSpinner.classList.add('fa-spin');
    
    // Disable input controls
    toggleInputs(true);
  } else if (data.status === 'paused') {
    isCampaignRunning = true;
    progressCard.style.display = 'block';
    btnStartCampaign.setAttribute('disabled', 'true');
    btnPauseCampaign.style.display = 'none';
    btnResumeCampaign.style.display = 'inline-flex';
    progressSpinner.classList.remove('fa-spin');
  } else {
    // Idle / Finished / Cancelled
    isCampaignRunning = false;
    btnPauseCampaign.style.display = 'none';
    btnResumeCampaign.style.display = 'none';
    progressSpinner.classList.remove('fa-spin');
    
    if (currentStatus.ready && loadedNumbers) {
      btnStartCampaign.removeAttribute('disabled');
    }
    
    // Enable input controls
    toggleInputs(false);
    
    // Reload sidebar lists
    loadTemplates();
    loadReports();
  }
});

socket.on('campaign_progress', (data) => {
  statSuccess.innerText = data.success;
  statFailed.innerText = data.failed;
  statProgressCount.innerText = data.index;
  statTotalCount.innerText = data.total;

  const percent = Math.round((data.index / data.total) * 100);
  statPercentage.innerText = `${percent}%`;
  progressBarFill.style.width = `${percent}%`;
});

socket.on('campaign_log', (data) => {
  addLogLine(data.type, data.message);
});

function addLogLine(type, message) {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString('id-ID');
  line.innerText = `[${timestamp}] ${message}`;
  
  terminalLogs.appendChild(line);
  
  // Auto-scroll to bottom
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

function toggleInputs(disabled) {
  const elements = [
    messageTemplate,
    contactsFileInput,
    manualNumbersInput,
    delayInput,
    sleepAfterInput,
    sleepDurationInput,
    useSpintax,
    useDynamicVars,
    useEmoji,
    useWhitespace,
    useRandomSuffix
  ];

  elements.forEach(el => {
    if (disabled) {
      el.setAttribute('disabled', 'true');
    } else {
      el.removeAttribute('disabled');
    }
  });

  if (disabled) {
    fileDropZone.style.pointerEvents = 'none';
    fileDropZone.style.opacity = '0.5';
  } else {
    fileDropZone.style.pointerEvents = 'auto';
    fileDropZone.style.opacity = '1';
  }
}

// ==========================================
// TABS & ACTIVE CHATS SELECTION LOGIC
// ==========================================

// Tab Switching Listeners
tabUploadFile.addEventListener('click', () => {
  activeTab = 'upload';
  tabUploadFile.classList.add('active');
  tabSelectWA.classList.remove('active');
  tabInputManual.classList.remove('active');
  contentUploadFile.style.display = 'block';
  contentSelectWA.style.display = 'none';
  contentInputManual.style.display = 'none';
  
  // Restore uploaded file data
  loadedNumbers = uploadedNumbers;
  uploadName = uploadedFileNameBackup;

  if (loadedNumbers && loadedNumbers.length > 0 && !isCampaignRunning) {
    if (currentStatus.ready) {
      btnStartCampaign.removeAttribute('disabled');
    }
  } else {
    btnStartCampaign.setAttribute('disabled', 'true');
  }
});

tabSelectWA.addEventListener('click', () => {
  activeTab = 'whatsapp';
  tabSelectWA.classList.add('active');
  tabUploadFile.classList.remove('active');
  tabInputManual.classList.remove('active');
  contentSelectWA.style.display = 'block';
  contentUploadFile.style.display = 'none';
  contentInputManual.style.display = 'none';

  // Trigger loading active chats if we haven't loaded them yet
  if (rawWAData.length === 0 && currentStatus.ready) {
    fetchActiveChats();
  }
  
  updateCampaignButtonForWA();
});

tabInputManual.addEventListener('click', () => {
  activeTab = 'manual';
  tabInputManual.classList.add('active');
  tabUploadFile.classList.remove('active');
  tabSelectWA.classList.remove('active');
  contentInputManual.style.display = 'block';
  contentUploadFile.style.display = 'none';
  contentSelectWA.style.display = 'none';

  parseManualNumbers();
});

// Load active WhatsApp chats from backend
async function fetchActiveChats() {
  if (!currentStatus.ready) return;

  loadWAIcon.classList.add('fa-spin');
  btnLoadWAData.setAttribute('disabled', 'true');
  
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    if (data.success) {
      rawWAData = data.chats;
      selectedChats.clear();
      chkSelectAllChats.checked = false;
      renderWAConversations();
      addLogLine('success', `Berhasil memuat ${data.chats.length} chat aktif dari WhatsApp.`);
    } else {
      addLogLine('error', `Gagal memuat chat aktif: ${data.error}`);
    }
  } catch (err) {
    console.error('Error fetching active chats:', err);
    addLogLine('error', 'Gagal memuat chat aktif. Periksa koneksi backend.');
  } finally {
    loadWAIcon.classList.remove('fa-spin');
    btnLoadWAData.removeAttribute('disabled');
  }
}

btnLoadWAData.addEventListener('click', fetchActiveChats);

// Render list of WA conversations
function renderWAConversations() {
  waChatsList.innerHTML = '';
  
  // Apply Search and Filters
  const filtered = rawWAData.filter(chat => {
    // Filter Group vs Private
    if (waFilter === 'private' && chat.isGroup) return false;
    if (waFilter === 'groups' && !chat.isGroup) return false;
    
    // Search Query
    if (waSearchQuery) {
      const q = waSearchQuery.toLowerCase();
      const nameMatch = chat.name && chat.name.toLowerCase().includes(q);
      const idMatch = chat.id && chat.id.toLowerCase().includes(q);
      return nameMatch || idMatch;
    }
    
    return true;
  });

  visibleChatsCount.innerText = filtered.length;
  selectedChatsCount.innerText = selectedChats.size;

  if (filtered.length === 0) {
    waChatsList.innerHTML = `
      <div class="wa-chats-empty">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>Tidak ada chat yang sesuai filter.</p>
      </div>
    `;
    return;
  }

  // Create list elements
  filtered.forEach(chat => {
    const isChecked = selectedChats.has(chat.id);
    const item = document.createElement('div');
    item.className = 'wa-chat-item';
    
    const initials = (chat.name || '?').substring(0, 2).toUpperCase();
    const badgeClass = chat.isGroup ? 'wa-badge-group' : 'wa-badge-private';
    const badgeText = chat.isGroup ? 'Group' : 'Pribadi';
    const cleanId = chat.id.split('@')[0];
    const displayNum = chat.displayId || cleanId;

    item.innerHTML = `
      <div class="wa-chat-left">
        <label class="checkbox-container">
          <input type="checkbox" class="wa-chat-checkbox" data-id="${chat.id}" ${isChecked ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <div class="wa-chat-avatar">${initials}</div>
        <div class="wa-chat-info">
          <div class="wa-chat-name" title="${chat.name}">${chat.name || displayNum}</div>
          <div class="wa-chat-details">${displayNum}</div>
        </div>
      </div>
      <div class="wa-badge ${badgeClass}">${badgeText}</div>
    `;

    // Checkbox toggle listener
    const checkbox = item.querySelector('.wa-chat-checkbox');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedChats.add(chat.id);
      } else {
        selectedChats.delete(chat.id);
      }
      
      // Update counts and selections
      selectedChatsCount.innerText = selectedChats.size;
      updateCampaignButtonForWA();
      
      // check if all filtered are checked
      const allFilteredChecked = filtered.every(c => selectedChats.has(c.id));
      chkSelectAllChats.checked = allFilteredChecked;
    });

    waChatsList.appendChild(item);
  });

  // Handle Select All Checkbox State
  const allChecked = filtered.length > 0 && filtered.every(c => selectedChats.has(c.id));
  chkSelectAllChats.checked = allChecked;
}

// Select All visible chats toggle
chkSelectAllChats.addEventListener('change', (e) => {
  const isChecked = e.target.checked;
  
  // Find currently filtered chats
  const filtered = rawWAData.filter(chat => {
    if (waFilter === 'private' && chat.isGroup) return false;
    if (waFilter === 'groups' && !chat.isGroup) return false;
    if (waSearchQuery) {
      const q = waSearchQuery.toLowerCase();
      return (chat.name && chat.name.toLowerCase().includes(q)) || (chat.id && chat.id.toLowerCase().includes(q));
    }
    return true;
  });

  filtered.forEach(chat => {
    if (isChecked) {
      selectedChats.add(chat.id);
    } else {
      selectedChats.delete(chat.id);
    }
  });

  // Re-render checklist rows to update checked boxes
  renderWAConversations();
  updateCampaignButtonForWA();
});

// Filters implementation
filterAll.addEventListener('click', () => {
  waFilter = 'all';
  setActiveFilterPill(filterAll);
  renderWAConversations();
});

filterPrivate.addEventListener('click', () => {
  waFilter = 'private';
  setActiveFilterPill(filterPrivate);
  renderWAConversations();
});

filterGroups.addEventListener('click', () => {
  waFilter = 'groups';
  setActiveFilterPill(filterGroups);
  renderWAConversations();
});

function setActiveFilterPill(activePill) {
  [filterAll, filterPrivate, filterGroups].forEach(pill => pill.classList.remove('active'));
  activePill.classList.add('active');
}

// Search filter
waChatSearch.addEventListener('input', (e) => {
  waSearchQuery = e.target.value;
  renderWAConversations();
});

// Update start campaign button for WhatsApp tab selection
function updateCampaignButtonForWA() {
  if (activeTab === 'whatsapp') {
    if (selectedChats.size > 0 && currentStatus.ready && !isCampaignRunning) {
      btnStartCampaign.removeAttribute('disabled');
      
      // Update loadedNumbers to match selection format
      loadedNumbers = Array.from(selectedChats).map(id => {
        const chat = rawWAData.find(c => c.id === id);
        return {
          number: id,
          name: chat ? chat.name : null
        };
      });
      uploadName = 'whatsapp-selection';
    } else {
      btnStartCampaign.setAttribute('disabled', 'true');
    }
  }
}

// ==========================================
// BLACKLIST / OPT-OUT MANAGEMENT
// ==========================================

const blacklistInput = document.getElementById('blacklistInput');
const btnBlacklistAdd = document.getElementById('btnBlacklistAdd');
const blacklistList = document.getElementById('blacklistList');

// Fetch and render blacklist
async function loadBlacklist() {
  try {
    const res = await fetch('/api/blacklist');
    const data = await res.json();
    if (data.success) {
      renderBlacklist(data.blacklist);
    }
  } catch (err) {
    console.error('Error loading blacklist:', err);
  }
}

// Render blacklist UI
function renderBlacklist(blacklistArray) {
  blacklistList.innerHTML = '';
  if (blacklistArray.length === 0) {
    blacklistList.innerHTML = '<li class="loading-item">Blacklist kosong</li>';
    return;
  }
  
  blacklistArray.forEach(number => {
    const li = document.createElement('li');
    li.className = 'blacklist-item';
    li.innerHTML = `
      <span>${number}</span>
      <button class="btn-remove-blacklist" data-number="${number}" title="Hapus dari Blacklist">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    
    // Add remove listener
    li.querySelector('.btn-remove-blacklist').addEventListener('click', () => {
      removeNumberFromBlacklist(number);
    });
    
    blacklistList.appendChild(li);
  });
}

// Add number manually
async function addNumberToBlacklist() {
  const number = blacklistInput.value.trim();
  if (!number) return;
  
  try {
    const res = await fetch('/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number })
    });
    const data = await res.json();
    if (data.success) {
      blacklistInput.value = '';
      loadBlacklist();
      addLogLine('info', `Nomor ${number} berhasil ditambahkan ke blacklist secara manual.`);
    } else {
      alert(`Gagal menambah blacklist: ${data.error}`);
    }
  } catch (err) {
    console.error('Error adding to blacklist:', err);
  }
}

// Remove number manually
async function removeNumberFromBlacklist(number) {
  if (!confirm(`Hapus nomor ${number} dari daftar blacklist?`)) return;
  
  try {
    const res = await fetch(`/api/blacklist/${number}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      loadBlacklist();
      addLogLine('info', `Nomor ${number} telah dihapus dari daftar blacklist.`);
    } else {
      alert(`Gagal menghapus: ${data.error}`);
    }
  } catch (err) {
    console.error('Error removing from blacklist:', err);
  }
}

// Bind listeners
btnBlacklistAdd.addEventListener('click', addNumberToBlacklist);
blacklistInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addNumberToBlacklist();
});

// Socket listener for auto-blacklist updates
socket.on('blacklist_updated', () => {
  loadBlacklist();
});

// ==========================================
// MANUAL INPUT LOGIC
// ==========================================

function parseManualNumbers() {
  const rawText = manualNumbersInput.value;
  const lines = rawText.split('\n');
  const list = [];
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split('|');
    const num = parts[0].trim();
    const name = parts[1] ? parts[1].trim() : null;
    if (num) {
      list.push({ number: num, name: name });
    }
  });
  
  manualNumbers = list;
  parsedManualCount.innerText = list.length;
  
  if (activeTab === 'manual') {
    if (list.length > 0 && currentStatus.ready && !isCampaignRunning) {
      btnStartCampaign.removeAttribute('disabled');
      loadedNumbers = list;
      uploadName = 'manual-input';
    } else {
      btnStartCampaign.setAttribute('disabled', 'true');
    }
  }
}

manualNumbersInput.addEventListener('input', parseManualNumbers);

// ==========================================
// THEME TOGGLE (DARK / LIGHT) LOGIC
// ==========================================

// Load saved theme on startup
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
  document.body.classList.add('light-theme');
  themeToggleIcon.className = 'fa-solid fa-moon';
} else {
  document.body.classList.remove('light-theme');
  themeToggleIcon.className = 'fa-solid fa-sun';
}

// Toggle theme on button click
themeToggleBtn.addEventListener('click', () => {
  if (document.body.classList.contains('light-theme')) {
    document.body.classList.remove('light-theme');
    themeToggleIcon.className = 'fa-solid fa-sun';
    localStorage.setItem('theme', 'dark');
    addLogLine('info', 'Tema diubah ke Mode Gelap (Dark Mode).');
  } else {
    document.body.classList.add('light-theme');
    themeToggleIcon.className = 'fa-solid fa-moon';
    localStorage.setItem('theme', 'light');
    addLogLine('info', 'Tema diubah ke Mode Terang (Light Mode).');
  }
});

// Socket listener for background LID resolution updates
socket.on('chats_resolved', (updates) => {
  // Update rawWAData so if they filter/search again it uses the new values
  rawWAData.forEach(chat => {
    const origJid = chat.id;
    if (updates[origJid]) {
      chat.id = updates[origJid].targetJid;
      chat.displayId = updates[origJid].displayId;
    }
  });

  // Dynamically update the DOM elements currently on screen
  Object.keys(updates).forEach(lidJid => {
    const data = updates[lidJid];
    // Find checkboxes with data-id matching the lidJid
    const checkboxes = document.querySelectorAll(`.wa-chat-checkbox[data-id="${lidJid}"]`);
    checkboxes.forEach(checkbox => {
      // Update data-id attribute to the new resolved c.us JID
      checkbox.setAttribute('data-id', data.targetJid);
      
      // Update displayed name or detail inside parent row
      const parentRow = checkbox.closest('.wa-chat-item');
      if (parentRow) {
        // Update display number in .wa-chat-details
        const detailsDiv = parentRow.querySelector('.wa-chat-details');
        if (detailsDiv) {
          detailsDiv.innerText = data.displayId;
        }
        
        // Update wa-chat-name title and innerText if it was using cleanId
        const nameDiv = parentRow.querySelector('.wa-chat-name');
        if (nameDiv && nameDiv.innerText === lidJid.split('@')[0]) {
          nameDiv.innerText = nameDiv.title || data.displayId;
        }
      }
    });

    // Also update selection states if they checked it while resolving
    if (selectedChats.has(lidJid)) {
      selectedChats.delete(lidJid);
      selectedChats.add(data.targetJid);
    }
  });

  updateCampaignButtonForWA();
});

// Initial Boot
loadTemplates();
loadReports();
loadBlacklist();
