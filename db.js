const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Could not connect to SQLite database:', err);
  } else {
    logger.info('Connected to SQLite database at ' + dbPath);
  }
});

// Promise wrappers
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        logger.error(`Database error executing: ${sql}`, err);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        logger.error(`Database error fetching single row: ${sql}`, err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error(`Database error fetching all rows: ${sql}`, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Initialize database tables
const initDatabase = async () => {
  try {
    // 1. Templates
    await dbRun(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Blacklist
    await dbRun(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason TEXT
      )
    `);

    // 3. Campaigns
    await dbRun(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        template_text TEXT NOT NULL,
        media_path TEXT,
        media_name TEXT,
        media_type TEXT,
        status TEXT DEFAULT 'idle',
        delay_min INTEGER DEFAULT 3000,
        delay_max INTEGER DEFAULT 3000,
        sleep_after INTEGER DEFAULT 0,
        sleep_duration INTEGER DEFAULT 0,
        use_spintax INTEGER DEFAULT 0,
        use_emoji INTEGER DEFAULT 0,
        use_whitespace INTEGER DEFAULT 0,
        use_dynamic_vars INTEGER DEFAULT 0,
        use_random_suffix INTEGER DEFAULT 0,
        scheduled_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT
      )
    `);

    // 4. Recipients
    await dbRun(`
      CREATE TABLE IF NOT EXISTS recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER,
        number TEXT NOT NULL,
        name TEXT,
        variables TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        sent_at TEXT,
        msg_id TEXT UNIQUE,
        ack_status INTEGER DEFAULT 0,
        FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    // Run migration/update column for existing databases
    try {
      await dbRun('ALTER TABLE recipients ADD COLUMN variables TEXT');
      logger.info('Migration: Added variables column to recipients table.');
    } catch (err) {
      // Column already exists, ignore error
    }

    logger.info('Database tables checked/created successfully.');
  } catch (error) {
    logger.error('Failed to initialize database tables:', error);
    throw error;
  }
};

// Blacklist helpers
const getBlacklist = async () => {
  try {
    const rows = await dbAll('SELECT number FROM blacklist');
    return rows.map(r => r.number);
  } catch (err) {
    logger.error('Error fetching blacklist from DB:', err);
    return [];
  }
};

const addToBlacklist = async (number, reason = 'Opt-Out STOP') => {
  try {
    const formatted = number.replace(/\D/g, ''); // simple digits only
    if (!formatted) return false;
    await dbRun('INSERT OR IGNORE INTO blacklist (number, reason) VALUES (?, ?)', [formatted, reason]);
    return true;
  } catch (err) {
    logger.error(`Error adding ${number} to blacklist DB:`, err);
    return false;
  }
};

const removeFromBlacklist = async (number) => {
  try {
    const formatted = number.replace(/\D/g, '');
    const res = await dbRun('DELETE FROM blacklist WHERE number = ?', [formatted]);
    return res.changes > 0;
  } catch (err) {
    logger.error(`Error removing ${number} from blacklist DB:`, err);
    return false;
  }
};

// Templates CRUD helpers
const getTemplates = async () => {
  try {
    return await dbAll('SELECT name, content, updated_at FROM templates ORDER BY name ASC');
  } catch (err) {
    logger.error('Error fetching templates from DB:', err);
    return [];
  }
};

const getTemplate = async (name) => {
  try {
    return await dbGet('SELECT * FROM templates WHERE name = ?', [name]);
  } catch (err) {
    logger.error(`Error fetching template ${name} from DB:`, err);
    return null;
  }
};

const saveTemplate = async (name, content) => {
  try {
    const existing = await getTemplate(name);
    if (existing) {
      await dbRun('UPDATE templates SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?', [content, name]);
    } else {
      await dbRun('INSERT INTO templates (name, content) VALUES (?, ?)', [name, content]);
    }
    return true;
  } catch (err) {
    logger.error(`Error saving template ${name} to DB:`, err);
    return false;
  }
};

const deleteTemplate = async (name) => {
  try {
    const res = await dbRun('DELETE FROM templates WHERE name = ?', [name]);
    return res.changes > 0;
  } catch (err) {
    logger.error(`Error deleting template ${name} from DB:`, err);
    return false;
  }
};

// Campaign & recipients helpers
const createCampaign = async (campaignData) => {
  const {
    name,
    template_text,
    media_path = null,
    media_name = null,
    media_type = null,
    status = 'idle',
    delay_min = 3000,
    delay_max = 3000,
    sleep_after = 0,
    sleep_duration = 0,
    use_spintax = 0,
    use_emoji = 0,
    use_whitespace = 0,
    use_dynamic_vars = 0,
    use_random_suffix = 0,
    scheduled_at = null
  } = campaignData;

  const query = `
    INSERT INTO campaigns (
      name, template_text, media_path, media_name, media_type, status,
      delay_min, delay_max, sleep_after, sleep_duration,
      use_spintax, use_emoji, use_whitespace, use_dynamic_vars, use_random_suffix,
      scheduled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name, template_text, media_path, media_name, media_type, status,
    delay_min, delay_max, sleep_after, sleep_duration,
    use_spintax, use_emoji, use_whitespace, use_dynamic_vars, use_random_suffix,
    scheduled_at
  ];

  const res = await dbRun(query, params);
  return res.lastID;
};

const addCampaignRecipient = async (campaignId, recipient) => {
  const { number, name, variables } = recipient;
  const variablesJson = variables ? JSON.stringify(variables) : null;
  return await dbRun(
    'INSERT INTO recipients (campaign_id, number, name, variables, status) VALUES (?, ?, ?, ?, ?)',
    [campaignId, number, name, variablesJson, 'pending']
  );
};

const updateRecipientStatus = async (recipientId, status, errorMessage = null, msgId = null) => {
  return await dbRun(
    'UPDATE recipients SET status = ?, error_message = ?, sent_at = ?, msg_id = ? WHERE id = ?',
    [status, errorMessage, msgId ? new Date().toISOString() : null, msgId, recipientId]
  );
};

const updateRecipientAck = async (msgId, ackStatus) => {
  return await dbRun(
    'UPDATE recipients SET ack_status = ? WHERE msg_id = ?',
    [ackStatus, msgId]
  );
};

const updateCampaignStatus = async (campaignId, status) => {
  const finishedAt = ['finished', 'cancelled'].includes(status) ? new Date().toISOString() : null;
  if (finishedAt) {
    return await dbRun('UPDATE campaigns SET status = ?, finished_at = ? WHERE id = ?', [status, finishedAt, campaignId]);
  } else {
    return await dbRun('UPDATE campaigns SET status = ? WHERE id = ?', [status, campaignId]);
  }
};

const getCampaignStats = async (campaignId) => {
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM recipients
    WHERE campaign_id = ?
   `;
  return await dbGet(query, [campaignId]);
};

/**
 * Clear all campaigns and recipients records
 */
const clearCampaignsAndRecipients = async () => {
  try {
    await dbRun('DELETE FROM recipients');
    await dbRun('DELETE FROM campaigns');
    logger.info('Database campaigns and recipients tables cleared.');
    return true;
  } catch (err) {
    logger.error('Error clearing campaigns and recipients:', err);
    throw err;
  }
};

// Auto run initialization
initDatabase().catch(err => {
  logger.error('Database auto-initialization failed:', err);
});

module.exports = {
  clearCampaignsAndRecipients,
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  getTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  createCampaign,
  addCampaignRecipient,
  updateRecipientStatus,
  updateRecipientAck,
  updateCampaignStatus,
  getCampaignStats
};
