/**
 * Discord webhook integration utilities for posting and updating messages
 */

import { createNodeSearchUrl, processNodeMentionsForMarkdown } from '../../src/lib/node-utils';

export interface DiscordWebhookMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  flags?: number;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
  footer?: DiscordEmbedFooter;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordWebhookResponse {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  edited_timestamp?: string;
}

export class DiscordWebhookClient {
  private webhookUrl: string;
  private threadId?: string;
  private messageIdMap: Map<string, string> = new Map(); // message_id -> discord_message_id
  private processingPromises: Map<string, Promise<DiscordWebhookResponse>> = new Map(); // Track ongoing operations

  constructor(webhookUrl: string, threadId?: string) {
    this.webhookUrl = webhookUrl;
    this.threadId = threadId;
  }

  /**
   * Post a new message to Discord
   */
  async postMessage(message: DiscordWebhookMessage): Promise<DiscordWebhookResponse> {
    // Add wait=true to get the message ID in response
    const url = new URL(this.webhookUrl);
    url.searchParams.set('wait', 'true');
    
    // Add thread_id if configured
    if (this.threadId) {
      url.searchParams.set('thread_id', this.threadId);
    }
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Update an existing Discord message
   */
  async updateMessage(discordMessageId: string, message: DiscordWebhookMessage): Promise<DiscordWebhookResponse> {
    // Use the correct URL format for updating messages
    let updateUrl = `${this.webhookUrl}/messages/${discordMessageId}`;
    
    // Add thread_id parameter if configured
    if (this.threadId) {
      const url = new URL(updateUrl);
      url.searchParams.set('thread_id', this.threadId);
      updateUrl = url.toString();
    }
    
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord webhook update failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Post or update a message based on message ID mapping
   */
  async postOrUpdateMessage(
    messageId: string, 
    message: DiscordWebhookMessage
  ): Promise<DiscordWebhookResponse> {
    // Check if this message is already being processed
    const existingPromise = this.processingPromises.get(messageId);
    if (existingPromise) {
      console.log(`Message ${messageId} is already being processed, awaiting existing operation`);
      try {
        // Wait for the existing operation to complete
        const result = await existingPromise;
        console.log(`Awaited existing operation for message ${messageId}, result: ${result.id}`);
        
        // After the first operation completes, we might need to update with new content
        const discordId = this.messageIdMap.get(messageId);
        if (discordId) {
          console.log(`Updating Discord message ${discordId} with new content for message ${messageId}`);
          return await this.updateMessage(discordId, message);
        }
        
        return result;
      } catch (error) {
        console.warn(`Existing operation for message ${messageId} failed, will retry:`, error);
        // If the existing operation failed, we'll fall through to create a new one
      }
    }

    // Create a new operation promise
    const operationPromise = this.performPostOrUpdate(messageId, message);
    
    // Store the promise to prevent concurrent operations
    this.processingPromises.set(messageId, operationPromise);
    
    try {
      const result = await operationPromise;
      return result;
    } finally {
      // Clean up the promise from the map
      this.processingPromises.delete(messageId);
    }
  }

  /**
   * Internal method to perform the actual post or update operation
   */
  private async performPostOrUpdate(
    messageId: string, 
    message: DiscordWebhookMessage
  ): Promise<DiscordWebhookResponse> {
    const existingDiscordId = this.messageIdMap.get(messageId);
    
    if (existingDiscordId) {
      // Update existing message
      try {
        console.log(`Updating Discord message ${existingDiscordId} for meshcore message ${messageId}`);
        const result = await this.updateMessage(existingDiscordId, message);
        console.log(`Successfully updated Discord message ${existingDiscordId} for meshcore message ${messageId}`);
        return result;
      } catch (error) {
        console.warn(`Failed to update Discord message ${existingDiscordId} for meshcore message ${messageId}, posting new message:`, error);
        // If update fails, remove the old mapping and post a new message
        this.messageIdMap.delete(messageId);
        const result = await this.postMessage(message);
        this.messageIdMap.set(messageId, result.id);
        console.log(`Posted new Discord message ${result.id} for meshcore message ${messageId} (after update failure)`);
        return result;
      }
    } else {
      // Post new message
      console.log(`Posting new Discord message for meshcore message ${messageId}`);
      const result = await this.postMessage(message);
      this.messageIdMap.set(messageId, result.id);
      console.log(`Posted new Discord message ${result.id} for meshcore message ${messageId}`);
      return result;
    }
  }

  /**
   * Get the Discord message ID for a given meshcore message ID
   */
  getDiscordMessageId(messageId: string): string | undefined {
    return this.messageIdMap.get(messageId);
  }

  /**
   * Remove a message ID mapping (useful for cleanup)
   */
  removeMessageMapping(messageId: string): boolean {
    return this.messageIdMap.delete(messageId);
  }

  /**
   * Get all message ID mappings
   */
  getAllMappings(): Map<string, string> {
    return new Map(this.messageIdMap);
  }

  /**
   * Clear all message ID mappings and processing state
   */
  clearMappings(): void {
    this.messageIdMap.clear();
    this.processingPromises.clear();
  }

  /**
   * Get the current processing state (for debugging)
   */
  getProcessingMessages(): Set<string> {
    return new Set(this.processingPromises.keys());
  }
}

/**
 * Format a meshcore chat message for Discord
 */
export function formatMeshcoreMessageForDiscord(
  message: any,
  decrypted?: {
    timestamp: number;
    msgType: number;
    sender: string;
    text: string;
    rawText: string;
  }
): DiscordWebhookMessage {
  const sender = decrypted?.sender || 'Unknown';
  const rawText = decrypted?.text || '[Encrypted Message]';
  
  // Process node mentions (@[Node Name]) and convert to Discord markdown links
  const processedText = processNodeMentionsForMarkdown(rawText);
  
  // Calculate how many times the message was heard
  const heardCount = message.origin_path_info ? message.origin_path_info.length : 0;
  
  // Create URL to search page with node name prefilled and exact match enabled
  const senderSearchUrl = createNodeSearchUrl(sender);
  const content = `${processedText}\n-# _Heard ${heardCount} times_ | [Node Info](${senderSearchUrl})`;

  // Generate profile picture URL using the new API
  const profilePictureUrl = `https://map.w0z.is/api/meshcore/profilepicture.png?name=${encodeURIComponent(sender)}&v=3`;

  return {
    username: sender,
    avatar_url: profilePictureUrl,
    content: content,
    flags: 4 // SUPPRESS_EMBEDS flag
  };
}