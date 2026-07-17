# Kotak Neo Trading MCP Server

An MCP (Model Context Protocol) server designed to orchestrate trading on Kotak Neo directly from AI environments (like Claude Desktop or custom agents). It provides an entirely automated, stateless API execution layer running locally on Node.js.

## Key Features
- **Military-Grade Security (`SecureVault`)**: Credentials (Mobile, UCC, TOTP Secret, MPIN, Consumer Key) are AES-256-GCM encrypted and never pass through the AI model. 
- **Automated TOTP Generation**: The server handles TOTP generation dynamically on login using your saved Base32 secret key.
- **Smart Order Commands**: Supports easy string commands for order placement like `NIFTY 24500 CE 30 L 110`.
- **Local Master Data Caching**: Reads NSE FO master cache to accurately resolve trading symbols and instrument tokens.
- **Order Management**: Supports fetching order book, open positions, margin, modifying orders, and cancelling orders.

## Setup Instructions

### 1. Initialize the Secure Vault

Before running the server via MCP, you **must** configure your secure credential vault locally.

Run the following command in the project directory:
```bash
node index.js --setup
```

You will be prompted to securely enter:
1. Kotak Mobile Number
2. Kotak UCC (User ID)
3. Kotak TOTP Base32 Key
4. Kotak MPIN
5. Kotak Consumer Key

You will then be asked to set a **Master Password**. This password encrypts your vault.

### 2. Configure MCP Client

Add the following to your MCP client configuration (e.g. Claude Desktop config):

```json
{
  "mcpServers": {
    "kotak-neo-mcp": {
      "command": "node",
      "args": [
        "path/to/Kotak-Neo-Trading-MCP/index.js"
      ]
    }
  }
}
```

### 3. Usage via AI

When talking to the AI, simply provide your Master Password to initiate the login:
*“Login to Kotak Neo using my master password [YOUR_PASSWORD].”*

The AI will handle the rest, calling the `login` tool, decrypting the vault locally, and generating the live 6-digit TOTP pin automatically.

## Available MCP Tools

- `login`: Logs into Kotak Neo using the `master_password`.
- `place_order`: Places an order using a Smart String command. (e.g. `buy_or_sell: 'B'`, `command: 'NIFTY 24500 CE 30 L 110'`)
- `modify_order`: Modifies an open order's price and quantity.
- `cancel_order`: Cancels an open order by ID.
- `get_order_book`: Retrieves the user's order book.
- `get_positions`: Retrieves current positions.
- `check_margin`: Retrieves available trading margin.
- `get_nearest_expiry_option`: Fetches the exact trading symbol and token for the nearest expiry option (e.g., `NIFTY 24500 CE`).

## CLI Utilities
- `node index.js --setup` : Configure credentials
- `node index.js --status` : Check if a vault exists
- `node index.js --delete` : Securely wipe your vault credentials
