/**
 * Discord webhook integration utilities for posting and updating messages
 */

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
  private messageIdMap: Map<string, string> = new Map(); // message_id -> discord_message_id

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Post a new message to Discord
   */
  async postMessage(message: DiscordWebhookMessage): Promise<DiscordWebhookResponse> {
    // Add wait=true to get the message ID in response
    const url = new URL(this.webhookUrl);
    url.searchParams.set('wait', 'true');
    
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
    const updateUrl = `${this.webhookUrl}/messages/${discordMessageId}`;
    
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
   * Clear all message ID mappings
   */
  clearMappings(): void {
    this.messageIdMap.clear();
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
  const text = decrypted?.text || '[Encrypted Message]';
  
  // Calculate how many times the message was heard
  const heardCount = message.origin_path_info ? message.origin_path_info.length : 0;
  
  // Format the message content with the requested format
  const content = `${text}\n-# _Heard ${heardCount} times by [MeshExplorer](https://map.w0z.is/messages)_`;

  // Generate profile picture URL using the new API
  const profilePictureUrl = `https://map.w0z.is/api/meshcore/profilepicture.png?name=${encodeURIComponent(sender)}&v=3`;

  return {
    username: sender,
    avatar_url: profilePictureUrl,
    content: content,
    flags: 4 // SUPPRESS_EMBEDS flag
  };
}