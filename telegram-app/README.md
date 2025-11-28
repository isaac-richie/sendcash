# SendCash Telegram Mini App

React web application that runs as a Telegram Mini App.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with contract addresses after deployment.

4. Start development server:
```bash
npm run dev
```

## Building for Production

```bash
npm run build
```

The `dist/` folder contains the production build. Deploy this to Vercel, Netlify, or any static hosting service.

**Note**: Before deploying, create actual icon files:
- `public/icon-192.png` (192x192 pixels)
- `public/icon-512.png` (512x512 pixels)

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Get your bot token
3. Set the Mini App URL in bot settings:
   - Use `/newapp` command in BotFather
   - Provide the URL where your app is hosted

## Environment Variables

- `VITE_USERNAME_REGISTRY_ADDRESS` - UsernameRegistry contract address
- `VITE_SEND_CASH_ADDRESS` - SendCash contract address
- `VITE_PAYMASTER_ADDRESS` - Paymaster contract address
- `VITE_USDC_ADDRESS` - USDC token address on Scroll
- `VITE_USDT_ADDRESS` - USDT token address on Scroll
- `VITE_API_URL` - Backend API URL
- `VITE_SCROLL_RPC` - Scroll RPC endpoint

