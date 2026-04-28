# Deploy on Base

Mini Farcaster app to deploy an ERC20 token on Base with a simple form-first UI and a Remix-like deployment engine.

## What it does

- Connect wallet via Farcaster SDK or MetaMask fallback
- Switch to Base Mainnet or Base Sepolia
- Fill in:
  - token name
  - token symbol
  - initial supply
- Preview a generated Solidity contract
- Compile locally for validation
- Deploy the contract
- Save deployed contract history in localStorage
- Optionally deploy 5 times for quest workflows

## Local run

Use any static server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Notes

- The app is fully client-side.
- The contract source is stored in `contracts/ERC20Token.sol`.
- The deployment artifact is precompiled into `artifacts/ERC20Token.json`.
- The Farcaster manifest template is in `.well-known/farcaster.json`.
- To make the app fully verifiable inside Farcaster, the manifest must be signed with a real `accountAssociation`.

## Files

- `index.html` — layout and styling
- `app.js` — wallet connect, compile preview, deployment logic
- `contracts/ERC20Token.sol` — deployable ERC20 token template
- `artifacts/ERC20Token.json` — ABI + bytecode
- `assets/icon.svg` — app icon
- `assets/og.svg` — preview image
