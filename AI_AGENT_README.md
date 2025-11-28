# 🤖 SendCash AI Agent

**Intelligent on-chain activity analyzer ready for LLM integration**

The AI Agent understands and analyzes all on-chain activities in SendCash, providing insights that can be used with LLMs for natural language processing.

---

## 🎯 Purpose

The AI Agent is designed to:
- **Understand on-chain activities** - Analyze transactions, balances, and patterns
- **Generate insights** - Provide intelligent observations about wallet activity
- **Detect anomalies** - Identify unusual transaction patterns
- **Format for LLM** - Structure data for natural language processing
- **Ready for integration** - Can be connected to OpenAI, Claude, or other LLMs

---

## 🏗️ Architecture

```
On-Chain Data → AI Agent → Analysis → Insights → LLM Format
     ↓              ↓           ↓          ↓
  Transactions   Patterns   Statistics  Natural Language
  Balances       Trends     Alerts      Responses
  Events         Anomalies  Insights
```

---

## 📊 Capabilities

### 1. **Wallet Activity Analysis**
Analyzes complete wallet activity including:
- Current balances (all tokens)
- Transaction history
- Payment statistics (sent/received)
- Top recipients and senders
- Activity patterns (frequency, timing)
- AI-generated insights

### 2. **Transaction Analysis**
Deep analysis of individual transactions:
- Parse PaymentSent events
- Extract payment details
- Calculate fees
- Generate transaction-specific insights

### 3. **Activity Summaries**
Time-based activity summaries:
- Total transactions in period
- Total volume
- Unique counterparties
- Token usage breakdown

### 4. **Unusual Activity Detection**
Security-focused anomaly detection:
- Unusually large transactions
- High frequency alerts
- New counterparty detection
- Risk level assessment

### 5. **LLM-Ready Formatting**
Structures data for LLM consumption:
- Human-readable format
- Context-rich summaries
- Structured insights
- Ready for prompt injection

---

## 🚀 Usage

### Basic Usage

```javascript
import { aiAgent } from './services/aiAgent.js'

// Initialize
await aiAgent.initialize()

// Analyze wallet activity
const analysis = await aiAgent.analyzeWalletActivity(walletAddress)

// Get insights
console.log(analysis.insights)

// Format for LLM
const llmFormat = aiAgent.formatForLLM(analysis)
```

### Analyze Transaction

```javascript
const txAnalysis = await aiAgent.analyzeTransaction(txHash)
console.log(txAnalysis.paymentData)
console.log(txAnalysis.insights)
```

### Activity Summary

```javascript
const summary = await aiAgent.getActivitySummary(walletAddress, 30) // Last 30 days
console.log(`Total Volume: $${summary.totalVolume}`)
```

### Detect Unusual Activity

```javascript
const alerts = await aiAgent.detectUnusualActivity(walletAddress)
console.log(`Risk Level: ${alerts.riskLevel}`)
console.log(`Alerts: ${alerts.alerts.length}`)
```

---

## 📋 Test the AI Agent

```bash
# Run basic tests
cd backend
node tests/test-ai-agent.js

# Test with specific transaction
node tests/test-ai-agent.js <tx_hash>
```

---

## 🔮 Future LLM Integration

The AI Agent is designed to work seamlessly with LLMs:

### Example Integration

```javascript
import { aiAgent } from './services/aiAgent.js'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function answerUserQuery(userMessage, walletAddress) {
  // Get on-chain analysis
  const analysis = await aiAgent.analyzeWalletActivity(walletAddress)
  const llmFormat = aiAgent.formatForLLM(analysis)
  
  // Build prompt with context
  const prompt = `${llmFormat}\n\nUser Question: ${userMessage}\n\nAnswer based on the wallet activity above.`
  
  // Get LLM response
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are SendCash AI, a helpful payment assistant." },
      { role: "user", content: prompt }
    ]
  })
  
  return response.choices[0].message.content
}
```

### Example Queries

With LLM integration, users can ask:
- "How much did I spend this month?"
- "Who did I send the most money to?"
- "What's my average transaction size?"
- "Show me my spending patterns"
- "Am I spending more than usual?"

---

## 📊 Analysis Output Structure

### Wallet Activity Analysis

```javascript
{
  address: "0x...",
  balances: {
    USDC: { amount: "100.00", raw: "100000000", decimals: 6 },
    USDT: { amount: "50.00", raw: "50000000", decimals: 6 }
  },
  paymentStats: {
    totalSent: 450.00,
    totalReceived: 200.00,
    transactionCount: 15,
    topRecipients: [
      { username: "@alice", amount: "150.00" },
      { username: "@bob", amount: "100.00" }
    ],
    topSenders: [...]
  },
  patterns: {
    transactionFrequency: "medium",
    averageTransactionAmount: 30.00,
    mostActiveDay: "Friday"
  },
  insights: [
    "💰 You have $150.00 across all tokens.",
    "📊 Your transaction frequency is medium.",
    "👤 Your most frequent recipient is @alice ($150.00 total)."
  ]
}
```

---

## 🔒 Privacy & Security

- **No data storage**: Analysis is performed on-demand
- **Local processing**: All analysis happens locally
- **No external calls**: Doesn't send data to third parties
- **User-controlled**: Users can choose when to analyze

---

## 🎯 Key Features

✅ **On-Chain Understanding** - Reads and understands blockchain data  
✅ **Pattern Recognition** - Identifies spending patterns and trends  
✅ **Anomaly Detection** - Flags unusual activity  
✅ **Insight Generation** - Creates human-readable insights  
✅ **LLM-Ready** - Formats data for natural language processing  
✅ **Extensible** - Easy to add new analysis capabilities  

---

## 📝 Next Steps

1. **Integrate with LLM** - Connect to OpenAI/Claude for natural language
2. **Add More Analysis** - Spending categories, budget tracking
3. **Real-Time Monitoring** - Watch for new transactions
4. **Predictive Analytics** - Predict future spending patterns
5. **Voice Interface** - Voice commands via Telegram

---

**The AI Agent is ready!** It understands on-chain activities and is prepared for LLM integration when you're ready. 🚀


