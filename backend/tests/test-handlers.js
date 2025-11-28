import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { botHandlers } from './bot/handlers.js';

dotenv.config();

// Mock bot for testing
class MockBot {
  constructor() {
    this.handlers = [];
    this.messageHandlers = [];
  }
  
  onText(regex, callback) {
    this.handlers.push({ type: 'text', regex: regex.toString(), callback: typeof callback });
    console.log(`  ✅ Registered: ${regex.toString()}`);
  }
  
  on(event, callback) {
    this.messageHandlers.push({ event, callback: typeof callback });
    console.log(`  ✅ Registered event: ${event}`);
  }
  
  sendMessage() {
    return Promise.resolve({});
  }
}

console.log('🧪 Testing Handler Registration...\n');
const mockBot = new MockBot();
botHandlers(mockBot);

console.log('\n📊 Handler Summary:');
console.log(`  Text handlers: ${mockBot.handlers.length}`);
console.log(`  Event handlers: ${mockBot.messageHandlers.length}`);
console.log(`  Total: ${mockBot.handlers.length + mockBot.messageHandlers.length}`);

const expectedHandlers = 7; // /start, /register, /balance, /send, /confirm, /history, /help
if (mockBot.handlers.length >= expectedHandlers) {
  console.log('\n✅ All handlers registered successfully!');
  process.exit(0);
} else {
  console.log(`\n⚠️  Expected ${expectedHandlers} handlers, found ${mockBot.handlers.length}`);
  process.exit(1);
}
