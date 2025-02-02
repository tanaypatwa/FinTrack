const Discord = require('discord.js');
require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const port = process.env.PORT || 8080;
const schedule = require('node-schedule');

// Constants
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Global variables
let isBotReady = false;
let doc = null; // Google Sheets document instance

// Wrapper function for sheet operations
async function performSheetOperation(operation) {
    try {
        await initializeSheets();
        return await operation();
    } catch (error) {
        console.error('Sheet operation error:', error);
        throw error;
    }
}

// Initialize Discord client with required intents and proper error handling
const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS
    ],
    // Add proper connection handling options
    restWsBridgeTimeout: 5000,
    retryLimit: 3,
    restTimeOffset: 750, // Add delay between API calls
    failIfNotExists: false,
    waitGuildTimeout: 15000
});

// Connection management variables
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 5000;
let reconnectTimeout = null;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Enhanced connection management
async function connectWithBackoff() {
    try {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            logBot('ERROR', `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Waiting for manual intervention.`);
            return;
        }

        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
        logBot('INFO', `Attempting to connect... Attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} (Delay: ${delay}ms)`);

        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logBot('ERROR', 'Connection failed', error);
        reconnectAttempts++;
        
        // Clear any existing timeout
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        
        // Schedule next reconnect attempt with exponential backoff
        reconnectTimeout = setTimeout(connectWithBackoff, delay);
    }
}

// Initialize bot with better error handling
async function initializeBot() {
    try {
        logBot('INFO', 'Starting bot initialization');
        await setupGoogleSheet();
        await connectWithBackoff();
        logBot('SUCCESS', 'Bot initialized successfully');
    } catch (error) {
        logBot('ERROR', 'Bot initialization failed', error);
        process.exit(1);
    }
}

// Start the bot
initializeBot();

// Get or create current month's sheet
async function getCurrentMonthSheet() {
    try {
        const currentDate = new Date();
        const sheetTitle = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        console.log('Attempting to access sheet:', sheetTitle);

        // Ensure doc is initialized
        if (!doc) {
            console.log('Doc not initialized, setting up Google Sheet...');
            await setupGoogleSheet();
        }

        // Ensure doc info is loaded
        if (!doc.title) {
            console.log('Loading doc info...');
            await doc.loadInfo();
        }

        let sheet = doc.sheetsByTitle[sheetTitle];
        
        if (!sheet) {
            console.log('Creating new sheet for current month:', sheetTitle);
            sheet = await doc.addSheet({ 
                title: sheetTitle,
                headerValues: ['Date', 'Amount', 'Description', 'Payment Mode', 'Category']
            });
        }

        return sheet;
    } catch (error) {
        console.error('Error in getCurrentMonthSheet:', error);
        throw error;
    }
}

// Update client event handlers
client.once('ready', async () => {
    reconnectAttempts = 0; // Reset counter on successful connection
    logBot('INFO', `Logged in as ${client.user.tag}`);
    await setupGoogleSheet();
    logBot('INFO', 'Bot is online and sheets are ready!');
});

client.on('error', error => {
    logBot('ERROR', 'Discord client error', error);
    // Don't auto-reconnect here, let the connection manager handle it
});

client.on('disconnect', () => {
    logBot('WARN', 'Bot disconnected from Discord');
    // Don't auto-reconnect here, let the connection manager handle it
});

// Add these constants at the top of your file
const CATEGORIES = {
    FOOD: 'Food',
    HEALTH: 'Health/medical',
    HOME: 'Home expenses',
    TRANSPORT: 'Cabs/Petrol',
    PERSONAL: 'Personal',
    UTILITIES: 'Utilities',
    NSCI: 'NSCI',
    LEISURE: 'Party & Leisure',
    TRIP: 'Trip'
};

const PAYMENT_MODES = {
    CASH: 'Cash',
    UPI: 'UPI',
    CC: 'Credit Card'
};

const MONTHLY_BUDGETS = {
    FOOD: 5000,
    HEALTH: 3000,
    HOME: 500,
    TRANSPORT: 1500,
    PERSONAL: 4000,
    UTILITIES: 500,
    NSCI: 1500,
    LEISURE: 3000,
    TRIP: 0
};

const TOTAL_MONTHLY_BUDGET = Object.values(MONTHLY_BUDGETS).reduce((a, b) => a + b, 0);

// Add income tracking constants
const INCOME_TYPES = {
    SALARY: 'Salary',
    FREELANCE: 'Freelance',
    INVESTMENTS: 'Investments',
    OTHER: 'Other'
};

// Add at the top of your file
const LOG_LEVELS = {
    INFO: '📝',
    ERROR: '❌',
    SUCCESS: '✅',
    WARN: '⚠️'
};

// Enhanced logging function
function logBot(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const icon = {
        'INFO': 'ℹ️',
        'SUCCESS': '✅',
        'ERROR': '❌',
        'WARNING': '⚠️'
    }[type] || '📝';

    console.log(`${timestamp} ${icon} ${message}`);
    if (data) {
        console.log('Additional data:', JSON.stringify(data, null, 2));
    }
}

// Initialize Google Sheets connection
async function setupGoogleSheet() {
    try {
        doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        });
        await doc.loadInfo();
        console.log('Google Sheets setup successful');
        return true;
    } catch (error) {
        console.error('Google Sheet setup error:', error);
        return false;
    }
}

// Function to use Gemini to categorize transaction
async function categorizeTransaction(description) {
    try {
        const prompt = `
        Given these categories: ${Object.values(CATEGORIES).join(', ')}
        And this transaction description: "${description}"
        Which category best fits? Only respond with the exact category name from the list.`;

        const result = await model.generateContent(prompt);
        const category = result.response.text().trim();
        
        return Object.values(CATEGORIES).find(c => c.toLowerCase() === category.toLowerCase());
    } catch (error) {
        console.error('Error categorizing transaction:', error);
        return null;
    }
}

// Function to identify payment mode from description
async function identifyPaymentMode(description) {
    try {
        const prompt = `
        Given these payment modes: ${Object.values(PAYMENT_MODES).join(', ')}
        And this description: "${description}"
        Which payment mode best fits? Consider that:
        - CC, credit card, card all mean Credit Card
        - GPay, PhonePe, paytm mean UPI
        Only respond with: Cash, UPI, or Credit Card`;

        const result = await model.generateContent(prompt);
        const mode = result.response.text().trim();
        
        return Object.values(PAYMENT_MODES).find(m => m.toLowerCase() === mode.toLowerCase());
    } catch (error) {
        console.error('Error identifying payment mode:', error);
        return null;
    }
}

// Function to get spending data
async function getSpendingData(query) {
    try {
        // First, use Gemini to understand the query
        const analysisPrompt = `
        Analyze this spending query: "${query}"
        Extract these parameters:
        1. Time period (in days, or 'month' for current month)
        2. Category (${Object.values(CATEGORIES).join(', ')}) or 'all' for total spending
        3. Payment mode (${Object.values(PAYMENT_MODES).join(', ')}) or 'all' for all modes
        
        Format response exactly as: period|category|payment
        Example: "3|all|all" for last 3 days all spending
        Example: "month|Cabs/Petrol|all" for this month's cab expenses
        `;

        const analysis = await model.generateContent(analysisPrompt);
        const [period, category, payment] = analysis.response.text().trim().split('|');

        // Get transactions from sheet
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        // Calculate date range
        const now = new Date();
        let startDate;
        if (period.toLowerCase() === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else {
            const days = parseInt(period) || 30; // default to 30 days if parsing fails
            startDate = new Date(now - (days * 24 * 60 * 60 * 1000));
        }

        // Filter and calculate total
        let total = 0;
        const transactions = rows.filter(row => {
            const rowDate = parseDate(row.Date);
            const matchesDate = rowDate >= startDate;
            const matchesCategory = category === 'all' || row.Category.toLowerCase() === category.toLowerCase();
            const matchesPayment = payment === 'all' || row.PaymentMode.toLowerCase() === payment.toLowerCase();
            
            if (matchesDate && matchesCategory && matchesPayment) {
                total += parseFloat(row.Amount) || 0;
                return true;
            }
            return false;
        });

        // Get budget info if querying specific category
        let budgetInfo = null;
        if (category !== 'all') {
            const categoryKey = Object.keys(CATEGORIES).find(
                key => CATEGORIES[key].toLowerCase() === category.toLowerCase()
            );
            if (categoryKey) {
                const budget = MONTHLY_BUDGETS[categoryKey];
                const percentage = (total / budget) * 100;
                budgetInfo = {
                    budget,
                    percentage,
                    remaining: budget - total
                };
            }
        }

        // Use Gemini to generate a natural response
        const responsePrompt = `
        Create a natural, friendly response for this spending data:
        - Total spent: ₹${total}
        - Time period: ${period === 'month' ? 'this month' : `last ${period} days`}
        - Category: ${category}
        - Payment mode: ${payment}
        ${budgetInfo ? `
        - Monthly budget: ₹${budgetInfo.budget}
        - Budget used: ${budgetInfo.percentage.toFixed(1)}%
        - Remaining: ₹${budgetInfo.remaining}` : ''}

        Make it conversational and include:
        1. The spending amount
        2. Budget context if available
        3. A brief analysis or tip
        Keep it concise but informative.
        `;

        const response = await model.generateContent(responsePrompt);
        return response.response.text();

    } catch (error) {
        console.error('Error getting spending data:', error);
        throw error;
    }
}

// Core function to analyze spending with Gemini
async function analyzeSpendingQuery(query, transactions) {
    try {
        logBot('INFO', 'Starting spending analysis', { query });

        const transactionData = transactions.map(row => ({
            date: row.Date,
            amount: row.Amount,
            category: row.Category,
            paymentMode: row.PaymentMode,
            description: row.PaidTo
        }));
        logBot('INFO', `Mapped ${transactionData.length} transactions`);

        const analysisPrompt = `
        Given this spending query: "${query}"
        And these transactions:
        ${JSON.stringify(transactionData, null, 2)}
        You are a financial expert and you are helping me to analyze my spending from this data.
        Analyze the data and provide:
        1. Direct answer to the query accurately
        2. Budget context if applicable
        3. Brief financial insight or tip

        Note: All amounts are in INR (₹)
        Available categories: ${Object.values(CATEGORIES).join(', ')}
        Monthly budgets: ${JSON.stringify(MONTHLY_BUDGETS, null, 2)}
        `;

        logBot('INFO', 'Sending prompt to Gemini');
        const analysis = await model.generateContent(analysisPrompt);
        logBot('SUCCESS', 'Received response from Gemini');

        return analysis.response.text();

    } catch (error) {
        logBot('ERROR', 'Error in spending analysis', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Define standard column names
const SHEET_COLUMNS = {
    DATE: 'Date',
    TRANSACTION_TYPE: 'Type',  // 'EXPENSE' or 'INCOME'
    AMOUNT: 'Amount',
    DESCRIPTION: 'Description',
    CATEGORY: 'Category',
    PAYMENT_MODE: 'PaymentMode'
};


// Function to create new monthly sheet with standardized columns
async function createMonthlySheet() {
    try {
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();
        const sheetName = `${monthName} ${year} Transactions`;

        logBot('INFO', `Attempting to create sheet: ${sheetName}`);

        if (!doc.sheetsByTitle[sheetName]) {
            const sheet = await doc.addSheet({
                title: sheetName,
                headerValues: Object.values(SHEET_COLUMNS)
            });
            logBot('SUCCESS', `Created new sheet: ${sheetName}`);
            return sheet;
        }
        return doc.sheetsByTitle[sheetName];
    } catch (error) {
        logBot('ERROR', 'Error creating monthly sheet', error);
        throw error;
    }
}

// Add budget monitoring function
async function checkBudgetLimits(category, guild) {
    try {
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        // Calculate total spent in this category
        const totalSpent = rows
            .filter(row => row.Category === category && row.Type === 'EXPENSE')
            .reduce((sum, row) => sum + Math.abs(parseFloat(row.Amount) || 0), 0);
        
        // Get budget for this category
        const categoryKey = Object.keys(CATEGORIES).find(key => CATEGORIES[key] === category);
        const budget = MONTHLY_BUDGETS[categoryKey] || 0;
        
        if (budget === 0) return; // Skip if no budget set
        
        const spentPercentage = (totalSpent / budget) * 100;
        
        // Log for debugging
        logBot('INFO', 'Budget check', {
            category,
            totalSpent,
            budget,
            spentPercentage
        });
        
        // Prepare alert message if over threshold
        if (spentPercentage >= 80) {
            const alertEmbed = new Discord.MessageEmbed()
                .setColor(spentPercentage >= 100 ? '#ff0000' : '#ffa500')
                .setTitle(`⚠️ Budget Alert: ${category}`)
                .setDescription(
                    `You have spent ${spentPercentage.toFixed(1)}% of your ${category} budget!\n\n` +
                    `Budget: ₹${budget}\n` +
                    `Spent: ₹${totalSpent.toFixed(2)}\n` +
                    `Remaining: ₹${(budget - totalSpent).toFixed(2)}`
                )
                .setTimestamp();

            // Find appropriate channel to send alert
            const channel = guild.channels.cache
                .find(channel => 
                    channel.type === 'GUILD_TEXT' && 
                    channel.permissionsFor(client.user).has('SEND_MESSAGES')
                );
            
            if (channel) {
                await channel.send({ embeds: [alertEmbed] });
                logBot('INFO', `Sent budget alert for ${category}`, {
                    spentPercentage,
                    totalSpent,
                    budget
                });
            }
        }
    } catch (error) {
        logBot('ERROR', 'Error checking budget limits', error);
    }
}

// Update the expense logging to include budget check
async function logExpense(amount, description, paymentMode, category, message) {
    try {
        const sheet = await getCurrentMonthSheet();
        const date = new Date().toLocaleDateString('en-IN');
        
        // Add the expense
        await sheet.addRow({
            Date: date,
            Amount: amount,
            Description: description,
            PaymentMode: paymentMode,
            Category: category
        });
        
        // Check budget limits after logging expense
        await checkBudgetLimits(category, message.guild);
        
        return true;
    } catch (error) {
        logBot('ERROR', 'Error logging expense', error);
        return false;
    }
}

// Function to log income
async function logIncome(amount, category, description) {
    try {
        const sheet = await getCurrentMonthSheet();
        await sheet.addRow({
            [SHEET_COLUMNS.DATE]: new Date().toLocaleDateString('en-GB'),
            [SHEET_COLUMNS.TRANSACTION_TYPE]: 'INCOME',
            [SHEET_COLUMNS.AMOUNT]: Math.abs(amount),  // Ensure positive for income
            [SHEET_COLUMNS.DESCRIPTION]: description,
            [SHEET_COLUMNS.CATEGORY]: category,
            [SHEET_COLUMNS.PAYMENT_MODE]: 'N/A'  // Default for income
        });
        logBot('SUCCESS', 'Income logged successfully');
    } catch (error) {
        logBot('ERROR', 'Error logging income', error);
        throw error;
    }
}

// Function to generate summary report
async function generateSummaryReport() {
    try {
        logBot('INFO', 'Generating summary report');
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();

        // Debug log to check data
        console.log('Retrieved rows:', rows.length);

        // Initialize totals
        let totalIncome = 0;
        let totalExpenses = 0;
        let categoryTotals = {};

        // Process each row
        for (const row of rows) {
            const amount = parseFloat(row.Amount) || 0;
            console.log('Processing row:', {
                type: row.Type,
                amount: amount,
                category: row.Category
            });

            if (row.Type === 'INCOME') {
                totalIncome += Math.abs(amount);
            } else {
                totalExpenses += Math.abs(amount);
                // Accumulate category totals
                if (row.Category) {
                    categoryTotals[row.Category] = (categoryTotals[row.Category] || 0) + Math.abs(amount);
                }
            }
        }

        // Create embed
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('📊 Monthly Summary Report')
            .setDescription(`${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`)
            .addFields(
                { name: '💰 Total Income', value: `₹${totalIncome.toLocaleString()}`, inline: true },
                { name: '💸 Total Expenses', value: `₹${totalExpenses.toLocaleString()}`, inline: true },
                { name: '💫 Net Savings', value: `₹${(totalIncome - totalExpenses).toLocaleString()}`, inline: true }
            );

        // Add category breakdowns with error checking
        for (const [key, category] of Object.entries(CATEGORIES)) {
            const spent = categoryTotals[category] || 0;
            const budget = MONTHLY_BUDGETS[key] || 0;
            const percentage = budget > 0 ? (spent / budget) * 100 : 0;
            
            console.log('Category breakdown:', {
                category: category,
                spent: spent,
                budget: budget,
                percentage: percentage
            });

            const progressBar = createProgressBar(percentage);
            embed.addField(
                category,
                `${progressBar} ${percentage.toFixed(1)}%\n₹${spent.toLocaleString()} / ₹${budget.toLocaleString()}`
            );
        }

        logBot('SUCCESS', 'Generated summary report');
        return embed;

    } catch (error) {
        logBot('ERROR', 'Error generating summary report', error);
        console.error('Detailed error:', error);
        throw error;
    }
}

// Function to generate monthly report
async function generateMonthlyReport() {
    try {
        logBot('INFO', 'Starting monthly report generation');
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();

        // Process transactions
        const transactions = rows.map(row => ({
            date: row.Date,
            type: row.Type,
            amount: parseFloat(row.Amount),
            category: row.Category,
            paymentMode: row.PaymentMode,
            description: row.Description
        }));

        logBot('INFO', `Processing ${transactions.length} transactions for report`);

        const reportPrompt = `
        Generate a detailed monthly financial report for these transactions:
        ${JSON.stringify(transactions)}

        Monthly budgets are: ${JSON.stringify(MONTHLY_BUDGETS)}

        Include:
        1. Overview (total income, expenses, savings)
        2. Category Analysis (spending vs budget)
        3. Payment Method Distribution
        4. Key Insights
        5. Recommendations

        Format as a clear report with sections and bullet points.
        Use INR (₹) for amounts.
        Keep it concise but informative.
        `;

        logBot('INFO', 'Sending to Gemini for analysis');
        const analysis = await model.generateContent(reportPrompt);
        logBot('SUCCESS', 'Generated monthly report');
        
        return analysis.response.text();

    } catch (error) {
        logBot('ERROR', 'Error generating monthly report', error);
        throw error;
    }
}

// Add this helper function to get exact data from sheets
async function getSheetAnalysis(query) {
    try {
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        // Create a structured data object
        const data = {
            totalsByCategory: {},
            expensesByDate: {},
            paymentModeStats: {},
            rawTransactions: []
        };

        // Process each row
        for (const row of rows) {
            const amount = parseFloat(row.Amount) || 0;
            const category = row.Category;
            const date = row.Date;
            const paymentMode = row.PaymentMode;

            // Store raw transaction
            data.rawTransactions.push({
                date,
                amount,
                category,
                paymentMode,
                description: row.Description
            });

            // Update category totals
            if (!data.totalsByCategory[category]) {
                data.totalsByCategory[category] = 0;
            }
            data.totalsByCategory[category] += amount;

            // Update date totals
            if (!data.expensesByDate[date]) {
                data.expensesByDate[date] = 0;
            }
            data.expensesByDate[date] += amount;

            // Update payment mode stats
            if (paymentMode) {
                if (!data.paymentModeStats[paymentMode]) {
                    data.paymentModeStats[paymentMode] = 0;
                }
                data.paymentModeStats[paymentMode] += amount;
            }
        }

        // Create a detailed prompt for Gemini
        const prompt = `
        Analyze this financial data and answer the query: "${query}"
        
        Current Data:
        1. Category Totals: ${JSON.stringify(data.totalsByCategory)}
        2. Daily Totals: ${JSON.stringify(data.expensesByDate)}
        3. Payment Methods: ${JSON.stringify(data.paymentModeStats)}
        4. All Transactions: ${JSON.stringify(data.rawTransactions)}
        5. Monthly Budgets: ${JSON.stringify(MONTHLY_BUDGETS)}

        Rules for response:
        1. Only use the exact numbers from the provided data
        2. For category queries, match the exact category name
        3. For date-based queries, ensure dates match exactly
        4. Include the exact amount in your response
        5. If data is not available, say so explicitly
        6. Format all amounts with ₹ symbol
        7. Round all numbers to 2 decimal places
        8. If calculating percentage of budget, use the monthly budgets provided

        Respond in this format:
        1. Direct answer to the query: [exact number/analysis]
        2. Budget context: [if relevant]
        3. Brief insight: [one line insight based on data]
        `;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error('Error analyzing sheet data:', error);
        return 'Sorry, I encountered an error while analyzing the data. Please try again.';
    }
}

// Update the message handling to use the new analysis function
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    try {
        // Log command for debugging
        logBot('INFO', 'Received message', { content: message.content });

        if (message.content.startsWith('!log')) {
            const expenseDetails = message.content.slice(4).trim();
            logBot('INFO', 'Processing expense', { expenseDetails });
            
            
            if (!expenseDetails) {
                await message.reply('Please provide expense details.');
                return;
            }

            // Parse with Gemini
            const parsePrompt = `
            Parse this expense: "${expenseDetails}"
            Extract:
            1. Amount (number only)
            2. Description (clear text)
            3. Payment Mode (must be one of: Cash, UPI, Credit Card)
            4. Category (must be one of: Food, Health/medical, Home expenses, Cabs/Petrol, Personal, Utilities, NSCI, Party & Leisure, Trip)

            Format response exactly as: amount|description|payment|category`;

            try {
                const result = await model.generateContent(parsePrompt);
                const response = result.response.text().trim();
                logBot('INFO', 'Gemini response', { response });

                const [amount, description, paymentMode, category] = response.split('|');
                logBot('INFO', 'Parsed result', { amount, description, paymentMode, category });

                if (!amount || !description || !paymentMode || !category) {
                    throw new Error('Invalid response format from Gemini');
                }

                // Create embed
                const embed = {
                    color: 0x0099ff,
                    title: '📝 New Expense - Please Confirm',
                    fields: [
                        { name: 'Amount', value: `₹${amount}`, inline: false },
                        { name: 'Description', value: description, inline: false },
                        { name: 'Category', value: category, inline: false },
                        { name: 'Payment Mode', value: paymentMode, inline: false }
                    ],
                    footer: { text: '✅ to confirm, ❌ to cancel, 📝 to edit' }
                };

                // Send confirmation message
                const confirmationMsg = await message.channel.send({ embeds: [embed] });
                logBot('INFO', 'Sent confirmation message');

                // Add reactions
                await confirmationMsg.react('✅');
                await confirmationMsg.react('❌');
                await confirmationMsg.react('📝');

                // Set up reaction collector
                const filter = (reaction, user) => 
                    ['✅', '❌', '📝'].includes(reaction.emoji.name) && 
                    user.id === message.author.id;

                const collector = confirmationMsg.createReactionCollector({ 
                    filter, 
                    max: 1,
                    time: 60000 
                });

                collector.on('collect', async (reaction, user) => {
                    try {
                        if (reaction.emoji.name === '✅') {
                            const sheet = await getCurrentMonthSheet();
                            const date = new Date().toLocaleDateString('en-GB');
                            const parsedAmount = Math.abs(parseFloat(amount));

                            // Add the expense
                            await sheet.addRow({
                                Date: date,
                                Type: 'EXPENSE',
                                Amount: `-${parsedAmount}`,
                                Description: description,
                                Category: category,
                                PaymentMode: paymentMode
                            });

                            // Check budget limits immediately after logging
                            await checkBudgetLimits(category, message.guild);
                            
                            await message.channel.send('✅ Expense logged successfully!');
                        } else if (reaction.emoji.name === '❌') {
                            await message.channel.send('❌ Expense cancelled.');
                        } else if (reaction.emoji.name === '📝') {
                            await message.channel.send('Please enter the expense details again.');
                        }
                    } catch (error) {
                        logBot('ERROR', 'Reaction handling error', error);
                        await message.channel.send('Error processing your reaction. Please try again.');
                    }
                });

            } catch (error) {
                logBot('ERROR', 'Expense processing error', error);
                await message.reply('Error processing expense. Please try again.');
            }
        } else if (message.content.startsWith('!income')) {
            const incomeDetails = message.content.slice(7).trim();
            logBot('INFO', 'Processing income', { incomeDetails });
            
            if (!incomeDetails) {
                await message.reply('Please provide income details.');
                return;
            }

            // Parse with Gemini
            const parsePrompt = `
            Parse this income: "${incomeDetails}"
            Extract:
            1. Amount (number only)
            2. Description (clear text)
            3. Category (must be one of: Salary, Freelance, Investments, Other)

            Format response exactly as: amount|description|category`;

            try {
                const result = await model.generateContent(parsePrompt);
                const response = result.response.text().trim();
                logBot('INFO', 'Gemini response', { response });

                const [amount, description, category] = response.split('|');
                logBot('INFO', 'Parsed result', { amount, description, category });

                if (!amount || !description || !category) {
                    throw new Error('Invalid response format from Gemini');
                }

                // Log income to Google Sheet
                const sheet = await getCurrentMonthSheet();
                await sheet.addRow({
                    [SHEET_COLUMNS.DATE]: new Date().toLocaleDateString('en-GB'),
                    [SHEET_COLUMNS.TRANSACTION_TYPE]: 'INCOME',
                    [SHEET_COLUMNS.AMOUNT]: Math.abs(parseFloat(amount)),
                    [SHEET_COLUMNS.DESCRIPTION]: description,
                    [SHEET_COLUMNS.CATEGORY]: category,
                    [SHEET_COLUMNS.PAYMENT_MODE]: 'N/A'
                });

                await message.channel.send('✅ Income logged successfully!');
            } catch (error) {
                logBot('ERROR', 'Income processing error', error);
                await message.reply('Error processing income. Please try again.');
            }
        } else if (message.content.toLowerCase().includes('how much') || 
                  message.content.toLowerCase().includes('spent') ||
                  message.content.toLowerCase().includes('show') ||
                  message.content.toLowerCase().includes('tell me')) {
            // Natural language query handling
            const response = await getSheetAnalysis(message.content);
            await message.reply(response);
        } else if (message.content === '!summary') {
            logBot('INFO', 'Generating summary report');
            const summaryEmbed = await generateSummaryReport();
            await message.channel.send({ embeds: [summaryEmbed] });
        } else if (message.content === '!report') {
            logBot('INFO', 'Generating monthly report');
            const report = await generateMonthlyReport();
            await message.channel.send(report);
        } else if (message.content.toLowerCase().includes('spent') || 
                 message.content.toLowerCase().includes('spending') || 
                 message.content.toLowerCase().includes('how much') ||
                 message.content.toLowerCase().includes('what') ||
                 message.content.toLowerCase().includes('total') ||
                 message.content.toLowerCase().includes('expenses') ||
                 message.content.toLowerCase().includes('cost') ||
                 message.content.toLowerCase().includes('amount') ||
                 message.content.toLowerCase().includes('expenditure') ||
                 message.content.toLowerCase().includes('summary') ||
                 message.content.toLowerCase().includes('overview')) {
            logBot('INFO', 'Processing spending query');
            const sheet = await getCurrentMonthSheet();
            const rows = await sheet.getRows();
            const analysis = await analyzeSpendingQuery(message.content, rows);
            await message.channel.send(analysis);
        } else if (message.content === '!budget') {
            logBot('INFO', 'Analyzing budget');
            const analysis = await analyzeBudget();
            await message.channel.send(analysis);
        }
    } catch (error) {
        logBot('ERROR', 'Error processing message', error);
        await message.reply('Sorry, I encountered an error. Please try again.');
    }
});

// Debug handler
client.on('debug', info => {
    logBot('INFO', 'Discord debug', info);
});

// Debug logging for reactions
client.on('messageReactionAdd', (reaction, user) => {
    if (user.bot) return;
    logBot('INFO', 'Reaction added', { 
        emoji: reaction.emoji.name, 
        user: user.tag,
        messageId: reaction.message.id
    });
});

// Helper function to parse date from DD/MM/YYYY format
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

// Add this function to check budget status
async function checkBudgetStatus(channel, category) {
    try {
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        // Get current month's transactions
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Calculate total spent in category this month
        const monthlySpent = rows.reduce((total, row) => {
            const rowDate = parseDate(row.Date);
            if (rowDate.getMonth() === currentMonth && 
                rowDate.getFullYear() === currentYear && 
                row.Category.toLowerCase() === category.toLowerCase()) {
                return total + (parseFloat(row.Amount) || 0);
            }
            return total;
        }, 0);

        // Get budget for category
        const categoryKey = Object.keys(CATEGORIES).find(
            key => CATEGORIES[key].toLowerCase() === category.toLowerCase()
        );
        const budget = MONTHLY_BUDGETS[categoryKey];
        
        // Calculate percentage
        const percentage = (monthlySpent / budget) * 100;
        
        // Send warning if over 80%
        if (percentage >= 80) {
            await channel.send({
                embeds: [{
                    color: percentage >= 100 ? '#FF0000' : '#FFA500',
                    title: '⚠️ Budget Alert',
                    description: `You've spent ${percentage.toFixed(1)}% of your ${category} budget\n` +
                               `₹${monthlySpent.toFixed(2)} / ₹${budget.toFixed(2)}`
                }]
            });
        }
    } catch (error) {
        console.error('Error checking budget status:', error);
    }
}

// Update the transaction parsing in handleTransaction function
async function handleTransaction(message, content) {
    try {
        // Initialize sheets first if not already done
        if (!doc) {
            await initializeSheets();
        }
        
        // Parse the transaction with Gemini
        const parsePrompt = `
        Parse this transaction: "${content}"
        Extract:
        1. Amount (number in INR)
        2. Description
        3. Payment Mode (${Object.values(PAYMENT_MODES).join(', ')})
        4. Category (${Object.values(CATEGORIES).join(', ')})
        
        Format response exactly as: amount|description|payment|category`;

        const result = await model.generateContent(parsePrompt);
        const [amount, description, payment, category] = result.response.text().trim().split('|');

        // Create confirmation embed
        const confirmationEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('📝 New Expense - Please Confirm')
            .addFields(
                { name: 'Amount', value: `₹${amount}` },
                { name: 'Description', value: description },
                { name: 'Category', value: category },
                { name: 'Payment Mode', value: payment }
            )
            .setFooter({ text: '✅ to confirm, ❌ to cancel, 📝 to edit' });

        const confirmationMsg = await message.channel.send({ embeds: [confirmationEmbed] });
        await confirmationMsg.react('✅');
        await confirmationMsg.react('❌');
        await confirmationMsg.react('📝');

        // Add reaction collector
        const filter = (reaction, user) => {
            return ['✅', '❌', '📝'].includes(reaction.emoji.name) && 
                   user.id === message.author.id;
        };

        const collector = confirmationMsg.createReactionCollector({ 
            filter, 
            time: 60000,  // 60 seconds timeout
            max: 1        // Only collect one reaction
        });

        collector.on('collect', async (reaction, user) => {
            switch(reaction.emoji.name) {
                case '✅':
                    // Your confirmation code
                    break;
                case '❌':
                    await message.channel.send('Transaction cancelled');
                    break;
                case '📝':
                    await message.channel.send('Please enter the corrected details');
                    // Add edit logic
                    break;
            }
        });
    } catch (error) {
        console.error('Transaction error:', error);
        await message.channel.send(`Error: ${error.message}`);
    }
}

async function sendDailyReport(channel) {
    try {
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        // Get current month's transactions
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const monthlyTransactions = rows.filter(row => {
            const rowDate = parseDate(row.Date);
            return rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
        });

        // Calculate spending by category
        const spendingByCategory = {};
        Object.keys(CATEGORIES).forEach(cat => {
            spendingByCategory[cat] = 0;
        });

        monthlyTransactions.forEach(row => {
            const category = Object.keys(CATEGORIES).find(
                cat => CATEGORIES[cat].toLowerCase() === row.Category.toLowerCase()
            );
            if (category) {
                spendingByCategory[category] += parseFloat(row.Amount) || 0;
            }
        });

        // Create embed with progress bars
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('📊 Monthly Budget Report')
            .setDescription(`Report for ${now.toLocaleString('default', { month: 'long' })} ${currentYear}`);

        Object.keys(CATEGORIES).forEach(category => {
            const spent = spendingByCategory[category];
            const budget = MONTHLY_BUDGETS[category];
            const percentage = (spent / budget) * 100;
            const progressBar = createProgressBar(percentage);
            
            embed.addField(
                CATEGORIES[category],
                `${progressBar} ${percentage.toFixed(1)}%\n₹${spent.toFixed(2)} / ₹${budget.toFixed(2)}`
            );
        });

        const totalSpent = Object.values(spendingByCategory).reduce((a, b) => a + b, 0);
        const totalPercentage = (totalSpent / TOTAL_MONTHLY_BUDGET) * 100;
        
        embed.addField(
            'Total Budget',
            `${createProgressBar(totalPercentage)} ${totalPercentage.toFixed(1)}%\n₹${totalSpent.toFixed(2)} / ₹${TOTAL_MONTHLY_BUDGET.toFixed(2)}`
        );

        await channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Error sending daily report:', error);
        await channel.send('Error generating daily report.');
    }
}

function createProgressBar(percentage) {
    const filledBlocks = Math.min(Math.floor(percentage / 10), 10);
    const emptyBlocks = 10 - filledBlocks;
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

// Function to generate month-end report
async function generateMonthEndReport() {
    try {
        const currentSheet = await getCurrentMonthSheet();
        const transactions = await currentSheet.getRows();

        // Separate income and expenses
        const income = transactions.filter(row => row.Type === 'INCOME')
            .map(row => ({
                date: row.Date,
                amount: parseFloat(row.Amount),
                category: row.Category,
                description: row.Description
            }));

        const expenses = transactions.filter(row => row.Type !== 'INCOME')
            .map(row => ({
                date: row.Date,
                amount: parseFloat(row.Amount),
                category: row.Category,
                paymentMode: row.PaymentMode,
                description: row.Description
            }));

        const reportPrompt = `
        Generate a detailed monthly financial report using:
        Income transactions: ${JSON.stringify(income)}
        Expense transactions: ${JSON.stringify(expenses)}
        Monthly budgets: ${JSON.stringify(MONTHLY_BUDGETS)}

        Provide:
        1. Total income vs expenses
        2. Category-wise spending analysis
        3. Budget adherence for each category
        4. Areas of overspending (categories)
        5. Saving rate achieved
        6. Recommendations for next month's budget
        7. Specific areas for potential savings
        8. Notable spending patterns or concerns

        Format as a clear, detailed report with sections.
        `;

        const analysis = await model.generateContent(reportPrompt);
        return analysis.response.text();
    } catch (error) {
        console.error('Error generating month-end report:', error);
        throw error;
    }
}

// Schedule month-end report
schedule.scheduleJob('0 20 L * *', async () => {
    try {
        logBot('INFO', 'Generating scheduled month-end report');
        const report = await generateMonthEndReport();
        
        // Send to all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            try {
                // Find the first text channel we can send to
                const channel = guild.channels.cache
                    .find(channel => 
                        channel.type === 'GUILD_TEXT' && 
                        channel.permissionsFor(client.user).has('SEND_MESSAGES')
                    );
                
                if (channel) {
                    await channel.send({
                        embeds: [{
                            color: '#0099ff',
                            title: '📊 Month-End Financial Report',
                            description: report,
                            footer: {
                                text: `Generated on ${new Date().toLocaleDateString()}`
                            }
                        }]
                    });
                    logBot('SUCCESS', `Sent month-end report to ${guild.name}`);
                }
            } catch (error) {
                logBot('ERROR', `Failed to send report to guild ${guild.name}`, error);
            }
        }
    } catch (error) {
        logBot('ERROR', 'Failed to generate month-end report', error);
    }
});

client.login(process.env.DISCORD_TOKEN); // Login to Discord with your bot's token

async function analyzeBudget() {
    try {
        const sheet = await getCurrentMonthSheet();
        const rows = await sheet.getRows();
        
        const transactions = rows.map(row => ({
            date: row.Date,
            type: row.Type,
            amount: parseFloat(row.Amount),
            category: row.Category
        }));

        const prompt = `
        Analyze budget status for these transactions:
        ${JSON.stringify(transactions)}

        Budget limits: ${JSON.stringify(MONTHLY_BUDGETS)}

        Provide:
        1. Categories approaching/exceeding budget
        2. Spending trends
        3. Recommendations for staying within budget
        4. Areas of concern

        Focus on actionable insights.
        Use INR (₹) for amounts.
        `;

        const analysis = await model.generateContent(prompt);
        return analysis.response.text();
    } catch (error) {
        console.error('Budget analysis error:', error);
        throw error;
    }
}

// Function to create expense embed with proper description
function createExpenseEmbed(amount, description, category) {
    return new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setTitle('💸 New Expense')
        .setDescription(`Expense Details:`)  // Added required description
        .addFields(
            { name: 'Amount', value: `₹${amount}`, inline: true },
            { name: 'Description', value: description || 'No description', inline: true },
            { name: 'Category', value: category || 'Uncategorized', inline: true }
        )
        .setTimestamp();
}

// Schedule job for daily summary at 8 AM
const dailySummaryJob = schedule.scheduleJob('0 17 * * *', async () => {
    console.log('Sending daily summary...');
    try {
        const summaryEmbed = await generateSummaryReport(); // Call your existing summary function
        const channel = await client.channels.fetch(process.env.REPORT_CHANNEL_ID); // Fetch the channel
        await channel.send({ embeds: [summaryEmbed] }); // Send the summary
    } catch (error) {
        console.error('Error sending daily summary:', error);
    }
});
