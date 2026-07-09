const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const config = require('./config');
const logger = require('./logger');
const WhatsAppClient = require('./whatsapp');
const WebBlastManager = require('./web-blast');
const { ensureDirectories } = require('./utils');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state
let whatsappClient = new WhatsAppClient();
let blastManager = null;
let currentQr = null;
let lastStatus = { state: 'disconnected', ready: false };

// Initialize directories
ensureDirectories([
  config.directories.numberlist,
  config.directories.textlist,
  config.directories.report,
  config.logging.filePath,
  path.join(__dirname, 'uploads')
]);

async function initWhatsApp() {
  currentQr = null;
  lastStatus = { state: 'initializing', ready: false };
  io.emit('status', lastStatus);

  whatsappClient.on('qr', (qr) => {
    currentQr = qr;
    lastStatus = { state: 'scanning', ready: false };
    io.emit('qr', qr);
    io.emit('status', lastStatus);
  });

  whatsappClient.on('authenticated', () => {
    currentQr = null;
    lastStatus = { state: 'authenticated', ready: false };
    io.emit('authenticated');
    io.emit('status', lastStatus);
  });

  whatsappClient.on('ready', async () => {
    currentQr = null;
    const info = await whatsappClient.getClientInfo();
    lastStatus = { 
      state: 'ready', 
      ready: true, 
      info: info ? { name: info.pushname, phone: info.wid.user } : null 
    };
    io.emit('status', lastStatus);
  });

  whatsappClient.on('disconnected', (reason) => {
    currentQr = null;
    lastStatus = { state: 'disconnected', ready: false, reason };
    io.emit('status', lastStatus);
  });

  whatsappClient.on('blacklist_updated', (data) => {
    io.emit('blacklist_updated', data);
  });

  whatsappClient.on('chats_resolved', (updates) => {
    io.emit('chats_resolved', updates);
  });

  try {
    logger.info('Initializing WhatsApp client...');
    await whatsappClient.initialize();
    blastManager = new WebBlastManager(whatsappClient, io);
  } catch (error) {
    logger.error('Failed to initialize WhatsApp client:', error);
    lastStatus = { state: 'error', ready: false, error: error.message };
    io.emit('status', lastStatus);
  }
}

// Socket.io connections
io.on('connection', (socket) => {
  logger.info(`Socket client connected: ${socket.id}`);
  
  // Send current status immediately on connection
  socket.emit('status', lastStatus);
  if (currentQr) {
    socket.emit('qr', currentQr);
  }

  // If campaign is running, send current campaign progress/status
  if (blastManager) {
    socket.emit('campaign_status', {
      status: blastManager.isRunning ? (blastManager.isPaused ? 'paused' : 'running') : 'idle',
      total: blastManager.currentCampaign ? blastManager.currentCampaign.total : 0,
      success: blastManager.statistics.success,
      failed: blastManager.statistics.failed
    });
  }

  socket.on('disconnect', () => {
    logger.info(`Socket client disconnected: ${socket.id}`);
  });
});

// API Routes

// Connection status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: lastStatus,
    qr: currentQr,
    campaign: blastManager ? {
      isRunning: blastManager.isRunning,
      isPaused: blastManager.isPaused,
      isCancelled: blastManager.isCancelled,
      statistics: blastManager.statistics
    } : null
  });
});

// Get active WhatsApp chats
app.get('/api/chats', async (req, res) => {
  try {
    if (!whatsappClient.isReady) {
      return res.status(400).json({ success: false, error: 'WhatsApp client is not ready' });
    }
    const chats = await whatsappClient.getActiveChats();
    res.json({ success: true, chats });
  } catch (error) {
    logger.error('Error fetching active chats via API:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get blacklist list
app.get('/api/blacklist', (req, res) => {
  const { getBlacklist } = require('./utils');
  res.json({ success: true, blacklist: getBlacklist() });
});

// Add to blacklist manually
app.post('/api/blacklist', (req, res) => {
  const { number } = req.body;
  if (!number) {
    return res.status(400).json({ success: false, error: 'Number is required' });
  }
  const { addToBlacklist } = require('./utils');
  const success = addToBlacklist(number);
  
  if (success) {
    io.emit('blacklist_updated', { action: 'add', number });
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Invalid number or already blacklisted' });
  }
});

// Remove from blacklist manually
app.delete('/api/blacklist/:number', (req, res) => {
  const { number } = req.params;
  const { removeFromBlacklist } = require('./utils');
  const success = removeFromBlacklist(number);
  
  if (success) {
    io.emit('blacklist_updated', { action: 'remove', number });
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Number not found in blacklist' });
  }
});

// Disconnect WhatsApp session
app.post('/api/disconnect', async (req, res) => {
  try {
    logger.info('Disconnecting/Logging out WhatsApp client by user request...');
    await whatsappClient.logout();
    
    // Create new instance and re-initialize
    whatsappClient = new WhatsAppClient();
    initWhatsApp();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error disconnecting client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload contact number list file
app.post('/api/upload-contacts', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    const numbers = [];

    const { parseNumberLine } = require('./utils');

    lines.forEach(line => {
      const item = parseNumberLine(line);
      if (item) {
        numbers.push(item);
      }
    });

    // Delete temporary file
    fs.unlinkSync(filePath);

    res.json({ 
      success: true, 
      numbers, 
      filename: req.file.originalname.replace('.txt', '') 
    });
  } catch (error) {
    logger.error('Error parsing contacts file:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get list of templates
app.get('/api/templates', (req, res) => {
  const { getFilesList } = require('./utils');
  const templates = getFilesList(config.directories.textlist);
  res.json({ success: true, templates });
});

// Get content of a specific template
app.get('/api/templates/:name', (req, res) => {
  const filePath = path.join(config.directories.textlist, `${req.params.name}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ success: true, content });
});

// Get list of reports
app.get('/api/reports', (req, res) => {
  const { getFilesList } = require('./utils');
  const reports = getFilesList(config.directories.report);
  res.json({ success: true, reports });
});

// Download a report
app.get('/api/reports/:name', (req, res) => {
  const filePath = path.join(config.directories.report, `${req.params.name}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Report not found' });
  }
  res.download(filePath);
});

// Delete a report
app.delete('/api/reports/:name', (req, res) => {
  const name = req.params.name;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid file name' });
  }

  const filePath = path.join(config.directories.report, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Report not found' });
  }
  
  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting report file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Campaign control routes
app.post('/api/start-campaign', async (req, res) => {
  try {
    if (!whatsappClient.isReady) {
      return res.status(400).json({ success: false, error: 'WhatsApp client is not ready' });
    }
    if (blastManager.isRunning) {
      return res.status(400).json({ success: false, error: 'A campaign is already running' });
    }

    const { data, options } = req.body;
    if (!data || !data.numbers || !data.textTemplate) {
      return res.status(400).json({ success: false, error: 'Numbers and message template are required' });
    }

    // Run campaign in background
    blastManager.startCampaign(data, options).catch(err => {
      logger.error('Campaign background error:', err);
    });

    res.json({ success: true, message: 'Campaign started' });
  } catch (error) {
    logger.error('Error starting campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pause-campaign', (req, res) => {
  if (!blastManager) return res.status(400).json({ success: false });
  const success = blastManager.pause();
  res.json({ success });
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/resume-campaign', (req, res) => {
  if (!blastManager) return res.status(400).json({ success: false });
  const success = blastManager.resume();
  res.json({ success });
});

app.post('/api/cancel-campaign', (req, res) => {
  if (!blastManager) return res.status(400).json({ success: false });
  const success = blastManager.cancel();
  res.json({ success });
});

// Start Express server
server.listen(PORT, () => {
  console.log(chalk.green(`\n✓ Web Dashboard Server listening on http://localhost:${PORT}`));
  logger.info(`Web Server started on port ${PORT}`);
  
  // Start WhatsApp client connection
  initWhatsApp();
});
