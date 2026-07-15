const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const xlsx = require('xlsx');

const config = require('./config');
const logger = require('./logger');
const WhatsAppClient = require('./whatsapp');
const WebBlastManager = require('./web-blast');
const { ensureDirectories } = require('./utils');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Setup Multer for contacts and media
const upload = multer({ dest: 'uploads/' });
const mediaUpload = multer({ dest: 'uploads/media/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads', 'media')
]);

// Sync physical templates to SQLite on startup if DB is empty
async function syncTemplatesToDb() {
  try {
    const dbTemplates = await db.getTemplates();
    if (dbTemplates.length === 0) {
      logger.info('Templates table is empty. Syncing files from textlist directory to database...');
      const { getFilesList } = require('./utils');
      const fileTemplates = getFilesList(config.directories.textlist);
      for (const name of fileTemplates) {
        const filePath = path.join(config.directories.textlist, `${name}.txt`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          await db.saveTemplate(name, content);
        }
      }
      logger.info(`Synced ${fileTemplates.length} templates to database.`);
    }
  } catch (err) {
    logger.error('Error syncing templates to database:', err);
  }
}

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

  // Intercept read receipts (message_ack)
  whatsappClient.on('message_ack', async (data) => {
    try {
      await db.updateRecipientAck(data.msgId, data.ack);
      io.emit('message_ack', data);
    } catch (err) {
      logger.error('Error handling message_ack database update:', err);
    }
  });

  try {
    logger.info('Initializing WhatsApp client...');
    await whatsappClient.initialize();
    blastManager = new WebBlastManager(whatsappClient, io);
    
    // Start campaign scheduler loop
    startScheduler();
    
    // Sync local templates to SQLite database
    await syncTemplatesToDb();
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

// Get all phonebook contacts from WhatsApp
app.get('/api/contacts', async (req, res) => {
  try {
    if (!whatsappClient.isReady) {
      return res.status(400).json({ success: false, error: 'WhatsApp client is not ready' });
    }
    const contacts = await whatsappClient.getPhonebookContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    logger.error('Error fetching phonebook contacts via API:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get blacklist list (From SQLite)
app.get('/api/blacklist', async (req, res) => {
  try {
    const list = await db.getBlacklist();
    res.json({ success: true, blacklist: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add to blacklist manually (To SQLite)
app.post('/api/blacklist', async (req, res) => {
  const { number } = req.body;
  if (!number) {
    return res.status(400).json({ success: false, error: 'Number is required' });
  }
  try {
    const success = await db.addToBlacklist(number, 'Manual Admin Input');
    if (success) {
      io.emit('blacklist_updated', { action: 'add', number });
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Invalid number or already blacklisted' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove from blacklist manually (From SQLite)
app.delete('/api/blacklist/:number', async (req, res) => {
  const { number } = req.params;
  try {
    const success = await db.removeFromBlacklist(number);
    if (success) {
      io.emit('blacklist_updated', { action: 'remove', number });
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Number not found in blacklist' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// Upload contact number list file (Supports CSV, XLSX, XLS, TXT)
app.post('/api/upload-contacts', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  
  try {
    const numbers = [];
    const { parseNumberLine } = require('./utils');

    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(worksheet);

      if (rows.length > 0) {
        // Retrieve columns/headers
        const keys = Object.keys(rows[0]);
        
        // Find phone key dynamically
        let phoneKey = keys.find(k => {
          const kl = k.toString().toLowerCase();
          return kl.includes('phone') || kl.includes('nomor') || kl.includes('telp') || kl.includes('hp') || kl.includes('contact') || kl.includes('wa') || kl.includes('whatsapp') || kl === 'no';
        });
        if (!phoneKey) phoneKey = keys[0]; // default to first column

        // Find name key dynamically
        let nameKey = keys.find(k => {
          const kl = k.toString().toLowerCase();
          return kl.includes('name') || kl.includes('nama') || kl.includes('customer') || kl.includes('client') || kl.includes('penerima');
        });
        if (!nameKey) nameKey = keys[1] || null; // default to second column

        rows.forEach(row => {
          let phoneVal = row[phoneKey] ? row[phoneKey].toString().trim() : '';
          let nameVal = nameKey && row[nameKey] ? row[nameKey].toString().trim() : null;

          if (phoneVal.endsWith('.0')) {
            phoneVal = phoneVal.substring(0, phoneVal.length - 2);
          }

          const digits = phoneVal.replace(/\D/g, '');
          if (digits.length >= 9) {
            // Collect all key-value variables
            const variables = {};
            keys.forEach(k => {
              variables[k] = row[k] !== undefined && row[k] !== null ? row[k].toString().trim() : '';
            });

            numbers.push({ 
              number: digits, 
              name: nameVal, 
              variables: variables 
            });
          }
        });
      }
    } else {
      // Default plain text parser (.txt)
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');
      lines.forEach(line => {
        const item = parseNumberLine(line);
        if (item) {
          numbers.push({
            number: item.number,
            name: item.name,
            variables: item.name ? { name: item.name } : null
          });
        }
      });
    }

    // Delete temporary file
    fs.unlinkSync(filePath);

    res.json({ 
      success: true, 
      numbers, 
      filename: req.file.originalname.substring(0, req.file.originalname.lastIndexOf('.'))
    });
  } catch (error) {
    logger.error('Error parsing contacts file:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload media attachment file
app.post('/api/upload-media', mediaUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No media file uploaded' });
  }
  res.json({
    success: true,
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype
  });
});

// Get list of templates (From DB)
app.get('/api/templates', async (req, res) => {
  try {
    const list = await db.getTemplates();
    res.json({ success: true, templates: list.map(t => t.name) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get content of a specific template (From DB)
app.get('/api/templates/:name', async (req, res) => {
  try {
    const template = await db.getTemplate(req.params.name);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, content: template.content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create or update template (CRUD)
app.post('/api/templates', async (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) {
    return res.status(400).json({ success: false, error: 'Name and content are required' });
  }
  try {
    await db.saveTemplate(name, content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete template (CRUD)
app.delete('/api/templates/:name', async (req, res) => {
  try {
    const success = await db.deleteTemplate(req.params.name);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Template not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

    const { data, options } = req.body;
    if (!data || !data.numbers || !data.textTemplate) {
      return res.status(400).json({ success: false, error: 'Numbers and message template are required' });
    }

    const isScheduled = options.scheduledAt ? true : false;

    // Create campaign in SQLite database
    const campaignId = await db.createCampaign({
      name: data.numberFileName || `Campaign_${Date.now()}`,
      template_text: data.textTemplate,
      media_path: data.mediaPath || null,
      media_name: data.mediaName || null,
      media_type: data.mediaType || null,
      status: isScheduled ? 'scheduled' : 'running',
      delay_min: parseInt(options.delayMin) || 3000,
      delay_max: parseInt(options.delayMax) || 3000,
      sleep_after: parseInt(options.sleepAfter) || 0,
      sleep_duration: parseInt(options.sleepDuration) || 0,
      use_spintax: options.messageVariation.useSpintax ? 1 : 0,
      use_emoji: options.messageVariation.useEmoji ? 1 : 0,
      use_whitespace: options.messageVariation.useWhitespace ? 1 : 0,
      use_dynamic_vars: options.messageVariation.useDynamicVars ? 1 : 0,
      use_random_suffix: options.messageVariation.useRandomSuffix ? 1 : 0,
      scheduled_at: options.scheduledAt || null
    });

    // Save all recipients to SQLite
    for (const num of data.numbers) {
      await db.addCampaignRecipient(campaignId, num);
    }

    if (isScheduled) {
      logger.info(`Campaign ${campaignId} scheduled for: ${options.scheduledAt}`);
      return res.json({ success: true, message: 'Campaign scheduled successfully', campaignId });
    }

    if (blastManager.isRunning) {
      await db.updateCampaignStatus(campaignId, 'queued');
      return res.status(400).json({ success: false, error: 'Another campaign is already running. Saved as queued.' });
    }

    // Run campaign in background
    blastManager.startCampaign(campaignId, data, options).catch(err => {
      logger.error('Campaign background error:', err);
    });

    res.json({ success: true, message: 'Campaign started', campaignId });
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

// Campaign Scheduler checking loop (runs every 30 seconds)
function startScheduler() {
  logger.info('Scheduler started: Checking for pending campaigns every 30s...');
  setInterval(async () => {
    try {
      if (!whatsappClient.isReady || !blastManager || blastManager.isRunning) {
        return;
      }
      
      const nowStr = new Date().toISOString();
      // Find campaign that is scheduled and due
      const pendingCampaign = await db.dbGet(
        `SELECT * FROM campaigns WHERE status = 'scheduled' AND datetime(scheduled_at) <= datetime(?) LIMIT 1`,
        [nowStr]
      );

      if (pendingCampaign) {
        logger.info(`Scheduler: Triggering scheduled campaign ID ${pendingCampaign.id} ("${pendingCampaign.name}")...`);
        
        // Fetch recipients
        const recipientsRows = await db.dbAll(
          'SELECT id, number, name, variables FROM recipients WHERE campaign_id = ?',
          [pendingCampaign.id]
        );

        const data = {
          numbers: recipientsRows.map(row => ({
            id: row.id,
            number: row.number,
            name: row.name,
            variables: row.variables ? JSON.parse(row.variables) : null
          })),
          textTemplate: pendingCampaign.template_text,
          numberFileName: pendingCampaign.name,
          mediaPath: pendingCampaign.media_path,
          mediaName: pendingCampaign.media_name,
          mediaType: pendingCampaign.media_type
        };

        const options = {
          delayMin: pendingCampaign.delay_min,
          delayMax: pendingCampaign.delay_max,
          sleepAfter: pendingCampaign.sleep_after,
          sleepDuration: pendingCampaign.sleep_duration,
          messageVariation: {
            useSpintax: pendingCampaign.use_spintax === 1,
            useEmoji: pendingCampaign.use_emoji === 1,
            useWhitespace: pendingCampaign.use_whitespace === 1,
            useDynamicVars: pendingCampaign.use_dynamic_vars === 1,
            useRandomSuffix: pendingCampaign.use_random_suffix === 1
          }
        };

        // Update status to running
        await db.updateCampaignStatus(pendingCampaign.id, 'running');

        // Run
        blastManager.startCampaign(pendingCampaign.id, data, options).catch(err => {
          logger.error('Campaign background error (Scheduler):', err);
        });
      }
    } catch (err) {
      logger.error('Error in Scheduler loop:', err);
    }
  }, 30000);
}

// Start Express server
server.listen(PORT, () => {
  console.log(chalk.green(`\n✓ Web Dashboard Server listening on http://localhost:${PORT}`));
  logger.info(`Web Server started on port ${PORT}`);
  
  // Start WhatsApp client connection
  initWhatsApp();
});
