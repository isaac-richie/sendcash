# 📊 Polymarket Prediction Request - Log Analysis

**What happens when a user asks about Polymarket predictions**

---

## 🔍 Expected Log Flow

When a user asks about Polymarket predictions, you should see these logs:

### **1. Message Received**
```
[Sender] 📨 Received message: {
  chatId: ...,
  userId: ...,
  text: "predict Lakers vs Warriors" (or similar),
  hasText: true
}
```

### **2. Intent Classification**
```
[AI Agent] Intent classified: predict_game (confidence: 0.95)
```
OR
```
[AI Agent] Intent classified: search_markets (confidence: 0.90)
```

### **3. Prediction Execution**
```
[AI Agent] Searching for game prediction: Lakers vs Warriors
```
OR
```
[AI Agent] Searching markets: NBA
```

### **4. Polymarket API Call**
```
[Polymarket Service] Searching markets...
```
OR
```
[Polymarket] GraphQL query failed: ... (if error)
```

### **5. Response Generated**
```
[AI Agent] Action executed: { success: true, hasMessage: true }
[Sender] AI response generated: ...
```

---

## 🎯 What to Look For

### **Successful Prediction Request:**
1. ✅ Intent classified as `predict_game` or `search_markets`
2. ✅ `[AI Agent] Searching for game prediction: ...` log
3. ✅ `[Polymarket Service]` logs (API calls)
4. ✅ Response message generated

### **Potential Issues:**
1. ⚠️ Intent misclassified (wrong intent)
2. ⚠️ GraphQL query errors
3. ⚠️ No markets found
4. ⚠️ API connection errors

---

## 📝 How to Check Logs

### **Option 1: Check Server Console**
The server is running (PID: 69006). Check the terminal where it was started.

### **Option 2: Check Log File**
```bash
tail -f /tmp/sendcash-server.log
```

### **Option 3: Check Database**
```bash
sqlite3 backend/data/sendcash.db "SELECT * FROM polymarket_bets ORDER BY created_at DESC LIMIT 5;"
```

### **Option 4: Add Logging**
Add more detailed logging to see what's happening.

---

## 🔧 Current Implementation

### **Functions Involved:**
1. `executePredictGame(message)` - Handles prediction requests
2. `executeSearchMarkets(message)` - Handles market searches
3. `getGamePrediction(searchQuery)` - Fetches from Polymarket
4. `searchMarkets(searchQuery, limit)` - Searches markets

### **Log Points:**
- `[AI Agent] Searching for game prediction: {query}`
- `[AI Agent] Searching markets: {query}`
- `[Polymarket Service] Error fetching markets: ...`
- `[Polymarket] GraphQL query failed: ...`

---

## 🚨 Common Issues

### **1. No Markets Found**
**Log:** `No prediction markets found for "{query}"`
**Cause:** Search query too specific or no matching markets
**Fix:** Try broader search terms

### **2. GraphQL Errors**
**Log:** `[Polymarket] GraphQL query failed: ...`
**Cause:** Subgraph schema mismatch or API issues
**Fix:** System falls back to other subgraphs automatically

### **3. Intent Misclassification**
**Log:** Intent classified as `general_chat` instead of `predict_game`
**Cause:** Message not clear enough
**Fix:** User should be more specific (e.g., "predict Lakers")

---

## 📊 What Should Happen

### **User:** "predict Lakers vs Warriors"

1. **AI Agent** classifies as `predict_game`
2. **Extracts** search query: "Lakers vs Warriors"
3. **Calls** `getGamePrediction("Lakers vs Warriors")`
4. **Polymarket Service** searches markets
5. **GraphQL** query to Polymarket subgraph
6. **Returns** market data
7. **Formats** and displays to user

### **Expected Response:**
```
📊 **Lakers vs Warriors Prediction Market**

[Market details with odds, outcomes, etc.]
```

---

## 🔍 Debugging Steps

1. **Check Intent Classification:**
   - Look for `[AI Agent] Intent classified: ...`
   - Should be `predict_game` or `search_markets`

2. **Check API Calls:**
   - Look for `[AI Agent] Searching for game prediction: ...`
   - Look for `[Polymarket Service]` logs

3. **Check Errors:**
   - Look for `[Polymarket] GraphQL query failed`
   - Look for `[AI Agent] Error executing game prediction`

4. **Check Response:**
   - Look for `[AI Agent] Action executed: { success: true }`
   - Check if user received a response

---

## 💡 Next Steps

To see the actual logs from the user's request:
1. Check the terminal where server is running
2. Or add more detailed logging
3. Or check Telegram bot responses

**Note:** The server is running but logs may not be captured in the log file. Check the actual console output.

---

**Status:** Ready to analyze logs when available



