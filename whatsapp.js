const EventEmitter = require('events');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const logger = require('./logger');
const { formatPhoneNumber, isValidPhoneNumber, sleep } = require('./utils');

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

    this.client.on('message', async (msg) => {
      try {
        const body = (msg.body || '').trim().toUpperCase();
        if (body === 'STOP' && msg.from.endsWith('@c.us')) {
          const senderNum = msg.from.split('@')[0];
          const { addToBlacklist } = require('./utils');
          const added = addToBlacklist(senderNum);
          
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
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendMessage(number, message) {
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

    // Check Blacklist
    const { getBlacklist } = require('./utils');
    const blacklist = getBlacklist();
    
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

        // Send message
        await this.client.sendMessage(finalJid, message);
        logger.info(`Message sent successfully to: ${number}`);
        
        return { success: true };

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
      
      // Try fast custom page evaluation first
      let chats = [];
      const page = this.client.pupPage || this.client.page;
      if (page) {
        try {
          chats = await page.evaluate(() => {
            if (typeof window.Store === 'undefined' || !window.Store.Chat) {
              return null;
            }
            // Sort by timestamp descending and take the top 150 chats
            const allChats = window.Store.Chat.models || [];
            const sorted = [...allChats].sort((a, b) => (b.t || 0) - (a.t || 0));
            return sorted.slice(0, 150).map(chat => {
              return {
                id: chat.id._serialized,
                name: chat.name || '',
                isGroup: chat.isGroup || false,
                unreadCount: chat.unreadCount || 0,
                timestamp: chat.t || 0,
                displayId: chat.id.user
              };
            });
          });
          if (chats) {
            logger.info(`Successfully fetched ${chats.length} active chats via fast evaluation.`);
          }
        } catch (evalErr) {
          logger.warn('Fast chat evaluation failed, falling back to standard getChats:', evalErr.message);
        }
      }

      // If fast evaluation returned null/empty, use standard getChats
      if (!chats || chats.length === 0) {
        const rawChats = await this.client.getChats();
        chats = rawChats.map(chat => {
          return {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount || 0,
            timestamp: chat.timestamp || 0,
            displayId: chat.id.user
          };
        });
      }

      // Resolve LIDs to phone numbers in the background
      const lidIds = chats
        .filter(chat => chat.id && chat.id.endsWith('@lid'))
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
                updates[lidJid] = {
                  displayId: contact.number,
                  targetJid: `${contact.number}@c.us`
                };
              }
            } catch (err) {
              logger.debug(`Could not resolve LID ${lidJid}: ${err.message}`);
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
