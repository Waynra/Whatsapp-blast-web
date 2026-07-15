const path = require('path');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const {
  replaceName,
  replaceCustomVariables,
  applyMessageVariations,
  writeReport,
  sleep
} = require('./utils');

class WebBlastManager {
  constructor(whatsappClient, io) {
    this.client = whatsappClient;
    this.io = io;
    this.isRunning = false;
    this.isPaused = false;
    this.isCancelled = false;
    this.statistics = { success: 0, failed: 0 };
    this.currentCampaign = null;
  }

  pause() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      logger.info('Web campaign paused.');
      this.io.emit('campaign_status', { status: 'paused' });
      return true;
    }
    return false;
  }

  resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      logger.info('Web campaign resumed.');
      this.io.emit('campaign_status', { status: 'running' });
      return true;
    }
    return false;
  }

  cancel() {
    if (this.isRunning) {
      this.isCancelled = true;
      this.isPaused = false; // resume if paused to let it exit
      logger.info('Web campaign cancelled.');
      this.io.emit('campaign_status', { status: 'cancelled' });
      return true;
    }
    return false;
  }

  async startCampaign(campaignId, data, options) {
    if (this.isRunning) {
      throw new Error('A campaign is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.isCancelled = false;
    this.statistics = { success: 0, failed: 0 };

    // Fetch campaign and recipients from SQLite
    const campaign = await db.dbGet('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) {
      this.isRunning = false;
      throw new Error(`Campaign ID ${campaignId} not found in database`);
    }

    const recipients = await db.dbAll('SELECT id, number, name, variables FROM recipients WHERE campaign_id = ?', [campaignId]);
    if (recipients.length === 0) {
      this.isRunning = false;
      await db.updateCampaignStatus(campaignId, 'failed');
      throw new Error(`No recipients found for Campaign ID ${campaignId}`);
    }

    const totalCount = recipients.length;
    this.currentCampaign = { id: campaignId, total: totalCount };

    const { textTemplate, textFileName = 'web-text', numberFileName = 'web-number' } = data;
    const { 
      delayMin = 3000, 
      delayMax = 3000, 
      sleepAfter = 0, 
      sleepDuration = 0, 
      messageVariation = {} 
    } = options;

    const mediaPath = campaign.media_path;
    const mediaName = campaign.media_name;

    logger.info(`Starting Web Blast Campaign ID ${campaignId}: ${totalCount} recipients. Media: ${mediaName || 'None'}`);
    this.io.emit('campaign_status', { 
      status: 'running', 
      campaignId,
      total: totalCount,
      success: 0,
      failed: 0
    });

    const reportContent = [];
    const reportName = Date.now();
    let messageCount = 0;

    // Set campaign status to running
    await db.updateCampaignStatus(campaignId, 'running');

    for (let i = 0; i < recipients.length; i++) {
      // Handle Pause
      while (this.isPaused) {
        await sleep(1000);
      }

      // Handle Cancel
      if (this.isCancelled) {
        logger.info(`Campaign ID ${campaignId} execution cancelled by user`);
        this.io.emit('campaign_log', { type: 'warn', message: 'Campaign execution cancelled by user' });
        break;
      }

      const item = recipients[i];
      let message = replaceName(textTemplate, item.name);
      if (item.variables) {
        message = replaceCustomVariables(message, item.variables);
      }
      message = applyMessageVariations(message, messageVariation);

      this.io.emit('campaign_log', { 
        type: 'info', 
        message: `[${i + 1}/${totalCount}] Sending to ${item.number} (${item.name || 'N/A'})...` 
      });

      // Send via WhatsApp Client
      const result = await this.client.sendMessage(item.number, message, mediaPath);

      if (result.success) {
        this.statistics.success++;
        await db.updateRecipientStatus(item.id, 'success', null, result.msgId);
        
        reportContent.push(`${item.number} | SUCCESS | ${item.name || 'N/A'}`);
        this.io.emit('campaign_log', { 
          type: 'success', 
          message: `✓ Success: ${item.number}`,
          recipientId: item.id,
          msgId: result.msgId
        });
      } else {
        this.statistics.failed++;
        await db.updateRecipientStatus(item.id, 'failed', result.error || 'Unknown error');
        
        reportContent.push(`${item.number} | FAILED | ${item.name || 'N/A'} | ${result.error || 'Unknown error'}`);
        this.io.emit('campaign_log', { 
          type: 'error', 
          message: `✗ Failed: ${item.number} - ${result.error || 'Unknown error'}`,
          recipientId: item.id
        });
      }

      // Emit real-time progress
      this.io.emit('campaign_progress', {
        index: i + 1,
        total: totalCount,
        success: this.statistics.success,
        failed: this.statistics.failed
      });

      // Randomized Delay (Jitter) between messages
      if (i < recipients.length - 1 && !this.isCancelled) {
        // Calculate random delay between min and max
        const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        
        const startDelay = Date.now();
        while (Date.now() - startDelay < randomDelay) {
          if (this.isCancelled) break;
          while (this.isPaused) {
            await sleep(500);
          }
          await sleep(200);
        }
      }

      // Sleep intervals
      if (sleepAfter > 0 && !this.isCancelled) {
        messageCount++;
        if (messageCount >= sleepAfter && i < recipients.length - 1) {
          logger.info(`Campaign sleeping for ${sleepDuration}ms after ${sleepAfter} messages...`);
          this.io.emit('campaign_log', { 
            type: 'sleep', 
            message: `Taking a rest for ${sleepDuration / 1000} seconds to avoid spam triggers...` 
          });
          
          const startSleep = Date.now();
          while (Date.now() - startSleep < sleepDuration) {
            if (this.isCancelled) break;
            while (this.isPaused) {
              await sleep(500);
            }
            await sleep(200);
          }
          
          messageCount = 0;
        }
      }
    }

    // Mark campaign as finished/cancelled in DB
    const finalStatus = this.isCancelled ? 'cancelled' : 'finished';
    await db.updateCampaignStatus(campaignId, finalStatus);

    // Save report
    const reportPath = path.join(
      config.directories.report,
      `${reportName}-${textFileName}-${numberFileName}.txt`
    );

    reportContent.push('\n' + '='.repeat(50));
    reportContent.push('WEB BLAST STATISTICS');
    reportContent.push('='.repeat(50));
    reportContent.push(`Total: ${totalCount}`);
    reportContent.push(`Success: ${this.statistics.success}`);
    reportContent.push(`Failed: ${this.statistics.failed}`);
    reportContent.push(`Success Rate: ${((this.statistics.success / totalCount) * 100).toFixed(2)}%`);

    writeReport(reportPath, reportContent);

    this.io.emit('campaign_log', { 
      type: 'summary', 
      message: `Campaign Finished! Saved report to ${reportName}-${textFileName}-${numberFileName}.txt` 
    });

    this.io.emit('campaign_status', { 
      status: finalStatus,
      success: this.statistics.success,
      failed: this.statistics.failed,
      total: totalCount,
      reportFile: `${reportName}-${textFileName}-${numberFileName}.txt`
    });

    this.isRunning = false;
  }
}

module.exports = WebBlastManager;
