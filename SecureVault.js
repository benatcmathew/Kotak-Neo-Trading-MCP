const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const VAULT_DIR = path.join(os.homedir(), '.kotak-neo-mcp');
const VAULT_FILE = path.join(VAULT_DIR, 'vault.enc');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_DIGEST = 'sha256';

function deriveKey(masterPassword, salt) {
    return crypto.pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

function encrypt(plaintext, masterPassword) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(masterPassword, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]);
}

function decrypt(data, masterPassword) {
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(masterPassword, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    try {
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch {
        throw new Error('DECRYPTION_FAILED: Invalid master password or corrupted vault.');
    }
}

function vaultExists() {
    return fs.existsSync(VAULT_FILE);
}

function saveCredentials(credentials, masterPassword) {
    if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    }

    const plaintext = JSON.stringify(credentials);
    const encryptedData = encrypt(plaintext, masterPassword);
    fs.writeFileSync(VAULT_FILE, encryptedData, { mode: 0o600 });
}

function loadCredentials(masterPassword) {
    if (!vaultExists()) {
        throw new Error('NO_VAULT: Credential vault not found. Run setup first.');
    }

    const encryptedData = fs.readFileSync(VAULT_FILE);
    const plaintext = decrypt(encryptedData, masterPassword);

    try {
        return JSON.parse(plaintext);
    } catch {
        throw new Error('VAULT_CORRUPTED: Failed to parse credentials from decrypted vault.');
    }
}

function deleteVault() {
    if (vaultExists()) {
        fs.unlinkSync(VAULT_FILE);
        return true;
    }
    return false;
}

function askQuestion(query, hidden = false) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        if (hidden) {
            rl.question(query, (answer) => {
                rl.close();
                console.log();
                resolve(answer);
            });
            rl._writeToOutput = function _writeToOutput(stringToWrite) {
                // If the string contains the query itself, we let it print
                if (stringToWrite.includes(query)) {
                    rl.output.write(stringToWrite);
                } 
                // Don't mask newlines
                else if (['\r\n', '\n', '\r'].includes(stringToWrite)) {
                    rl.output.write(stringToWrite);
                } 
                // Mask typed characters
                else {
                    // rl.output.write('*'); // can uncomment to show stars, or leave empty for total silence
                    rl.output.write('*');
                }
            };
        } else {
            rl.question(query, answer => {
                rl.close();
                resolve(answer);
            });
        }
    });
}

async function interactiveSetup() {
    console.log('--- Kotak Neo Secure Credential Setup ---');
    console.log('This will create an AES-256-GCM encrypted local vault.');
    console.log('These credentials will never leave this machine.\n');

    const mobile_number = await askQuestion('Kotak Mobile Number: ');
    const ucc = await askQuestion('Kotak UCC (User ID): ');
    const totp_key = await askQuestion('Kotak TOTP Base32 Key: ', true);
    const mpin = await askQuestion('Kotak MPIN: ', true);
    const consumer_key = await askQuestion('Kotak Consumer Key: ', true);
    
    console.log('\nNow choose a Master Password to encrypt the vault.');
    console.log('You will need to pass this Master Password to the AI so it can unlock the vault temporarily during login.');
    const masterPassword = await askQuestion('Master Password: ', true);
    const confirmPassword = await askQuestion('Confirm Master Password: ', true);

    if (masterPassword !== confirmPassword) {
        console.error('❌ Passwords do not match. Setup aborted.');
        return;
    }

    saveCredentials({ mobile_number, ucc, totp_key, mpin, consumer_key }, masterPassword);
    console.log('✅ Credentials encrypted and saved successfully.');
}

module.exports = {
    vaultExists,
    saveCredentials,
    loadCredentials,
    deleteVault,
    interactiveSetup
};
