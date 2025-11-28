# 🔍 Debugging Guide - Payment & Balance Issues

## ✅ What's Been Fixed

Added comprehensive logging to track:
1. **Message Processing** - When messages are received
2. **Intent Classification** - What intent is detected
3. **Action Execution** - Results of actions
4. **Payment Confirmation** - Payment flow tracking
5. **Balance Checks** - Balance retrieval details

---

## 🔧 Changes Made

### 1. **Enhanced Logging in `senderHandlers.js`**
- Logs when messages are processed
- Logs confirmation handling
- Logs AI response generation
- Better error tracking

### 2. **Enhanced Logging in `aiAgent.js`**
- Logs intent classification
- Logs action execution results
- Logs payment execution
- Logs balance checks
- Logs pending action storage

### 3. **Improved Error Handling**
- Checks if responses exist before sending
- Provides fallback messages
- Better error messages for users

---

## 📊 How to Debug

### Check Server Logs

When a user sends a message, you should see:

```
[Sender] Processing message from user 123456: "What's my balance?"
[AI Agent] Intent classified: check_balance (confidence: 0.90)
[AI Agent] Executing check balance for: 0x...
[AI Agent] Retrieved balances: ['USDC', 'USDT']
[AI Agent] Balance check completed successfully
[AI Agent] Action executed: { intent: 'check_balance', success: true, hasMessage: true }
[Sender] AI response generated: 💰 Your Balances:...
```

### For Payments

```
[Sender] Processing message from user 123456: "Send $1 to alice"
[AI Agent] Intent classified: send_payment (confidence: 0.90)
[AI Agent] Action executed: { intent: 'send_payment', needsConfirmation: true }
[AI Agent] Stored pending action: send_payment for user 123456

[Sender] Processing confirmation from user 123456: "yes"
[AI Agent] Executing payment: $1 USDC to @alice
[AI Agent] Payment execution result: { success: true, hasMessage: true }
```

---

## 🐛 Common Issues & Fixes

### Issue 1: No Response to Balance Check

**Symptoms:**
- User asks "What's my balance?" but gets no response

**Debug Steps:**
1. Check logs for `[AI Agent] Intent classified`
2. Check logs for `[AI Agent] Executing check balance`
3. Check logs for `[AI Agent] Retrieved balances`
4. Check if `hasMessage: true` in action result

**Possible Causes:**
- Balance retrieval failed (check RPC connection)
- Empty balances object
- Error in message formatting

**Fix:**
- Added error handling in `executeCheckBalance`
- Added fallback for empty balances
- Added try-catch blocks

### Issue 2: No Response to Payment

**Symptoms:**
- User confirms payment but gets no response

**Debug Steps:**
1. Check logs for `[Sender] Processing confirmation`
2. Check logs for `[AI Agent] Executing payment`
3. Check logs for `[AI Agent] Payment execution result`
4. Check if `confirmResult.message` exists

**Possible Causes:**
- Payment execution failed
- Result object missing message
- Bot not sending message

**Fix:**
- Added null checks for `confirmResult.message`
- Added fallback message if missing
- Enhanced error logging

---

## 🔍 Logging Checklist

When debugging, check for these log entries:

### Balance Check Flow
- ✅ `[Sender] Processing message`
- ✅ `[AI Agent] Intent classified: check_balance`
- ✅ `[AI Agent] Executing check balance`
- ✅ `[AI Agent] Retrieved balances`
- ✅ `[AI Agent] Balance check completed`
- ✅ `[AI Agent] Action executed: { hasMessage: true }`
- ✅ `[Sender] AI response generated`

### Payment Flow
- ✅ `[Sender] Processing message`
- ✅ `[AI Agent] Intent classified: send_payment`
- ✅ `[AI Agent] Stored pending action`
- ✅ `[Sender] Processing confirmation`
- ✅ `[AI Agent] Executing payment`
- ✅ `[AI Agent] Payment execution result: { hasMessage: true }`

---

## 🚀 Next Steps

1. **Restart the server** to apply logging changes
2. **Test balance check** - Check logs for the flow above
3. **Test payment** - Check logs for the flow above
4. **Review logs** - Look for any missing steps or errors

---

## 📝 Log Format

All logs follow this format:
- `[Sender]` - Bot handler logs
- `[AI Agent]` - AI agent logs
- `[PaymentNotifications]` - Payment notification logs

Example:
```
[Sender] Processing message from user 123456: "What's my balance?"
[AI Agent] Intent classified: check_balance (confidence: 0.90)
[AI Agent] Executing check balance for: 0x1234...
[AI Agent] Retrieved balances: ['USDC']
[AI Agent] Balance check completed successfully
[AI Agent] Action executed: { intent: 'check_balance', success: true, hasMessage: true }
[Sender] AI response generated: 💰 Your Balances:...
```

---

## ✅ Status

**Logging Enhanced: COMPLETE** 🔍

All critical points in the flow now have logging to help debug issues.


