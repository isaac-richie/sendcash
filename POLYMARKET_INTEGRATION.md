# 🎯 Polymarket Integration

## Overview

SendCash AI agent now supports game predictions through Polymarket integration! Users can ask the AI agent to predict game outcomes, search prediction markets, and view sports markets.

## Features

✅ **Game Predictions** - Ask the AI to predict game outcomes  
✅ **Market Search** - Search for specific prediction markets  
✅ **Sports Markets** - View available sports prediction markets  
✅ **Place Bets** - Bet YES or NO on any Polymarket market  
✅ **View Bets** - Check your active bets and positions  
✅ **Natural Language** - Ask in plain English  
✅ **Caching** - Results cached for 5 minutes for performance  

## How It Works

The integration uses **The Graph** subgraphs to access Polymarket data:

1. **Main Subgraph** (requires API key) - Full access via The Graph
2. **Goldsky Subgraphs** (no API key) - Free public access

The service automatically falls back to the free Goldsky subgraph if no API key is configured.

## Setup

### Optional: Get The Graph API Key

For better performance and more queries, get a free API key:

1. Visit [The Graph Studio](https://thegraph.com/studio)
2. Connect your wallet
3. Go to [API Keys](https://thegraph.com/studio/apikeys/)
4. Create a new API key
5. Add to `.env`:
   ```bash
   THE_GRAPH_API_KEY=your_api_key_here
   ```

**Free Tier**: 100,000 queries/month

### Without API Key

The service works without an API key using the free Goldsky subgraph endpoint. Just start using it!

## Usage Examples

Users can interact with the AI agent naturally:

### Game Predictions
```
User: "Predict Lakers vs Warriors"
User: "Who will win the Super Bowl?"
User: "Game prediction for Lakers"
```

### Market Search
```
User: "Search markets for NBA"
User: "Show me basketball predictions"
User: "Find markets about football"
```

### Sports Markets
```
User: "Show sports markets"
User: "What sports predictions are available?"
User: "List all sports markets"
```

### Place Bets
```
User: "Bet $10 YES on Russia Ukraine ceasefire"
User: "Place NO bet on Lakers for $50"
User: "I want to bet YES $25 on Super Bowl"
User: "Bet NO on market X"
```

### View Bets
```
User: "Show my bets"
User: "What bets do I have?"
User: "My positions"
```

## Technical Details

### Service File
- **Location**: `backend/services/polymarketService.js`
- **Endpoints**: Uses The Graph subgraphs
- **Caching**: 5-minute cache for markets and predictions

### AI Agent Integration
- **Intent Classification**: New intents added:
  - `predict_game` - Game prediction requests
  - `search_markets` - Market search requests
  - `view_sports_markets` - Sports markets viewing
  - `place_bet` - Place YES/NO bets on markets
  - `view_bets` - View user's active bets

- **Methods Added**:
  - `executePredictGame()` - Handle prediction requests
  - `executeSearchMarkets()` - Handle market searches
  - `executeViewSportsMarkets()` - Show sports markets
  - `executePlaceBet()` - Handle bet placement
  - `executeViewBets()` - Show user's bets
  - `extractBetIntent()` - Extract bet details from message
  - `manualExtractBet()` - Fallback regex extraction

### API Endpoints

The service uses these Polymarket subgraph endpoints:

1. **Main Subgraph** (with API key):
   ```
   https://gateway.thegraph.com/api/{api-key}/subgraphs/id/Bx1W4S7kDVxs9gC3s2G6DS8kdNBJNVhMviCtin2DiBp
   ```

2. **Goldsky Subgraphs** (no API key):
   - Activity: `https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn`
   - Orders: `https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn`
   - Positions: `https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn`

## Testing

### Test API Connection
```bash
cd backend
node tests/test-polymarket-api.js
```

### Test User Simulation
```bash
cd backend
node tests/test-prediction-simulation.js
```

### Test Betting Simulation
```bash
cd backend
node tests/test-betting-simulation.js
```

### Test Integration
```bash
cd backend
node tests/test-polymarket-integration.js
```

## Response Format

The AI agent returns formatted market data:

```
📊 **Lakers vs Warriors**

**Current Predictions:**
1. **Lakers Win**: 45.2%
2. **Warriors Win**: 54.8%

📅 Ends: Dec 25, 2024
💰 Liquidity: $12,345.67
📈 Volume: $5,678.90

🔗 Market ID: `0x1234...`
```

## Error Handling

The service gracefully handles:
- API unavailability
- Network errors
- Invalid queries
- Empty results

Users receive friendly error messages if something goes wrong.

## Caching

To improve performance and reduce API calls:
- **Markets**: Cached for 5 minutes
- **Predictions**: Cached for 5 minutes
- **Cache Keys**: Based on search query

## Betting Flow

When a user places a bet:

1. **User Request**: "Bet $10 YES on Russia Ukraine ceasefire"
2. **Intent Classification**: AI identifies `place_bet` intent
3. **Bet Extraction**: Extracts market, side (YES/NO), and amount
4. **Market Search**: Finds the matching Polymarket market
5. **Bet Preparation**: Prepares the bet order with token IDs
6. **Confirmation**: Shows bet details and asks for confirmation
7. **Execution**: (Coming soon) Executes bet via Polymarket CLOB API

### Bet Order Structure

```javascript
{
  marketId: "0x123...",
  marketQuestion: "Russia x Ukraine ceasefire in 2025?",
  side: "YES", // or "NO"
  tokenId: "0x123...:0", // YES token ID
  amount: 10, // USD
  price: 0.5, // Estimated price
  shares: 20, // Number of shares
  orderType: "GTC" // Good-Till-Cancelled
}
```

## Full Execution Mode ✅

**Status: FULLY IMPLEMENTED**

The system now supports complete bet execution:

1. **Order Signing** - Uses EIP-712 signatures with user's private key
2. **CLOB API Integration** - Places orders directly on Polymarket
3. **Database Tracking** - Stores all bets with status tracking
4. **Wallet Integration** - Uses user's deterministic wallet for signing
5. **Bet Management** - View active bets, track status

### Execution Flow

1. User: "Bet $10 YES on Russia Ukraine ceasefire"
2. AI extracts: market, side, amount
3. AI searches for market
4. AI prepares bet order
5. User confirms: "yes"
6. **System signs order with user's private key**
7. **System places order on Polymarket CLOB API**
8. **System stores bet in database**
9. User receives confirmation with order ID

### Database Schema

Bets are stored in `polymarket_bets` table:
- `user_id` - Telegram user ID
- `market_id` - Polymarket market ID
- `side` - YES or NO
- `amount` - Bet amount in USD
- `price` - Price per share
- `shares` - Number of shares
- `order_id` - Polymarket order ID
- `order_hash` - Order hash
- `status` - pending, submitted, filled, cancelled, failed

## Future Enhancements

Potential improvements:
- [x] Bet placement intent recognition
- [x] Bet order preparation
- [x] Actual bet execution via Polymarket CLOB API
- [x] Wallet integration for bet payments
- [x] Database tracking
- [ ] Real-time order status updates
- [ ] Market price fetching from orderbook
- [ ] Market filtering by category
- [ ] Historical prediction data
- [ ] P&L tracking
- [ ] Bet cancellation

## Related Files

- `backend/services/polymarketService.js` - Main service (includes betting functions)
- `backend/services/aiAgent.js` - AI agent integration (includes bet handling)
- `backend/tests/test-polymarket-api.js` - API tests
- `backend/tests/test-prediction-simulation.js` - User simulation
- `backend/tests/test-betting-simulation.js` - Betting simulation
- `ENV_VARIABLES.md` - Environment variable documentation

## Support

For issues or questions:
1. Check API connectivity
2. Verify environment variables
3. Review test outputs
4. Check Polymarket API status

---

**Status**: ✅ Integrated and Ready  
**Last Updated**: 2024



