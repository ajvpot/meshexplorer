#!/usr/bin/env node

/**
 * Discord Bot for MeshCore Chat Messages
 * 
 * This script subscribes to the ClickHouse message stream with decryption enabled
 * for the Seattle region and posts new messages to Discord via webhook.
 * 
 * Messages with the same ID will update the existing Discord message instead of
 * posting a new one.
 */

import { createClickHouseStreamer, createChatMessagesStreamerConfig } from '../src/lib/clickhouse/streaming';
import { decryptMeshcoreGroupMessage } from '../src/lib/meshcore';
import { DiscordWebhookClient, formatMeshcoreMessageForDiscord } from './lib/discord';

interface BotConfig {
  webhookUrl: string;
  region: string;
  pollInterval: number;
  maxRowsPerPoll: number;
  privateKeys: string[];
}

class MeshCoreDiscordBot {
  private config: BotConfig;
  private discordClient: DiscordWebhookClient;
  private isRunning = false;
  private streamer: any;

  constructor(config: BotConfig) {
    this.config = config;
    this.discordClient = new DiscordWebhookClient(config.webhookUrl);
  }

  async start() {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting MeshCore Discord Bot...');
    console.log(`Region: ${this.config.region}`);
    console.log(`Poll interval: ${this.config.pollInterval}ms`);
    console.log(`Max rows per poll: ${this.config.maxRowsPerPoll}`);

    // Create streaming configuration
    const streamerConfig = createChatMessagesStreamerConfig(undefined, this.config.region);
    streamerConfig.pollInterval = this.config.pollInterval;
    streamerConfig.maxRowsPerPoll = this.config.maxRowsPerPoll;
    streamerConfig.skipInitialMessages = true; // Skip initial messages, only get new ones

    this.streamer = createClickHouseStreamer(streamerConfig);

    try {
      // Start streaming
      for await (const result of this.streamer({})) {
        await this.processMessage(result.row);
      }
    } catch (error) {
      console.error('Streaming error:', error);
      throw error;
    }
  }

  private async processMessage(message: any) {
    try {
      console.log(`Processing message ${message.message_id} from channel ${message.channel_hash}`);

      // Decrypt the message
      const decrypted = await this.decryptMessage(message);
      
      if (!decrypted) {
        console.log(`Failed to decrypt message ${message.message_id}, skipping Discord post`);
        return;
      }

      // Format message for Discord
      const discordMessage = formatMeshcoreMessageForDiscord(message, decrypted);

      // Post or update message in Discord
      await this.discordClient.postOrUpdateMessage(message.message_id, discordMessage);

      console.log(`Successfully processed message ${message.message_id}: ${decrypted.text}`);

    } catch (error) {
      console.error(`Error processing message ${message.message_id}:`, error);
      
      // Don't send error messages to Discord for processing errors
      // Just log them for monitoring
    }
  }

  private async decryptMessage(message: any): Promise<any> {
    const PUBLIC_MESHCORE_KEY = "izOH6cXN6mrJ5e26oRXNcg==";
    const allKeys = [PUBLIC_MESHCORE_KEY, ...this.config.privateKeys];

    try {
      const decrypted = await decryptMeshcoreGroupMessage({
        encrypted_message: message.encrypted_message,
        mac: message.mac,
        channel_hash: message.channel_hash,
        knownKeys: allKeys,
        parse: true
      });

      return decrypted;
    } catch (error) {
      console.warn(`Decryption failed for message ${message.message_id}:`, error);
      return null;
    }
  }

  stop() {
    this.isRunning = false;
    console.log('Stopping MeshCore Discord Bot...');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      region: this.config.region,
      messageMappings: this.discordClient.getAllMappings().size
    };
  }
}

// Main execution
async function main() {
  // Get configuration from environment variables
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const region = process.env.MESH_REGION || 'seattle';
  const pollInterval = parseInt(process.env.POLL_INTERVAL || '1000', 10);
  const maxRowsPerPoll = parseInt(process.env.MAX_ROWS_PER_POLL || '50', 10);
  const privateKeys = process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(',').filter(key => key.trim()) : [];

  // Validate required configuration
  if (!webhookUrl) {
    console.error('Error: DISCORD_WEBHOOK_URL environment variable is required');
    process.exit(1);
  }

  // Validate webhook URL format
  if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    console.error('Error: DISCORD_WEBHOOK_URL must be a valid Discord webhook URL');
    process.exit(1);
  }

  // Validate region
  const allowedRegions = ['seattle', 'portland', 'boston'];
  if (!allowedRegions.includes(region)) {
    console.error(`Error: MESH_REGION must be one of: ${allowedRegions.join(', ')}`);
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Webhook URL: ${webhookUrl.substring(0, 50)}...`);
  console.log(`  Region: ${region}`);
  console.log(`  Poll interval: ${pollInterval}ms`);
  console.log(`  Max rows per poll: ${maxRowsPerPoll}`);
  console.log(`  Private keys: ${privateKeys.length}`);

  // Create and start the bot
  const bot = new MeshCoreDiscordBot({
    webhookUrl,
    region,
    pollInterval,
    maxRowsPerPoll,
    privateKeys
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    bot.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    bot.stop();
    process.exit(1);
  });

  try {
    await bot.start();
  } catch (error) {
    console.error('Bot failed to start:', error);
    process.exit(1);
  }
}

// Run the bot
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MeshCoreDiscordBot };
