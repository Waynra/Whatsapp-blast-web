const EventEmitter = require('events');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const logger = require('./logger');
const { formatPhoneNumber, isValidPhoneNumber, sleep } = require('./utils');
const db = require('./db');

class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
    this.retryAttempts = config.whatsapp.maxRetryAttempts;
  }

  /**
   * Initialize WhatsApp client
   */
  initialize() {
    logger.info('Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: config.whatsapp.sessionPath
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
        strict: false
      },
      puppeteer: {
        headless: config.whatsapp.headlessMode,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.setupEventHandlers();
    return this.client.initialize();
  }

  /**
   * Setup event handlers for WhatsApp client
   */
  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      logger.info('QR Code received. Please scan with your phone.');
      qrcode.generate(qr, { small: true });
      this.emit('qr', qr);
    });

    this.client.on('authenticated', () => {
      logger.info('Authentication successful!');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('Authentication failure:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('WhatsApp client is ready!');
      this.emit('ready');
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      logger.warn('Client disconnected:', reason);
      this.emit('disconnected', reason);
    });

    this.client.on('change_state', (state) => {
      logger.debug('State changed:', state);
      this.emit('change_state', state);
    });

    this.client.on('message_ack', (msg, ack) => {
      this.emit('message_ack', { msgId: msg.id._serialized, ack });
    });

    this.client.on('message', async (msg) => {
      try {
        const body = (msg.body || '').trim().toUpperCase();
        if (body === 'STOP' && msg.from.endsWith('@c.us')) {
          const senderNum = msg.from.split('@')[0];
          const added = await db.addToBlacklist(senderNum, 'Opt-Out via STOP message');
          
          if (added) {
            logger.info(`Number auto-blacklisted from incoming STOP message: ${senderNum}`);
            this.emit('blacklist_updated', { action: 'add', number: senderNum });
            await msg.reply('Nomor Anda telah dimasukkan ke daftar blacklist. Anda tidak akan menerima pesan dari kami lagi.');
          }
        }
      } catch (error) {
        logger.error('Error handling incoming STOP message:', error);
      }
    });
  }

  /**
   * Wait for client to be ready
   * @returns {Promise<void>}
   */
  async waitForReady() {
    while (!this.isReady) {
      await sleep(1000);
    }
  }

  /**
   * Send message to a phone number with retry mechanism
   * @param {string} number - Phone number
   * @param {string} message - Message to send
   * @param {string|null} mediaPath - Path to media attachment file
   * @returns {Promise<{success: boolean, error?: string, msgId?: string}>}
   */
  async sendMessage(number, message, mediaPath = null) {
    let targetJid = number;

    // Safety cleanup: If number has double @c.us or mixed JIDs
    if (typeof targetJid === 'string' && targetJid.includes('@')) {
      const parts = targetJid.split('@');
      const cleanNum = parts[0];
      let server = 'c.us';
      if (targetJid.includes('@lid')) server = 'lid';
      else if (targetJid.includes('@g.us')) server = 'g.us';
      targetJid = `${cleanNum}@${server}`;
    }

    const isJid = typeof targetJid === 'string' && (targetJid.endsWith('@c.us') || targetJid.endsWith('@lid') || targetJid.endsWith('@g.us'));

    if (!isJid) {
      const formattedNumber = formatPhoneNumber(targetJid);

      // Validate phone number
      if (!isValidPhoneNumber(formattedNumber)) {
        logger.error(`Invalid phone number format: ${number}`);
        return { 
          success: false, 
          error: 'Invalid phone number format' 
        };
      }
      targetJid = formattedNumber;
    }

    // Check Blacklist from DB
    const blacklist = await db.getBlacklist();
    
    // Extract raw digits for blacklist checking
    const cleanNumber = typeof number === 'string' ? number.split('@')[0] : number;
    const formattedClean = formatPhoneNumber(cleanNumber);

    if (blacklist.includes(formattedClean) || (typeof number === 'string' && blacklist.includes(number))) {
      logger.warn(`Skipping blacklisted number: ${number}`);
      return {
        success: false,
        error: 'Number is blacklisted'
      };
    }

    let lastError = null;

    // Retry mechanism
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        let finalJid = targetJid;

        if (!finalJid.includes('@')) {
          // Get number ID
          const numberId = await this.client.getNumberId(finalJid);

          if (!numberId) {
            logger.warn(`Number not registered on WhatsApp: ${number}`);
            return { 
              success: false, 
              error: 'Number not registered on WhatsApp' 
            };
          }
          finalJid = numberId._serialized;
        }

        // Simulate Typing status for realistic human behavior (proportional to message length with random jitter)
        try {
          const chat = await this.client.getChatById(finalJid);
          if (chat) {
            await chat.sendStateTyping();
            // Estimate human typing speed: scale duration based on message length (12ms per char), between 1.5s and 6s
            const baseTypingMs = Math.min(6000, Math.max(1500, (message || '').length * 12));
            // Add jitter of +/- 500ms
            const jitterMs = Math.floor(Math.random() * 1000) - 500;
            const typingTime = Math.max(1000, baseTypingMs + jitterMs);
            await sleep(typingTime);
          }
        } catch (typingErr) {
          logger.debug(`Could not set typing state: ${typingErr.message}`);
        }

        // Send message with or without media
        let sentMessage;
        if (mediaPath) {
          let paths = [];
          if (Array.isArray(mediaPath)) {
            paths = mediaPath;
          } else if (typeof mediaPath === 'string' && mediaPath.trim().startsWith('[')) {
            try {
              paths = JSON.parse(mediaPath);
            } catch (e) {
              paths = [mediaPath];
            }
          } else {
            paths = [mediaPath];
          }

          if (paths.length > 0) {
            // Send the first media with the caption
            const media = MessageMedia.fromFilePath(paths[0]);
            sentMessage = await this.client.sendMessage(finalJid, media, { caption: message });
            
            // Send the remaining media files
            for (let j = 1; j < paths.length; j++) {
              try {
                // Add randomized delay between consecutive media (1s - 3.5s) to avoid robotic delivery triggers
                const mediaDelay = 1000 + Math.floor(Math.random() * 2500);
                await sleep(mediaDelay);
                const extraMedia = MessageMedia.fromFilePath(paths[j]);
                await this.client.sendMessage(finalJid, extraMedia);
              } catch (extraMediaErr) {
                logger.warn(`Failed to send additional media ${paths[j]} to ${number}: ${extraMediaErr.message}`);
              }
            }
          } else {
            sentMessage = await this.client.sendMessage(finalJid, message);
          }
        } else {
          sentMessage = await this.client.sendMessage(finalJid, message);
        }

        logger.info(`Message sent successfully to: ${number}`);
        
        return { 
          success: true, 
          msgId: sentMessage && sentMessage.id ? sentMessage.id._serialized : null 
        };

      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt}/${this.retryAttempts} failed for ${number}: ${error.message}`);

        if (attempt < this.retryAttempts) {
          logger.info(`Retrying in ${config.whatsapp.retryDelay / 1000} seconds...`);
          await sleep(config.whatsapp.retryDelay);
        }
      }
    }

    // All attempts failed
    logger.error(`Failed to send message to ${number} after ${this.retryAttempts} attempts`);
    return { 
      success: false, 
      error: lastError ? lastError.message : 'Unknown error' 
    };
  }

  /**
   * Get client info
   * @returns {Promise<Object>}
   */
  async getClientInfo() {
    try {
      const info = await this.client.info;
      return info;
    } catch (error) {
      logger.error('Error getting client info:', error);
      return null;
    }
  }

  /**
   * Get active chats from the WhatsApp client
   * @returns {Promise<Array>}
   */
  async getActiveChats() {
    if (!this.isReady) {
      logger.warn('Cannot fetch chats, WhatsApp client is not ready');
      return [];
    }
    try {
      logger.info('Fetching active chats...');
      
      let chats = [];
      const page = this.client.pupPage || this.client.page;
      if (page) {
        try {
          chats = await page.evaluate(() => {
            if (typeof window.require === 'undefined') return null;
            try {
              const collections = window.require('WAWebCollections');
              if (!collections || !collections.Chat) return null;
              
              const rawChats = collections.Chat.getModelsArray() || [];
              return rawChats.map(chat => {
                const serializedId = chat.id ? (chat.id._serialized || chat.id) : '';
                const cleanId = serializedId.split('@')[0];
                const displayId = chat.id ? (chat.id.user || cleanId) : cleanId;
                
                // If it is a LID chat, we default displayId to cleanId
                return {
                  id: serializedId,
                  name: chat.name || displayId,
                  isGroup: chat.isGroup || false,
                  unreadCount: chat.unreadCount || 0,
                  timestamp: chat.t || 0,
                  displayId: displayId
                };
              });
            } catch (evalErr) {
              return null;
            }
          });
          if (chats) {
            logger.info(`Successfully fetched ${chats.length} active chats via custom page evaluation.`);
          }
        } catch (evalErr) {
          logger.warn('Custom chat evaluation failed, falling back to standard getChats:', evalErr.message);
        }
      }

      // Fallback to standard getChats only if custom evaluation returned null/empty
      if (!chats || chats.length === 0) {
        logger.info('Falling back to standard getChats...');
        const rawChats = await this.client.getChats();
        const filteredChats = rawChats.filter(chat => {
          if (!chat.id) return false;
          const serialized = chat.id._serialized;
          const user = chat.id.user;
          if (!serialized.endsWith('@c.us') && !serialized.endsWith('@g.us')) return false;
          if (user && user.startsWith('1') && user.length >= 13) return false; // Abaikan nomor LID
          return true;
        });
        chats = filteredChats.map(chat => {
          const cleanId = chat.id._serialized.split('@')[0];
          const displayId = chat.id.user || cleanId;
          return {
            id: chat.id._serialized,
            name: chat.name || displayId,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount || 0,
            timestamp: chat.timestamp || 0,
            displayId: displayId
          };
        });
      }

      // Resolve LIDs to phone numbers inline first
      const lidChats = chats.filter(chat => {
        if (!chat.id) return false;
        const cleanId = chat.id.split('@')[0];
        return chat.id.endsWith('@lid') || (chat.id.endsWith('@c.us') && cleanId.startsWith('1') && cleanId.length >= 13);
      });

      if (lidChats.length > 0) {
        logger.info(`Resolving ${lidChats.length} LIDs inline...`);
        await Promise.all(lidChats.map(async (chat) => {
          try {
            const contact = await this.client.getContactById(chat.id);
            if (contact && contact.number) {
              const prevId = chat.id;
              chat.displayId = contact.number;
              chat.id = `${contact.number}@c.us`;
              
              // If name was the raw LID (or empty), update it to contact's name or number
              const contactName = (contact.name || contact.pushname || '').trim();
              if (!chat.name || chat.name === prevId.split('@')[0]) {
                chat.name = contactName || contact.number;
              }
              logger.info(`Resolved LID inline: ${prevId} -> ${chat.id} (${chat.name})`);
            }
          } catch (err) {
            logger.debug(`Could not resolve LID ${chat.id} inline: ${err.message}`);
          }
        }));
      }

      // Resolve LIDs to phone numbers in the background (as a fallback or for dynamically fetched ones)
      const lidIds = chats
        .filter(chat => {
          if (!chat.id) return false;
          const cleanId = chat.id.split('@')[0];
          return chat.id.endsWith('@lid') || (chat.id.endsWith('@c.us') && cleanId.startsWith('1') && cleanId.length >= 13);
        })
        .map(chat => chat.id);
      
      if (lidIds.length > 0) {
        logger.info(`Triggering background resolution for ${lidIds.length} LIDs...`);
        
        // Resolve each LID in the background without blocking
        (async () => {
          const updates = {};
          for (const lidJid of lidIds) {
            try {
              const contact = await this.client.getContactById(lidJid);
              if (contact && contact.number) {
                const contactName = (contact.name || contact.pushname || '').trim();
                updates[lidJid] = {
                  displayId: contact.number,
                  targetJid: `${contact.number}@c.us`,
                  name: contactName || contact.number
                };
              }
            } catch (err) {
              logger.debug(`Could not resolve LID ${lidJid} in background: ${err.message}`);
            }
          }
          if (Object.keys(updates).length > 0) {
            logger.info(`Resolved ${Object.keys(updates).length} LIDs in the background.`);
            this.emit('chats_resolved', updates);
          }
        })().catch(err => {
          logger.error('Error resolving LIDs in background loop:', err);
        });
      }

      return chats;
    } catch (error) {
      logger.error('Error fetching active chats:', error);
      return [];
    }
  }

  /**
   * Get all phonebook contacts from WhatsApp
   * @returns {Promise<Array>}
   */
  async getPhonebookContacts() {
    if (!this.isReady) {
      logger.warn('Cannot fetch contacts, WhatsApp client is not ready');
      return [];
    }
    try {
      logger.info('Fetching phonebook contacts...');
      
      let contacts = [];
      const page = this.client.pupPage || this.client.page;
      if (page) {
        try {
          contacts = await page.evaluate(() => {
            if (typeof window.require === 'undefined') return null;
            try {
              const collections = window.require('WAWebCollections');
              if (!collections || !collections.Contact) return null;
              
              const rawContacts = collections.Contact.getModelsArray() || [];
              return rawContacts.map(c => {
                const serialized = c.id ? (c.id._serialized || c.id) : null;
                const user = c.id ? (c.id.user || '') : '';
                return {
                  id: serialized ? { _serialized: serialized, user: user } : null,
                  isUser: typeof c.isUser === 'boolean' ? c.isUser : (serialized ? serialized.endsWith('@c.us') : false),
                  isMe: c.isMe || false,
                  number: c.number || user,
                  isMyContact: c.isMyContact || false,
                  name: c.name || '',
                  pushname: c.pushname || ''
                };
              });
            } catch (evalErr) {
              return null;
            }
          });
        } catch (e) {
          logger.warn('Custom contact evaluation failed, falling back:', e.message);
        }
      }

      if (!contacts || contacts.length === 0) {
        logger.info('Falling back to standard getContacts...');
        contacts = await this.client.getContacts();
      }
      
      const seen = new Set();
      const uniqueContacts = [];

      for (const contact of contacts) {
        // 1. Validasi tipe kontak: harus berupa user (@c.us), bukan me, dan bukan JID ngawur
        if (!contact.isUser || contact.isMe || !contact.id || !contact.id._serialized) continue;
        if (!contact.id._serialized.endsWith('@c.us')) continue; // buang @lid, @g.us, dll
        
        // 2. Bersihkan nomor telepon dan periksa validitas panjangnya
        const phone = contact.number ? contact.number.replace(/\D/g, '') : '';
        if (phone.length < 9 || phone.length > 15) continue; // nomor harus valid (9-15 digit)
        if (phone.startsWith('1') && phone.length >= 13) continue; // Abaikan nomor LID (Linked Identity)

        // 3. Hanya tampilkan kontak yang memilik nama terdaftar di HP (kontak tersimpan asli)
        const isSaved = contact.isMyContact || (contact.name && contact.name.trim() !== '');
        if (!isSaved) continue;

        const name = (contact.name || contact.pushname || '').trim();
        if (!name) continue;

        // 4. Eliminasi duplikat berdasarkan nomor telepon
        if (seen.has(phone)) continue;
        seen.add(phone);

        uniqueContacts.push({
          id: contact.id._serialized,
          name: name,
          isGroup: false,
          unreadCount: 0,
          timestamp: 0,
          displayId: phone
        });
      }

      // Urutkan berdasarkan nama agar rapi secara alfabetis
      uniqueContacts.sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`Fetched and filtered ${uniqueContacts.length} unique phonebook contacts.`);
      return uniqueContacts;
    } catch (error) {
      logger.error('Error fetching phonebook contacts:', error);
      return [];
    }
  }

  /**
   * Logout from current WhatsApp session (clears authentication data)
   */
  async logout() {
    if (this.client) {
      logger.info('Logging out WhatsApp client...');
      try {
        await this.client.logout();
      } catch (err) {
        logger.error('Error during client.logout():', err);
      }
      
      try {
        logger.info('Destroying client to release file locks...');
        await this.client.destroy();
      } catch (destroyErr) {
        logger.debug(`Client destroy error during logout: ${destroyErr.message}`);
      }

      // Force delete session path to ensure 100% clean session deletion
      try {
        const fs = require('fs');
        if (fs.existsSync(config.whatsapp.sessionPath)) {
          // Add a tiny delay to ensure puppeteer has fully exited
          await sleep(1000);
          fs.rmSync(config.whatsapp.sessionPath, { recursive: true, force: true });
          logger.info('Session folder cleared successfully.');
        }
      } catch (fsErr) {
        logger.warn('Failed to force clean session directory:', fsErr.message);
      }

      this.isReady = false;
    }
  }

  /**
   * Destroy client
   */
  async destroy() {
    if (this.client) {
      logger.info('Destroying WhatsApp client...');
      await this.client.destroy();
      this.isReady = false;
    }
  }
}

module.exports = WhatsAppClient;
