const axios = require('axios');
const fs = require('fs');
const Papa = require('papaparse');
const qs = require('qs');

class KotakClient {
    constructor(environment = 'prod') {
        this.environment = environment;
        this.consumer_key = '';
        this.neo_fin_key = 'neotradeapi';
        
        this.view_token = '';
        this.view_sid = '';
        
        this.edit_token = '';
        this.edit_sid = '';
        this.edit_rid = '';
        this.server_id = '';
        this.base_url = 'https://mnapi.kotaksecurities.com/';
        this.gw_base_url = 'https://gw-napi.kotaksecurities.com/';
        
        this.masterData = [];
        this.masterDataLoaded = false;
    }

    async totp_login(mobile_number, ucc, totp, consumer_key) {
        // Strip any accidental 'Bearer ' prefix if passed from user
        this.consumer_key = consumer_key.replace(/^Bearer\s+/i, ''); 
        
        // Ensure mobile number has +91
        let formatted_mobile = mobile_number.trim();
        if (!formatted_mobile.startsWith('+91')) {
            formatted_mobile = '+91' + formatted_mobile.replace(/^0+/, '');
        }
        
        const url = `https://mis.kotaksecurities.com/login/1.0/tradeApiLogin`;
        const headers = {
            'Authorization': this.consumer_key,
            'neo-fin-key': this.neo_fin_key,
            'Content-Type': 'application/json'
        };
        const body = {
            mobileNumber: formatted_mobile,
            ucc: ucc,
            totp: totp
        };

        try {
            const response = await axios.post(url, body, { headers });
            if (response.data && response.data.data) {
                this.view_token = response.data.data.token;
                this.view_sid = response.data.data.sid;
                return { status: 'success', data: response.data.data };
            }
            return { status: 'error', data: response.data };
        } catch (error) {
            return { status: 'error', message: error.message, details: error.response?.data };
        }
    }

    async totp_validate(mpin) {
        const url = `https://mis.kotaksecurities.com/login/1.0/tradeApiValidate`;
        const headers = {
            'Authorization': this.consumer_key,
            'neo-fin-key': this.neo_fin_key,
            'sid': this.view_sid,
            'Auth': this.view_token,
            'Content-Type': 'application/json'
        };
        const body = { mpin: mpin };

        try {
            const response = await axios.post(url, body, { headers });
            if (response.data && response.data.data) {
                const data = response.data.data;
                this.edit_token = data.token;
                this.edit_sid = data.sid;
                this.edit_rid = data.rid;
                this.server_id = data.hsServerId;
                if (data.baseUrl) {
                    this.base_url = data.baseUrl;
                }
                return { status: 'success', data: data };
            }
            return { status: 'error', data: response.data };
        } catch (error) {
            return { status: 'error', message: error.message, details: error.response?.data };
        }
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.edit_token}`,
            'Sid': this.edit_sid,
            'neo-fin-key': this.neo_fin_key,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
    }

    getAuthHeadersJSON() {
        return {
            'Authorization': `Bearer ${this.edit_token}`,
            'Sid': this.edit_sid,
            'neo-fin-key': this.neo_fin_key,
            'Content-Type': 'application/json'
        };
    }

    async place_order(exchange_segment, product, price, order_type, quantity, validity, trading_symbol, transaction_type, amo = "NO", instrument_token = null, trigger_price = "0") {
        const url = `${this.gw_base_url}Orders/2.0/quick/order/rule/ms/place?sId=${this.server_id}`;
        
        const body = {
            am: amo,
            dq: "0",
            es: exchange_segment,
            mp: "0",
            pc: product,
            pf: "N",
            pr: price.toString(),
            pt: order_type,
            qt: quantity.toString(),
            rt: validity,
            tp: trigger_price.toString(),
            ts: trading_symbol,
            tt: transaction_type,
            os: "WEB"
        };
        if (instrument_token) {
            body.tk = instrument_token.toString();
        }

        try {
            const response = await axios.post(url, qs.stringify(body), { headers: this.getAuthHeaders() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async modify_order(order_id, price, quantity, order_type, trigger_price = "0") {
        const url = `${this.gw_base_url}Orders/2.0/quick/order/vr/modify?sId=${this.server_id}`;
        const body = {
            on: order_id,
            am: "NO",
            dq: "0",
            mp: "0",
            pr: price.toString(),
            pt: order_type,
            qt: quantity.toString(),
            rt: "DAY",
            tp: trigger_price.toString(),
            os: "WEB"
        };
        try {
            const response = await axios.post(url, qs.stringify(body), { headers: this.getAuthHeaders() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async cancel_order(order_id, amo = "NO") {
        const url = `${this.gw_base_url}Orders/2.0/quick/order/cancel?sId=${this.server_id}`;
        const body = {
            on: order_id,
            am: amo
        };
        try {
            const response = await axios.post(url, qs.stringify(body), { headers: this.getAuthHeaders() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async get_order_book() {
        const url = `${this.gw_base_url}Orders/2.0/quick/user/orders?sId=${this.server_id}`;
        try {
            const response = await axios.get(url, { headers: this.getAuthHeadersJSON() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async get_positions() {
        const url = `${this.gw_base_url}Orders/2.0/quick/user/positions?sId=${this.server_id}`;
        try {
            const response = await axios.get(url, { headers: this.getAuthHeadersJSON() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async get_margin() {
        const url = `${this.gw_base_url}Orders/2.0/quick/user/check-margin?sId=${this.server_id}`;
        try {
            const response = await axios.get(url, { headers: this.getAuthHeadersJSON() });
            return response.data;
        } catch (error) {
            return { error: error.message, details: error.response?.data };
        }
    }

    async load_master_data() {
        if (this.masterDataLoaded) return true;
        const cachePath = "E:\\Data Base- Don't Delete\\TnW - Web Terminal\\backend\\data\\nse_fo_cache.csv";
        
        if (!fs.existsSync(cachePath)) {
            throw new Error(`Master cache not found at: ${cachePath}`);
        }
        
        return new Promise((resolve, reject) => {
            const results = [];
            Papa.parse(fs.createReadStream(cachePath), {
                header: true,
                dynamicTyping: false,
                skipEmptyLines: true,
                step: (result) => {
                    results.push(result.data);
                },
                complete: () => {
                    this.masterData = results;
                    this.masterDataLoaded = true;
                    resolve(true);
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    async find_option_details(index_name, strike, option_type) {
        await this.load_master_data();
        if (!this.masterDataLoaded) {
            throw new Error("Could not load master data from cache.");
        }

        const df = this.masterData;
        const target_strike = parseFloat(strike) * 100;

        let filtered = df.filter(row => {
            const inst = (row['pInstType'] || row['Instrument'] || '').trim();
            const sym = (row['pSymbolName'] || row['Symbol'] || '').trim();
            const strikeVal = row['dStrikePrice;'] || row['pStrikePrice'] || row['StrikePrice'] || "0";
            const opt = (row['pOptionType'] || row['OptionType'] || '').trim();
            
            return inst === 'OPTIDX' && 
                   sym === index_name && 
                   parseFloat(strikeVal) === target_strike && 
                   opt === option_type;
        });

        if (filtered.length === 0) {
            throw new Error(`No ${option_type} contracts found for ${index_name} at strike ${strike}`);
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let valid_expiries = [];
        filtered.forEach(row => {
            const expCol = row['pExpiryDate'] || row['Expiry'];
            // Expiry date from Kotak is usually in seconds epoch or a string
            let parsedExpiry = new Date(parseInt(expCol) * 1000); 
            if (isNaN(parsedExpiry.getTime())) {
                parsedExpiry = new Date(expCol);
            }
            if (!isNaN(parsedExpiry.getTime()) && parsedExpiry >= now) {
                valid_expiries.push({ row, date: parsedExpiry });
            }
        });

        if (valid_expiries.length === 0) {
            throw new Error("No valid future expiry dates found for these parameters.");
        }

        valid_expiries.sort((a, b) => a.date - b.date);
        
        const nearest = valid_expiries[0];
        const token = nearest.row['pSymbol'] || nearest.row['Token'];
        const trdSym = nearest.row['pTrdSymbol'] || nearest.row['TradingSymbol'];
        const lotSize = nearest.row['lLotSize'] || nearest.row['LotSize'];

        return {
            instrument_token: token,
            trading_symbol: trdSym,
            lot_size: parseInt(lotSize)
        };
    }
}

module.exports = KotakClient;
