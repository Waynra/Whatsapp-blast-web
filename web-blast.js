const path = require('path');
const config = require('./config');
const logger = require('./logger');
const {
  replaceName,
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

  async startCampaign(data, options) {
    if (this.isRunning) {
      throw new Error('A campaign is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.isCancelled = false;
    this.statistics = { success: 0, failed: 0 };
    
    const { numbers, textTemplate, textFileName = 'web-text', numberFileName = 'web-number' } = data;
    const { delay = 3000, sleepAfter = 0, sleepDuration = 0, messageVariation = {} } = options;

    logger.info(`Starting Web Blast Campaign: ${numbers.length} recipients`);
    this.io.emit('campaign_status', { 
      status: 'running', 
      total: numbers.length,
      success: 0,
      failed: 0
    });

    const reportContent = [];
    const reportName = Date.now();
    let messageCount = 0;

    for (let i = 0; i < numbers.length; i++) {
      // Handle Pause
      while (this.isPaused) {
        await sleep(1000);
      }

      // Handle Cancel
      if (this.isCancelled) {
        logger.info('Campaign execution cancelled by user');
        this.io.emit('campaign_log', { type: 'warn', message: 'Campaign execution cancelled by user' });
        break;
      }

      const item = numbers[i];
      let message = replaceName(textTemplate, item.name);
      message = applyMessageVariations(message, messageVariation);

      this.io.emit('campaign_log', { 
        type: 'info', 
        message: `[${i + 1}/${numbers.length}] Sending to ${item.number} (${item.name || 'N/A'})...` 
      });

      const result = await this.client.sendMessage(item.number, message);

      if (result.success) {
        this.statistics.success++;
        reportContent.push(`${item.number} | SUCCESS | ${item.name || 'N/A'}`);
        this.io.emit('campaign_log', { 
          type: 'success', 
          message: `✓ Success: ${item.number}` 
        });
      } else {
        this.statistics.failed++;
        reportContent.push(`${item.number} | FAILED | ${item.name || 'N/A'} | ${result.error || 'Unknown error'}`);
        this.io.emit('campaign_log', { 
          type: 'error', 
          message: `✗ Failed: ${item.number} - ${result.error || 'Unknown error'}` 
        });
      }

      // Emit real-time progress
      this.io.emit('campaign_progress', {
        index: i + 1,
        total: numbers.length,
        success: this.statistics.success,
        failed: this.statistics.failed
      });

      // Delay between messages
      if (i < numbers.length - 1 && !this.isCancelled) {
        const startDelay = Date.now();
        while (Date.now() - startDelay < delay) {
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
        if (messageCount >= sleepAfter && i < numbers.length - 1) {
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

    // Save report
    const reportPath = path.join(
      config.directories.report,
      `${reportName}-${textFileName}-${numberFileName}.txt`
    );

    reportContent.push('\n' + '='.repeat(50));
    reportContent.push('WEB BLAST STATISTICS');
    reportContent.push('='.repeat(50));
    reportContent.push(`Total: ${numbers.length}`);
    reportContent.push(`Success: ${this.statistics.success}`);
    reportContent.push(`Failed: ${this.statistics.failed}`);
    reportContent.push(`Success Rate: ${((this.statistics.success / numbers.length) * 100).toFixed(2)}%`);

    writeReport(reportPath, reportContent);

    this.io.emit('campaign_log', { 
      type: 'summary', 
      message: `Campaign Finished! Saved report to ${reportName}-${textFileName}-${numberFileName}.txt` 
    });

    this.io.emit('campaign_status', { 
      status: this.isCancelled ? 'cancelled' : 'finished',
      success: this.statistics.success,
      failed: this.statistics.failed,
      total: numbers.length,
      reportFile: `${reportName}-${textFileName}-${numberFileName}.txt`
    });

    this.isRunning = false;
  }
}

module.exports = WebBlastManager;
