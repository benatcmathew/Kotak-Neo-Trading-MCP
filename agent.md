# Agent Instructions and Project Details

## Strict Rules
1. This file must contain all the details of the project.
2. The agent needs to read this `agent.md` file on each chat before proceeding with any tasks.
3. The agent needs to update all the changes done in the conversations and changes made within this file.
4. The agent needs to perform a strict syntax check before pushing any code to GitHub.
5. The agent needs to push each change to GitHub.
6. The agent must provide a detailed summary and state what to do next in it.

## Project Details
The project is an MCP (Model Context Protocol) server for the Kotak Neo broker to facilitate trading via the official REST API architecture, entirely implemented in Node.js.
Key requirements:
- Use AES-256-GCM SecureVault for credential storage (`~/.kotak-neo-mcp/vault.enc`), maintaining military-grade security. 
- Fully automated TOTP generation via the `otplib` package. The AI uses the Master Password to decrypt the vault, and the server generates the 6-digit pin.
- Custom REST client (`KotakClient.js`) that directly implements Kotak Neo endpoints via `axios`.
- Support fetching `find_option_details` by reading a daily CSV cache (`nse_fo_cache.csv`) and parsing it with `papaparse` to locate nearest-expiry tokens.
- Maintain smart string commands for orders (e.g., `NIFTY 24500 CE 30 L 110`).

## Change Log
- **2026-07-17**: Initialized `agent.md` with strict rules. 
- **2026-07-17**: Replaced unofficial Kotak Neo npm packages with a custom `KotakClient.js` tailored for TOTP authentication endpoints (`login/v6/totp/login` and `validate`).
- **2026-07-17**: Added `papaparse` implementation of `find_option_details` in `KotakClient.js` to automatically parse and filter the local `nse_fo_cache.csv` file for nearest-expiry options.
- **2026-07-17**: Migrated to a new GitHub repository: `Kotak-Neo-Trading-MCP`.
- **2026-07-17**: Integrated the `SecureVault.js` system identical to Shoonya MCP. The Vault encrypts the `mobile_number`, `ucc`, `totp_key`, `mpin`, and `consumer_key` with a master password using `aes-256-gcm`. Added CLI setup flows (`--setup`, `--status`, `--delete`) in `index.js`.
- **2026-07-17**: Modified the `login` MCP tool to accept only a `master_password`. Added `otplib` to automatically generate the 6-digit TOTP pin on the fly.
- **2026-07-17**: Wrote extensive `README.md` to document the setup process and usage instructions for Claude Desktop/AI Agents.

## Login Details
- **Mobile Number**: Kotak registered mobile
- **UCC**: Kotak User ID
- **TOTP Base32 Key**: Secret key to generate live TOTP
- **MPIN**: 6-digit MPIN for validation
- **Consumer Key**: API Key generated on Kotak Neo API dashboard
- **Master Password**: User's chosen password to encrypt the AES-256-GCM vault.
