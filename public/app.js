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
const btnResetSession = document.getElementById('btnResetSession');
const connectionResetZone = document.getElementById('connectionResetZone');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeToggleIcon = document.getElementById('themeToggleIcon');

const authSection = document.getElementById('authSection');
const campaignSection = document.getElementById('campaignSection');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrcodeContainer = document.getElementById('qrcode');

const messageTemplate = document.getElementById('messageTemplate');
const templateNameInput = document.getElementById('templateNameInput');
const btnSaveTemplate = document.getElementById('btnSaveTemplate');
const btnDeleteTemplate = document.getElementById('btnDeleteTemplate');

const fileDropZone = document.getElementById('fileDropZone');
const contactsFileInput = document.getElementById('contactsFileInput');
const uploadFeedback = document.getElementById('uploadFeedback');
const uploadedFileName = document.getElementById('uploadedFileName');
const contactsCount = document.getElementById('contactsCount');
const contactsPreviewGroup = document.getElementById('contactsPreviewGroup');
const contactsPreviewBox = document.getElementById('contactsPreviewBox');

const delayMinInput = document.getElementById('delayMin');
const delayMaxInput = document.getElementById('delayMax');
const sleepAfterInput = document.getElementById('sleepAfter');
const sleepDurationInput = document.getElementById('sleepDuration');
const scheduledTimeInput = document.getElementById('scheduledTimeInput');
const safetyIndicator = document.getElementById('safetyIndicator');

function updateSafetyIndicator() {
  if (!safetyIndicator || !delayMinInput || !delayMaxInput) return;
  const min = parseInt(delayMinInput.value) || 0;
  const max = parseInt(delayMaxInput.value) || 0;
  const avg = (min + max) / 2;

  if (avg < 5) {
    safetyIndicator.innerText = '⚠️ Berbahaya';
    safetyIndicator.style.background = 'rgba(239, 68, 68, 0.15)';
    safetyIndicator.style.color = '#ef4444';
    safetyIndicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else if (avg < 15) {
    safetyIndicator.innerText = '⚡ Risiko Sedang';
    safetyIndicator.style.background = 'rgba(245, 158, 11, 0.15)';
    safetyIndicator.style.color = '#f59e0b';
    safetyIndicator.style.border = '1px solid rgba(245, 158, 11, 0.3)';
  } else {
    safetyIndicator.innerText = '🛡️ Sangat Aman';
    safetyIndicator.style.background = 'rgba(16, 185, 129, 0.15)';
    safetyIndicator.style.color = '#10b981';
    safetyIndicator.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  }
}

// Initial update and event listeners
if (delayMinInput && delayMaxInput) {
  delayMinInput.addEventListener('input', updateSafetyIndicator);
  delayMaxInput.addEventListener('input', updateSafetyIndicator);
  updateSafetyIndicator();
}


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

// Media Attachment UI Elements
const mediaDropZone = document.getElementById('mediaDropZone');
const mediaFileInput = document.getElementById('mediaFileInput');
const mediaUploadFeedback = document.getElementById('mediaUploadFeedback');

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
const filterPhonebook = document.getElementById('filterPhonebook');
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
let uploadedMediaFiles = []; // Store media files metadata

// Active WA selection state
let activeTab = 'upload'; // 'upload' or 'whatsapp'
let rawWAData = []; // Array of active chats fetched from API
let phonebookData = []; // Store fetched phonebook contacts
let selectedChats = new Set(); // Set of serialized chat IDs that are checked
let waFilter = 'all'; // 'all', 'private', 'groups', 'phonebook'
let waSearchQuery = '';

// Chart.js & Read Receipts Stats
let campaignChart = null;
let ackStats = { sent: 0, delivered: 0, read: 0 };

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
      if (connectionResetZone) connectionResetZone.style.display = 'none';
    } else if (status.state === 'authenticated') {
      statusDot.classList.add('dot-connecting');
      statusText.innerText = 'Connecting...';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
      qrPlaceholder.style.display = 'flex';
      qrPlaceholder.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin spinner-icon"></i>
        <p>Autentikasi Berhasil. Menghubungkan & sinkronisasi chat...</p>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">Jika proses ini stuck lebih dari 2 menit, silakan klik tombol <strong>Reset Sesi</strong> di kiri bawah.</p>
      `;
      qrcodeContainer.innerHTML = '';
      if (connectionResetZone) connectionResetZone.style.display = 'block';
    } else if (status.state === 'initializing') {
      statusDot.classList.add('dot-connecting');
      statusText.innerText = 'Initializing...';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
      qrPlaceholder.style.display = 'flex';
      qrPlaceholder.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin spinner-icon"></i>
        <p>Menunggu QR Code dari server...</p>
      `;
      qrcodeContainer.innerHTML = '';
      if (connectionResetZone) connectionResetZone.style.display = 'block';
    } else {
      statusDot.classList.add('dot-disconnected');
      statusText.innerText = 'Disconnected';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> Offline';
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
      if (connectionResetZone) connectionResetZone.style.display = 'block';
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
      templateNameInput.value = name;
      btnDeleteTemplate.removeAttribute('disabled');
      addLogLine('info', `Loaded template: ${name}`);
    }
  } catch (err) {
    console.error('Error loading template content:', err);
  }
}

// Save template button
btnSaveTemplate.addEventListener('click', async () => {
  const name = templateNameInput.value.trim();
  const content = messageTemplate.value.trim();
  if (!name || !content) {
    alert('Nama template dan isi pesan tidak boleh kosong.');
    return;
  }
  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content })
    });
    const data = await res.json();
    if (data.success) {
      addLogLine('success', `Template "${name}" berhasil disimpan ke database.`);
      loadTemplates();
      btnDeleteTemplate.removeAttribute('disabled');
    } else {
      alert('Gagal menyimpan template: ' + data.error);
    }
  } catch (err) {
    console.error('Error saving template:', err);
  }
});

// Delete template button
btnDeleteTemplate.addEventListener('click', async () => {
  const name = templateNameInput.value.trim();
  if (!name) return;
  if (!confirm(`Apakah Anda yakin ingin menghapus template "${name}"?`)) return;
  try {
    const res = await fetch(`/api/templates/${name}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      addLogLine('success', `Template "${name}" berhasil dihapus.`);
      messageTemplate.value = '';
      templateNameInput.value = '';
      btnDeleteTemplate.setAttribute('disabled', 'true');
      loadTemplates();
    } else {
      alert('Gagal menghapus template: ' + data.error);
    }
  } catch (err) {
    console.error('Error deleting template:', err);
  }
});

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
      data.reports.forEach(report => {
        const reportName = typeof report === 'object' ? report.name : report;
        const li = document.createElement('li');
        li.className = 'report-item';
        li.innerHTML = `
          <span>${reportName}</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <a href="/api/reports/${reportName}" class="btn-download-report" title="Unduh Laporan" download style="color: var(--color-primary); cursor: pointer;">
              <i class="fa-solid fa-download"></i>
            </a>
            <button class="btn-delete-report" data-name="${reportName}" title="Hapus Laporan" style="color: var(--text-muted); background: transparent; border: none; cursor: pointer; transition: var(--transition);">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
        
        // Add delete listener
        li.querySelector('.btn-delete-report').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteReport(reportName);
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

// 3. File Upload handling (XLSX, CSV, TXT)
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
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';
        row.style.gap = '2px';
        row.style.padding = '8px 12px';

        let varsBadge = '';
        if (item.variables) {
          const varKeys = Object.keys(item.variables).filter(k => {
            const kl = k.toLowerCase();
            return kl !== 'phone' && kl !== 'name' && !kl.includes('phone') && !kl.includes('nomor') && !kl.includes('telp') && !kl.includes('hp') && !kl.includes('nama');
          });
          if (varKeys.length > 0) {
            varsBadge = `<div class="preview-vars" style="font-size: 0.75rem; opacity: 0.7; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">` + 
              varKeys.map(k => `<span style="background: rgba(0, 242, 254, 0.08); border: 1px solid rgba(0, 242, 254, 0.15); padding: 2px 6px; border-radius: 4px; color: var(--color-primary);">{${k}}: ${item.variables[k]}</span>`).join('') + 
              `</div>`;
          }
        }

        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <span class="preview-num">${item.number}</span>
            <span class="preview-name">${item.name || '<i style="opacity:0.5">No Name</i>'}</span>
          </div>
          ${varsBadge}
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

// 3.1 Media Attachment Drag-and-Drop and Click Handler
mediaDropZone.addEventListener('click', () => mediaFileInput.click());
mediaFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (uploadedMediaFiles.length >= 10) {
        alert('Maksimal 10 file gambar yang dapat diunggah.');
        break;
      }
      await handleMediaUpload(file);
    }
  }
});

mediaDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  mediaDropZone.style.borderColor = 'var(--color-primary)';
});

mediaDropZone.addEventListener('dragleave', () => {
  mediaDropZone.style.borderColor = 'var(--border-card)';
});

mediaDropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  mediaDropZone.style.borderColor = 'var(--border-card)';
  if (e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (uploadedMediaFiles.length >= 10) {
        alert('Maksimal 10 file gambar yang dapat diunggah.');
        break;
      }
      await handleMediaUpload(file);
    }
  }
});

function renderUploadedMedia() {
  if (uploadedMediaFiles.length === 0) {
    mediaUploadFeedback.style.display = 'none';
    mediaDropZone.style.display = 'block';
    return;
  }

  mediaUploadFeedback.innerHTML = '';
  uploadedMediaFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '4px 0';
    item.style.borderBottom = index < uploadedMediaFiles.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none';
    item.innerHTML = `
      <span>
        <i class="fa-solid fa-circle-check" style="color: var(--color-primary); margin-right: 5px;"></i>
        Terlampir: <strong>${file.originalName}</strong>
      </span>
      <button type="button" class="btn-remove-media-item" data-index="${index}" style="background: transparent; border: none; color: var(--color-danger); cursor: pointer; font-size: 0.8rem;">
        <i class="fa-solid fa-times"></i> Hapus
      </button>
    `;
    mediaUploadFeedback.appendChild(item);
  });

  // Attach event listener for delete buttons
  mediaUploadFeedback.querySelectorAll('.btn-remove-media-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(btn.getAttribute('data-index'));
      const removedFile = uploadedMediaFiles[index];
      uploadedMediaFiles.splice(index, 1);
      renderUploadedMedia();
      addLogLine('info', `Lampiran media dihapus: ${removedFile.originalName}`);
      mediaFileInput.value = ''; // Reset file input

      try {
        await fetch('/api/delete-media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ filePath: removedFile.filePath })
        });
      } catch (err) {
        console.error('Failed to delete media file from server:', err);
      }
    });
  });

  mediaUploadFeedback.style.display = 'flex';

  if (uploadedMediaFiles.length >= 10) {
    mediaDropZone.style.display = 'none';
  } else {
    mediaDropZone.style.display = 'block';
  }
}

async function handleMediaUpload(file) {
  // Check if file is image
  if (!file.type.startsWith('image/')) {
    alert(`File ${file.name} bukan file gambar.`);
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload-media', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      uploadedMediaFiles.push({
        filePath: data.filePath,
        originalName: data.originalName,
        mimeType: data.mimeType
      });
      renderUploadedMedia();
      addLogLine('success', `Gambar dilampirkan: ${file.name}`);
    } else {
      alert('Gagal mengunggah media: ' + data.error);
    }
  } catch (err) {
    console.error('Error uploading media:', err);
    alert('Terjadi kesalahan saat melampirkan media.');
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

  const delayMinVal = parseInt(delayMinInput.value) * 1000;
  const delayMaxVal = parseInt(delayMaxInput.value) * 1000;
  const sleepAfterVal = parseInt(sleepAfterInput.value);
  const sleepDurationVal = parseInt(sleepDurationInput.value) * 1000;
  
  // Scheduler parsing
  const scheduledAtVal = scheduledTimeInput.value ? new Date(scheduledTimeInput.value).toISOString() : null;

  const campaignData = {
    data: {
      numbers: loadedNumbers,
      textTemplate: template,
      textFileName: templateNameInput.value.trim() || 'web-campaign',
      numberFileName: uploadName,
      mediaPath: uploadedMediaFiles.length > 0 ? JSON.stringify(uploadedMediaFiles.map(f => f.filePath)) : null,
      mediaName: uploadedMediaFiles.length > 0 ? JSON.stringify(uploadedMediaFiles.map(f => f.originalName)) : null,
      mediaType: uploadedMediaFiles.length > 0 ? JSON.stringify(uploadedMediaFiles.map(f => f.mimeType)) : null
    },
    options: {
      delayMin: delayMinVal,
      delayMax: delayMaxVal,
      sleepAfter: sleepAfterVal,
      sleepDuration: sleepDurationVal,
      scheduledAt: scheduledAtVal,
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
    if (result.success) {
      if (scheduledAtVal) {
        alert(`Kampanye berhasil dijadwalkan pada: ${new Date(scheduledAtVal).toLocaleString()}`);
        addLogLine('success', `Kampanye dijadwalkan untuk: ${new Date(scheduledAtVal).toLocaleString()}`);
        // Clear schedule time input
        scheduledTimeInput.value = '';
      } else {
        // Immediate campaign progress starts (handled via sockets)
      }
    } else {
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
  if (confirm('Apakah Anda yakin ingin memutuskan sesi WhatsApp ini? Seluruh riwayat laporan dan data kampanye lama juga akan dihapus.')) {
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
      
      // Reset local frontend state
      rawWAData = [];
      phonebookData = [];
      selectedChats.clear();
      chkSelectAllChats.checked = false;
      renderWAConversations();
      
      // Clear chart and logs
      ackStats = { sent: 0, delivered: 0, read: 0 };
      updateAckUI();
      initChart();
      terminalLogs.innerHTML = '';
      
      // Reload lists (reports and templates)
      loadTemplates();
      loadReports();
      addLogLine('success', 'Sesi WhatsApp berhasil diputuskan. Seluruh riwayat laporan dan data kampanye lama telah dihapus.');
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  }
});

if (btnResetSession) {
  btnResetSession.addEventListener('click', async () => {
    if (confirm('Apakah Anda yakin ingin mereset sesi WhatsApp ini? File sesi lama akan dihapus dan Anda harus memindai (scan) ulang kode QR baru.')) {
      statusDot.className = 'status-dot dot-connecting';
      statusText.innerText = 'Resetting...';
      headerStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
      
      if (connectionResetZone) connectionResetZone.style.display = 'none';
      
      authSection.style.display = 'block';
      campaignSection.style.display = 'none';
      qrPlaceholder.style.display = 'flex';
      qrcodeContainer.innerHTML = '';
      
      try {
        await fetch('/api/disconnect', { method: 'POST' });
        
        // Reset local frontend state
        rawWAData = [];
        phonebookData = [];
        selectedChats.clear();
        chkSelectAllChats.checked = false;
        renderWAConversations();
        
        // Clear chart and logs
        ackStats = { sent: 0, delivered: 0, read: 0 };
        updateAckUI();
        initChart();
        terminalLogs.innerHTML = '';
        
        // Reload lists (reports and templates)
        loadTemplates();
        loadReports();
        addLogLine('success', 'Sesi WhatsApp berhasil direset. Silakan pindai ulang kode QR baru.');
      } catch (err) {
        console.error('Error resetting session:', err);
      }
    }
  });
}

btnClearTerminal.addEventListener('click', () => {
  terminalLogs.innerHTML = '';
});

// 4.2 Chart.js Setup and Visualization logic
function initChart() {
  const ctx = document.getElementById('campaignChart').getContext('2d');
  if (campaignChart) {
    campaignChart.destroy();
  }
  campaignChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Sukses', 'Gagal', 'Pending'],
      datasets: [{
        data: [0, 0, 1], // default look (all grey pending)
        backgroundColor: ['#25d366', '#ef4444', 'rgba(255, 255, 255, 0.05)'],
        hoverBackgroundColor: ['#20ba5a', '#dc2626', 'rgba(255, 255, 255, 0.1)'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '75%'
    }
  });
}

function updateChartVisuals(success, failed, total) {
  const pending = Math.max(0, total - (success + failed));
  if (campaignChart) {
    campaignChart.data.datasets[0].data = [success, failed, pending];
    campaignChart.update();
  }
}

function updateAckUI() {
  document.getElementById('legendSent').innerText = ackStats.sent;
  document.getElementById('legendDelivered').innerText = ackStats.delivered;
  document.getElementById('legendRead').innerText = ackStats.read;
}

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
    
    // Reset analytics and charts
    ackStats = { sent: 0, delivered: 0, read: 0 };
    updateAckUI();
    initChart();
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
  
  updateChartVisuals(data.success, data.failed, data.total);
});

socket.on('campaign_log', (data) => {
  addLogLine(data.type, data.message);
});

// Socket listener for read receipts (ack updates)
socket.on('message_ack', (data) => {
  // ack values: 2 = server (sent), 3 = device (delivered), 4 = read (blue ticks)
  if (data.ack === 2) {
    ackStats.sent++;
    addLogLine('info', `[Sent] Pesan terkirim ke server WhatsApp`);
  } else if (data.ack === 3) {
    ackStats.delivered++;
    addLogLine('info', `[Delivered] Pesan terkirim ke HP penerima`);
  } else if (data.ack === 4) {
    ackStats.read++;
    addLogLine('success', `[Read] Pesan telah dibaca oleh penerima`);
  }
  updateAckUI();
});

function addLogLine(type, message) {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString('id-ID');
  line.innerText = `[${timestamp}] ${message}`;
  
  terminalLogs.appendChild(line);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

function toggleInputs(disabled) {
  const elements = [
    messageTemplate,
    templateNameInput,
    btnSaveTemplate,
    contactsFileInput,
    manualNumbersInput,
    delayMinInput,
    delayMaxInput,
    sleepAfterInput,
    sleepDurationInput,
    scheduledTimeInput,
    useSpintax,
    useDynamicVars,
    useEmoji,
    useWhitespace,
    useRandomSuffix
  ];

  elements.forEach(el => {
    if (el) {
      if (disabled) {
        el.setAttribute('disabled', 'true');
      } else {
        el.removeAttribute('disabled');
      }
    }
  });

  if (disabled) {
    fileDropZone.style.pointerEvents = 'none';
    fileDropZone.style.opacity = '0.5';
    mediaDropZone.style.pointerEvents = 'none';
    mediaDropZone.style.opacity = '0.5';
  } else {
    fileDropZone.style.pointerEvents = 'auto';
    fileDropZone.style.opacity = '1';
    mediaDropZone.style.pointerEvents = 'auto';
    mediaDropZone.style.opacity = '1';
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

// Load all phonebook contacts from WhatsApp
async function fetchPhonebookContacts() {
  if (!currentStatus.ready) return;

  loadWAIcon.classList.add('fa-spin');
  btnLoadWAData.setAttribute('disabled', 'true');
  
  try {
    const res = await fetch('/api/contacts');
    const data = await res.json();
    if (data.success) {
      phonebookData = data.contacts;
      selectedChats.clear();
      chkSelectAllChats.checked = false;
      renderWAConversations();
      addLogLine('success', `Berhasil memuat ${data.contacts.length} kontak dari buku telepon WhatsApp.`);
    } else {
      addLogLine('error', `Gagal memuat buku kontak: ${data.error}`);
    }
  } catch (err) {
    console.error('Error fetching phonebook contacts:', err);
    addLogLine('error', 'Gagal memuat buku kontak. Periksa koneksi.');
  } finally {
    loadWAIcon.classList.remove('fa-spin');
    btnLoadWAData.removeAttribute('disabled');
  }
}

// Render list of WA conversations
function renderWAConversations() {
  waChatsList.innerHTML = '';
  
  // Pilih sumber data berdasarkan filter (Chat Aktif vs Buku Kontak)
  const sourceData = waFilter === 'phonebook' ? phonebookData : rawWAData;
  
  // Apply Search and Filters
  const filtered = sourceData.filter(chat => {
    // Hanya apply filter pribadi/grup jika bukan tab phonebook
    if (waFilter !== 'phonebook') {
      if (waFilter === 'private' && chat.isGroup) return false;
      if (waFilter === 'groups' && !chat.isGroup) return false;
    }
    
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
    
    const cleanId = chat.id.split('@')[0];
    const displayNum = chat.displayId || cleanId;
    const isLid = chat.id && (chat.id.endsWith('@lid') || (cleanId.startsWith('1') && cleanId.length >= 13));
    
    const initials = (chat.name || '?').substring(0, 2).toUpperCase();
    const badgeClass = chat.isGroup ? 'wa-badge-group' : (isLid ? 'wa-badge-lid' : 'wa-badge-private');
    const badgeText = chat.isGroup ? 'Group' : (isLid ? 'LID (Abaikan)' : 'Pribadi');

    item.innerHTML = `
      <div class="wa-chat-left" style="${isLid ? 'opacity: 0.6;' : ''}">
        <label class="checkbox-container">
          <input type="checkbox" class="wa-chat-checkbox" data-id="${chat.id}" ${isChecked ? 'checked' : ''} ${isLid ? 'disabled' : ''}>
          <span class="checkmark"></span>
        </label>
        <div class="wa-chat-avatar" style="${isLid ? 'background: #2a1515; color: #ef4444;' : ''}">${initials}</div>
        <div class="wa-chat-info">
          <div class="wa-chat-name" title="${chat.name || ''}">${chat.name || displayNum} ${isLid ? '<span style="font-size:0.75rem; color:#ef4444; font-style:italic;">(LID)</span>' : ''}</div>
          <div class="wa-chat-details">${displayNum}</div>
        </div>
      </div>
      <div class="wa-badge ${badgeClass}">${badgeText}</div>
    `;

    // Checkbox toggle listener
    const checkbox = item.querySelector('.wa-chat-checkbox');
    if (checkbox && !isLid) {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedChats.add(chat.id);
        } else {
          selectedChats.delete(chat.id);
        }
        
        // Update counts and selections
        selectedChatsCount.innerText = selectedChats.size;
        updateCampaignButtonForWA();
        
        // check if all filtered non-LIDs are checked
        const nonLidFiltered = filtered.filter(c => {
          const cClean = c.id.split('@')[0];
          return !(c.id.endsWith('@lid') || (cClean.startsWith('1') && cClean.length >= 13));
        });
        const allFilteredChecked = nonLidFiltered.length > 0 && nonLidFiltered.every(c => selectedChats.has(c.id));
        chkSelectAllChats.checked = allFilteredChecked;
      });
    }

    waChatsList.appendChild(item);
  });

  // Handle Select All Checkbox State (ignoring LIDs)
  const nonLidFiltered = filtered.filter(c => {
    const cClean = c.id.split('@')[0];
    return !(c.id.endsWith('@lid') || (cClean.startsWith('1') && cClean.length >= 13));
  });
  const allChecked = nonLidFiltered.length > 0 && nonLidFiltered.every(c => selectedChats.has(c.id));
  chkSelectAllChats.checked = allChecked;
}

// Select All visible chats toggle
chkSelectAllChats.addEventListener('change', (e) => {
  const isChecked = e.target.checked;
  const sourceData = waFilter === 'phonebook' ? phonebookData : rawWAData;
  
  // Find currently filtered chats
  const filtered = sourceData.filter(chat => {
    if (waFilter !== 'phonebook') {
      if (waFilter === 'private' && chat.isGroup) return false;
      if (waFilter === 'groups' && !chat.isGroup) return false;
    }
    if (waSearchQuery) {
      const q = waSearchQuery.toLowerCase();
      return (chat.name && chat.name.toLowerCase().includes(q)) || (chat.id && chat.id.toLowerCase().includes(q));
    }
    return true;
  });

  filtered.forEach(chat => {
    if (isChecked) {
      const cleanId = chat.id.split('@')[0];
      const isLid = chat.id && (chat.id.endsWith('@lid') || (cleanId.startsWith('1') && cleanId.length >= 13));
      if (!isLid) {
        selectedChats.add(chat.id);
      }
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

filterPhonebook.addEventListener('click', async () => {
  waFilter = 'phonebook';
  setActiveFilterPill(filterPhonebook);
  if (phonebookData.length === 0 && currentStatus.ready) {
    await fetchPhonebookContacts();
  } else {
    renderWAConversations();
  }
});

function setActiveFilterPill(activePill) {
  [filterAll, filterPrivate, filterGroups, filterPhonebook].forEach(pill => {
    if (pill) pill.classList.remove('active');
  });
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
        let chat = rawWAData.find(c => c.id === id);
        if (!chat) {
          chat = phonebookData.find(c => c.id === id);
        }
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
      
      const cleanOrigId = origJid.split('@')[0];
      if (!chat.name || chat.name === cleanOrigId) {
        chat.name = updates[origJid].name || updates[origJid].displayId;
      }
    }
  });

  // Dynamically update the mapping for already selected chats
  Object.keys(updates).forEach(lidJid => {
    const data = updates[lidJid];
    if (selectedChats.has(lidJid)) {
      selectedChats.delete(lidJid);
      selectedChats.add(data.targetJid);
    }
  });

  // Re-render everything to update badges, checkboxes, event listeners, and styles
  renderWAConversations();
  updateCampaignButtonForWA();
});

// Initial Boot
loadTemplates();
loadReports();
loadBlacklist();
initChart();
updateAckUI();
