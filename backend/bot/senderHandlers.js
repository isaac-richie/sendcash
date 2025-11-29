import { dbGet, dbRun } from '../services/database.js'
import { aiAgent } from '../services/aiAgent.js'
import { executePayment, executeRegisterUsername } from '../services/aiActions.js'

/**
 * Sender AI Agent Bot Handlers
 * All interactions go through the AI agent "Sender"
 */

export const senderBotHandlers = (bot) => {
  // Initialize AI Agent
  let agentInitialized = false
  
  const initializeAgent = async () => {
    if (!agentInitialized) {
      await aiAgent.initialize()
      agentInitialized = true
      console.log('[Sender] AI Agent initialized')
    }
  }

  // Register user on /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id
    
    // Register user in database
    await dbRun(
      'INSERT OR IGNORE INTO telegram_users (telegram_id) VALUES (?)',
      [userId]
    )

    // Get user info
    const user = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
    
    await initializeAgent()
    
    // Use AI agent to generate welcome message
    const welcomeMessage = user && user.wallet_address
      ? `Hey! 👋 I'm Sender, your AI assistant for SendCash!\n\n` +
        `I see you're already set up with @${user.username || 'your wallet'}.\n\n` +
        `Just chat with me naturally and I'll help you:\n` +
        `• Check your balance\n` +
        `• Send payments\n` +
        `• View your history\n` +
        `• Get spending insights\n\n` +
        `Try asking: "What's my balance?" or "Send $10 to @alice" 🚀`
      : `Hey there! 👋 I'm Sender, your AI assistant for SendCash!\n\n` +
        `I make crypto payments super simple - just chat with me naturally!\n\n` +
        `To get started, tell me:\n` +
        `• "Register @yourname" - to create your wallet\n` +
        `• Or just ask me anything about SendCash!\n\n` +
        `I'm here to help! 🤖✨`

    return bot.sendMessage(chatId, welcomeMessage)
  })

  // Handle all messages through Sender AI
  bot.on('message', async (msg) => {
    // Log all incoming messages for debugging
    console.log(`[Sender] 📨 Received message:`, {
      chatId: msg.chat?.id,
      userId: msg.from?.id,
      username: msg.from?.username,
      text: msg.text?.substring(0, 50),
      hasText: !!msg.text
    })
    
    // Skip non-text messages
    if (!msg.text) {
      console.log(`[Sender] Skipping non-text message`)
      return
    }
    
    const chatId = msg.chat.id
    const userId = msg.from.id
    const text = msg.text.trim()
    
    // Skip if it's a command that we handle specially
    if (text.startsWith('/start')) {
      return // Already handled above
    }

    // Initialize agent if needed
    await initializeAgent()

    // Register user if not exists
    await dbRun(
      'INSERT OR IGNORE INTO telegram_users (telegram_id) VALUES (?)',
      [userId]
    )

    // Get user context
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])

    try {
      // Show typing indicator
      await bot.sendChatAction(chatId, 'typing')

      // Check for confirmation responses
      const confirmationWords = ['yes', 'confirm', 'y', 'ok', 'proceed', 'cancel', 'no', 'abort', 'nope']
      const isConfirmation = confirmationWords.some(word => 
        text.toLowerCase().trim() === word || 
        text.toLowerCase().startsWith(word + ' ') ||
        text.toLowerCase().endsWith(' ' + word)
      )

      if (isConfirmation) {
        // Try to confirm pending action
        console.log(`[Sender] ========== CONFIRMATION DETECTED ==========`)
        console.log(`[Sender] User ID: ${userId} (type: ${typeof userId})`)
        console.log(`[Sender] Confirmation text: "${text}"`)
        console.log(`[Sender] Calling confirmAndExecute...`)
        const confirmResult = await aiAgent.confirmAndExecute(userId, text, bot)
        console.log(`[Sender] Confirmation result:`, { 
          success: confirmResult?.success, 
          hasMessage: !!confirmResult?.message,
          messagePreview: confirmResult?.message?.substring(0, 100)
        })
        console.log(`[Sender] ===========================================`)
        
        if (confirmResult && confirmResult.message) {
          return bot.sendMessage(chatId, confirmResult.message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          })
        } else {
          return bot.sendMessage(chatId, "I didn't find a pending action to confirm. What would you like to do?", { 
            parse_mode: 'Markdown'
          })
        }
      }

      // Process with Sender AI
      console.log(`[Sender] Processing message from user ${userId} (type: ${typeof userId}): "${text.substring(0, 50)}..."`)
      const aiResponse = await aiAgent.processNaturalLanguage(
        text,
        userId,
        { 
          walletAddress: user?.wallet_address, 
          username: user?.username 
        },
        bot
      )
      // Handle both string and object responses
      const responseMessage = typeof aiResponse === 'object' ? aiResponse.message : aiResponse
      const hasCloseButton = typeof aiResponse === 'object' ? aiResponse.hasCloseButton : false
      
      console.log(`[Sender] AI response generated:`, responseMessage ? `${responseMessage.substring(0, 100)}...` : 'null')
      
      // Check if response indicates needsConfirmation
      if (responseMessage && responseMessage.includes('Reply "yes" or "confirm"')) {
        console.log(`[Sender] ✅ Payment confirmation prompt sent to user`)
      }

      // Send response
      if (responseMessage) {
        // Check if this is a private key export that needs auto-deletion
        const isPrivateKeyMessage = responseMessage.includes('Your Private Key:') || 
                                     responseMessage.includes('🔐 **Your Private Key:**');
        
        // Check if this is a list view that needs a close button
        // Either from the hasCloseButton flag or by detecting list view patterns
        const isListView = hasCloseButton ||
                          responseMessage.includes('📋 **Your Recent Transactions:**') ||
                          responseMessage.includes('📅 **Scheduled Payments**') ||
                          responseMessage.includes('📊 **Your Wallet Insights:**') ||
                          responseMessage.includes('**Your Transaction History:**');
        
        // Create inline keyboard with close button for list views
        const replyMarkup = isListView ? {
          inline_keyboard: [[
            { text: '❌ Close', callback_data: 'close_message' }
          ]]
        } : undefined;
        
        const sentMessage = await bot.sendMessage(chatId, responseMessage, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: replyMarkup
        });
        
        // Auto-delete private key messages after 5 seconds
        if (isPrivateKeyMessage && sentMessage && sentMessage.message_id) {
          setTimeout(async () => {
            try {
              await bot.deleteMessage(chatId, sentMessage.message_id);
              console.log(`[Sender] Auto-deleted private key message for user ${userId}`);
            } catch (deleteError) {
              // Message might already be deleted or bot doesn't have permission
              console.warn(`[Sender] Could not delete message:`, deleteError.message);
            }
          }, 5000); // 5 seconds
        }
        
        return sentMessage;
      } else {
        return bot.sendMessage(chatId, "I'm having trouble processing that. Could you try rephrasing?", { 
          parse_mode: 'Markdown'
        })
      }

    } catch (error) {
      console.error('[Sender] Error processing message:', error)
      
      // Friendly error message
      return bot.sendMessage(
        chatId,
        `Oops! 😅 I encountered an issue. Let me try again...\n\n` +
        `If this keeps happening, try rephrasing your question or ask me:\n` +
        `• "What can you do?"\n` +
        `• "Help me"`,
        { parse_mode: 'Markdown' }
      )
    }
  })

  // Handle callback queries (inline button clicks)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id
    const messageId = query.message.message_id
    const data = query.data

    // Answer the callback query to remove loading state
    await bot.answerCallbackQuery(query.id)

    if (data === 'close_message') {
      try {
        await bot.deleteMessage(chatId, messageId)
        console.log(`[Sender] User ${query.from.id} closed message ${messageId}`)
      } catch (error) {
        // Message might already be deleted or bot doesn't have permission
        console.warn(`[Sender] Could not delete message:`, error.message)
        // Try to edit the message instead
        try {
          await bot.editMessageText('✅ Closed', {
            chat_id: chatId,
            message_id: messageId
          })
        } catch (editError) {
          console.warn(`[Sender] Could not edit message:`, editError.message)
        }
      }
    }
  })

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('[Sender] Polling error:', error.message)
  })

  console.log('[Sender] Bot handlers registered - Sender AI is ready! 🤖')
}

