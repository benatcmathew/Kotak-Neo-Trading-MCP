#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const OTPAuth = require('otpauth');

const KotakClient = require('./KotakClient');
const { vaultExists, loadCredentials, deleteVault, interactiveSetup } = require('./SecureVault');

// ──────────────────────────────────────────────────────────
// CLI Mode: Handle --setup, --edit, --delete before MCP
// ──────────────────────────────────────────────────────────
const cliArg = process.argv[2];

if (cliArg === '--setup' || cliArg === '--edit') {
    interactiveSetup().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else if (cliArg === '--delete') {
    if (deleteVault()) {
        console.log('🗑️  Vault securely wiped and deleted.');
    } else {
        console.log('No vault found.');
    }
    process.exit(0);
} else if (cliArg === '--status') {
    if (vaultExists()) {
        console.log('✅ Credential vault exists at ~/.kotak-neo-mcp/vault.enc');
    } else {
        console.log('❌ No credential vault found. Run: node index.js --setup');
    }
    process.exit(0);
} else {
    // ──────────────────────────────────────────────────────────
    // MCP Server Mode (default)
    // ──────────────────────────────────────────────────────────
    startMCPServer();
}

function startMCPServer() {
    const server = new Server(
        {
            name: "kotak-neo-mcp",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    const client = new KotakClient();

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "login",
                    description: "Securely login to Kotak Neo using encrypted credentials from the local vault. Generates live TOTP automatically. Requires the master_password to decrypt the vault.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            master_password: { type: "string", description: "Master password to decrypt the credential vault" },
                        },
                        required: ["master_password"],
                    },
                },
                {
                    name: "place_order",
                    description: "Place an order using a smart order string. E.g., 'NIFTY 24500 CE 30 L 110'",
                    inputSchema: {
                        type: "object",
                        properties: {
                            buy_or_sell: { type: "string", description: "Must be exactly 'B' or 'S'" },
                            command: { type: "string" },
                        },
                        required: ["buy_or_sell", "command"],
                    },
                },
                {
                    name: "modify_order",
                    description: "Modify an existing open order.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            order_id: { type: "string" },
                            price: { type: "number" },
                            quantity: { type: "number" },
                            order_type: { type: "string" },
                        },
                        required: ["order_id", "price", "quantity", "order_type"],
                    },
                },
                {
                    name: "cancel_order",
                    description: "Cancel an open order.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            order_id: { type: "string" },
                        },
                        required: ["order_id"],
                    },
                },
                {
                    name: "get_order_book",
                    description: "Fetch the user's order book.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "get_positions",
                    description: "Fetch the user's positions.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "check_margin",
                    description: "Fetch available margin.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "get_nearest_expiry_option",
                    description: "Fetch trading symbol and token for the nearest expiry option.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            index: { type: "string", description: "e.g., 'NIFTY'" },
                            strike: { type: "number", description: "e.g., 24500" },
                            option_type: { type: "string", description: "'CE' or 'PE'" }
                        },
                        required: ["index", "strike", "option_type"],
                    }
                }
            ],
        };
    });

    function parseSmartOrderCommand(command) {
        const parts = command.trim().split(/\s+/);
        if (parts.length < 5) throw new Error("Invalid command format");
        
        const index = parts[0];
        const strike = parts[1];
        const option_type = parts[2];
        const quantity = parts[3];
        const order_type_code = parts[4]; 
        let price = "0";
        if (order_type_code === 'L' && parts.length >= 6) {
            price = parts[5];
        }
        
        return { index, strike, option_type, quantity, order_type_code, price };
    }

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        switch (request.params.name) {
            case "login": {
                const { master_password } = request.params.arguments;
                try {
                    // Decrypt credentials
                    const creds = loadCredentials(master_password);
                    
                    // Generate live TOTP token from saved Base32 Secret
                    const totpAuth = new OTPAuth.TOTP({
                        algorithm: 'SHA1',
                        digits: 6,
                        period: 30,
                        secret: OTPAuth.Secret.fromBase32(creds.totp_key.replace(/\s+/g, ''))
                    });
                    const live_totp = totpAuth.generate();

                    const loginRes = await client.totp_login(creds.mobile_number, creds.ucc, live_totp, creds.consumer_key);
                    if (loginRes.status === 'error') {
                        return { content: [{ type: "text", text: `Login Error: ${JSON.stringify(loginRes)}` }] };
                    }
                    const valRes = await client.totp_validate(creds.mpin);
                    return {
                        content: [{ type: "text", text: `Login Result: ${JSON.stringify(valRes)}` }],
                    };
                } catch (error) {
                    return { content: [{ type: "text", text: `Vault/Login Error: ${error.message}` }] };
                }
            }
            case "place_order": {
                const { buy_or_sell, command } = request.params.arguments;
                try {
                    const parsed = parseSmartOrderCommand(command);
                    const details = await client.find_option_details(parsed.index, parsed.strike, parsed.option_type);
                    
                    const tt = buy_or_sell === 'B' ? 'B' : 'S';
                    const pc = "NRML";
                    const es = "nse_fo";
                    
                    let order_type = parsed.order_type_code === 'L' ? 'L' : 'MKT';
                    
                    const resp = await client.place_order(
                        es, pc, parsed.price, order_type, parsed.quantity, "DAY", 
                        details.trading_symbol, tt, "NO", details.instrument_token
                    );
                    
                    return { content: [{ type: "text", text: `Place Order Result: ${JSON.stringify(resp)}` }] };
                } catch (err) {
                    return { content: [{ type: "text", text: `Error: ${err.message}` }] };
                }
            }
            case "modify_order": {
                const { order_id, price, quantity, order_type } = request.params.arguments;
                const resp = await client.modify_order(order_id, price, quantity, order_type);
                return { content: [{ type: "text", text: `Modify Order Result: ${JSON.stringify(resp)}` }] };
            }
            case "cancel_order": {
                const { order_id } = request.params.arguments;
                const resp = await client.cancel_order(order_id);
                return { content: [{ type: "text", text: `Cancel Order Result: ${JSON.stringify(resp)}` }] };
            }
            case "get_order_book": {
                const resp = await client.get_order_book();
                return { content: [{ type: "text", text: `Order Book: ${JSON.stringify(resp)}` }] };
            }
            case "get_positions": {
                const resp = await client.get_positions();
                return { content: [{ type: "text", text: `Positions: ${JSON.stringify(resp)}` }] };
            }
            case "check_margin": {
                const resp = await client.get_margin();
                return { content: [{ type: "text", text: `Margin: ${JSON.stringify(resp)}` }] };
            }
            case "get_nearest_expiry_option": {
                const { index, strike, option_type } = request.params.arguments;
                try {
                    const details = await client.find_option_details(index, strike, option_type);
                    return { content: [{ type: "text", text: `Option Details: ${JSON.stringify(details)}` }] };
                } catch (err) {
                    return { content: [{ type: "text", text: `Error: ${err.message}` }] };
                }
            }
            default:
                throw new Error("Unknown tool");
        }
    });

    async function main() {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Kotak Neo MCP server running on stdio");
    }

    main().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
