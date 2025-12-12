# 📊 Polymarket Prediction Markets - How We Fetch Data

**Complete overview of how we fetch prediction markets from Polymarket**

---

## ✅ Yes, We Fetch Prediction Markets!

### **Data Sources:**

1. **The Graph Subgraphs** (Primary)
   - Uses GraphQL queries to fetch market data
   - Multiple subgraph endpoints available
   - Fallback chain: Main (with API key) → Activity → Orders

2. **Polymarket CLOB API** (Secondary)
   - Real-time market prices
   - Order placement
   - Price quotes

---

## 🔍 Functions That Fetch Markets

### **1. `fetchMarkets(options)`**
**What it does:**
- Fetches general prediction markets
- Supports filtering by category, limit, search
- Returns array of market data

**Query:**
```graphql
query GetMarkets {
  fixedProductMarketMakers(
    first: ${limit}
    orderBy: createdAt
    orderDirection: desc
  ) {
    id
    question {
      title
      description
      endDate
      outcomes
    }
    volume
    liquidity
    active
  }
}
```

**Returns:**
- Market question/title
- Description
- End date
- Outcomes (YES/NO options)
- Volume & liquidity
- Active/closed status

---

### **2. `searchMarkets(searchQuery, limit)`**
**What it does:**
- Searches markets by keyword
- Filters by question title
- Returns matching markets

**Query:**
```graphql
query SearchMarkets {
  fixedProductMarketMakers(
    where: {
      condition_: {
        question_: {
          title_contains_nocase: "${searchQuery}"
        }
      }
    }
  ) {
    ...
  }
}
```

**Example:**
- Search "NBA" → Returns NBA-related markets
- Search "Election" → Returns election markets
- Search "Crypto" → Returns crypto markets

---

### **3. `getSportsMarkets(limit)`**
**What it does:**
- Fetches sports/game markets specifically
- Filters by sports keywords (NBA, NFL, soccer, etc.)
- Returns sports-related prediction markets

**Keywords filtered:**
- sports, game, basketball, football, soccer
- baseball, hockey, nba, nfl, mlb, nhl

**Example:**
- "Will Lakers win the championship?"
- "Super Bowl winner"
- "World Cup predictions"

---

### **4. `getMarketById(marketId)`**
**What it does:**
- Fetches a specific market by ID
- Gets full market details
- Returns single market object

**Use case:**
- When user wants details about a specific market
- Before placing a bet
- To show market information

---

### **5. `getGamePrediction(searchQuery)`**
**What it does:**
- High-level function for game predictions
- Searches markets by query
- Returns most relevant market (highest liquidity/volume)
- Formats for display

**Example:**
- "Lakers vs Warriors" → Returns Lakers/Warriors market
- "Super Bowl" → Returns Super Bowl market
- "Election 2024" → Returns election market

---

## 🌐 API Endpoints Used

### **The Graph Subgraphs:**

1. **Main Subgraph** (if API key set)
   ```
   https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/...
   ```

2. **Activity Subgraph** (fallback, no API key)
   ```
   https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn
   ```

3. **Orders Subgraph** (fallback)
   ```
   https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn
   ```

### **Polymarket CLOB API:**

1. **Price Endpoint**
   ```
   GET https://clob.polymarket.com/price?token_id={tokenId}&side={side}
   ```

2. **Order Endpoint**
   ```
   POST https://clob.polymarket.com/order
   ```

---

## 📊 What Data We Fetch

### **Market Information:**
- ✅ Market ID / Condition ID
- ✅ Question title
- ✅ Description
- ✅ End date
- ✅ Outcomes (YES/NO options)
- ✅ Volume (trading volume)
- ✅ Liquidity
- ✅ Active/closed status
- ✅ Resolution source

### **Real-Time Prices:**
- ✅ Current market price (0-1)
- ✅ Best bid/ask prices
- ✅ Price per share

### **Market Status:**
- ✅ Active markets
- ✅ Closed markets
- ✅ Resolved markets
- ✅ Archived markets

---

## 🔄 How It Works

### **Flow:**

```
User Request
    ↓
AI Agent (classifies intent)
    ↓
Polymarket Service
    ↓
The Graph Subgraph (GraphQL)
    ↓
Market Data Retrieved
    ↓
Formatted & Returned
    ↓
User Sees Markets
```

### **Example:**

1. **User:** "Show me NBA markets"
2. **AI Agent:** Classifies as `search_markets` intent
3. **Service:** Calls `searchMarkets('NBA', 10)`
4. **GraphQL:** Queries Polymarket subgraph
5. **Response:** Returns 10 NBA-related markets
6. **Format:** Displays formatted list to user

---

## 🎯 Use Cases

### **1. Market Discovery**
- User searches for markets
- System fetches and displays results
- User can browse available markets

### **2. Game Predictions**
- User asks about a game/event
- System finds relevant market
- Shows prediction data

### **3. Sports Markets**
- User wants sports predictions
- System fetches sports markets
- Displays sports-related markets

### **4. Betting**
- User wants to place bet
- System fetches market details
- Gets real-time prices
- Prepares bet order

---

## 📈 Current Implementation Status

### **✅ Working:**
- ✅ Fetch general markets (`fetchMarkets`)
- ✅ Search markets (`searchMarkets`)
- ✅ Get sports markets (`getSportsMarkets`)
- ✅ Get market by ID (`getMarketById`)
- ✅ Get game predictions (`getGamePrediction`)
- ✅ Real-time price fetching (`getMarketPrice`)
- ✅ Market formatting (`formatMarket`, `formatMarketsList`)

### **✅ Features:**
- ✅ Multiple subgraph fallbacks
- ✅ Graceful error handling
- ✅ Schema adaptation (works with different subgraphs)
- ✅ Real-time price integration
- ✅ Market search functionality

---

## 🔧 Technical Details

### **GraphQL Queries:**
- Uses `fixedProductMarketMakers` entity
- Accesses `question` through `condition`
- Handles different subgraph schemas
- Returns empty array on errors (graceful degradation)

### **Data Transformation:**
- Converts subgraph data to our format
- Handles missing fields gracefully
- Normalizes outcomes (YES/NO)
- Formats dates and numbers

### **Error Handling:**
- Returns empty array on query failures
- Logs warnings instead of crashing
- Falls back to alternative subgraphs
- Handles schema mismatches

---

## 📝 Summary

**Yes, we fetch prediction markets from Polymarket!**

**How:**
- ✅ The Graph subgraphs (GraphQL)
- ✅ Polymarket CLOB API (REST)
- ✅ Multiple fallback endpoints

**What we fetch:**
- ✅ Market questions/titles
- ✅ Descriptions
- ✅ Outcomes (YES/NO)
- ✅ Prices
- ✅ Volume & liquidity
- ✅ Market status

**Functions:**
- ✅ `fetchMarkets()` - General markets
- ✅ `searchMarkets()` - Search by keyword
- ✅ `getSportsMarkets()` - Sports markets
- ✅ `getMarketById()` - Specific market
- ✅ `getGamePrediction()` - Game predictions

**Status:** ✅ **Fully implemented and working!**

---

**Last Updated:** December 2024



