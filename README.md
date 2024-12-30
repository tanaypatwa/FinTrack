# FinTrack - AI-Powered Finance Tracking Discord Bot

## Core Features & Usage

### 1. Expense Tracking
Log expenses in natural language. Bot understands context and categorizes automatically.

**Command:** `!log [amount] [description] [payment method]`

**Examples:**
```
!log 500 lunch at cafe using upi
!log 1200 uber to airport CC
!log 2000 medicines cash
```

**Response:**
```
📝 New Expense - Please Confirm
Amount: ₹500
Description: lunch at cafe
Category: Food
Payment Mode: UPI

React with:
✅ to confirm
❌ to cancel
📝 to edit
```

### 2. Income Tracking
Log different types of income with descriptions.

**Command:** `!income [amount] [type] [description]`

**Examples:**
```
!income 50000 salary monthly payment
!income 5000 freelance website project
!income 2000 investments dividend
```

**Response:**
```
💰 New Income - Please Confirm
Amount: ₹50,000
Category: Salary
Description: monthly payment

React with:
✅ to confirm
❌ to cancel
📝 to edit
```

### 3. Smart Queries
Ask about your spending in natural language.

**Examples:**
```
"How much have I spent today?"
"What's my food expenses this month?"
"Show my credit card spending"
"How much did I spend on cabs?"
"What's my biggest expense category?"
```

### 4. Budget Categories & Limits
Monthly budgets for each category:
```
Food            ₹4,000
Health/medical  ₹3,000
Home expenses   ₹500
Cabs/Petrol     ₹1,500
Personal        ₹4,000
Utilities       ₹500
NSCI            ₹1,500
Party & Leisure ₹2,000
Trip            ₹10,000
```

### 5. Payment Modes
Supported payment methods:
- Cash
- UPI (includes GPay, PhonePe, Paytm)
- Credit Card (CC)

### 6. Monthly Sheet Management
- Automatic creation of new sheets each month
- Format: "January 2024 Transactions", "February 2024 Transactions"
- Consistent data structure:

```
| Date       | Type    | Amount  | Description | Category | PaymentMode |
|-----------|---------|---------|-------------|----------|-------------|
| 20/1/2024 | EXPENSE | -500    | Lunch       | Food     | UPI         |
| 20/1/2024 | INCOME  | 50000   | Salary      | Salary   | N/A         |
```

### 7. Month-End Reports
Automated report generation on month's last day.

**Command:** `!report` (also sends automatically)

**Includes:**
- Total income vs expenses
- Category-wise analysis
- Budget adherence
- Savings rate
- Recommendations

### 3. Report Commands

#### A. Quick Summary (`!summary`)
Get an instant overview of current month's finances with visual progress bars.

**Command:** `!summary`

**Response Example:**
```
📊 Monthly Summary Report
January 2024

💰 Total Income:    ₹55,000
💸 Total Expenses:  ₹25,000
💫 Net Savings:     ₹30,000

Category Breakdown:
Food (₹4,000 budget)
[████████░░] 80% spent
₹3,200 / ₹4,000

Transport (₹1,500 budget)
[███░░░░░░░] 30% spent
₹450 / ₹1,500

Personal (₹4,000 budget)
[██████░░░░] 60% spent
₹2,400 / ₹4,000

... (other categories)
```

#### B. Detailed Monthly Report (`!report`)
Get comprehensive analysis and insights for the month.

**Command:** `!report`

**Response Example:**
```
📈 Monthly Financial Report - January 2024

1. OVERVIEW
Total Income: ₹55,000
Total Expenses: ₹25,000
Net Savings: ₹30,000 (54.5% saving rate)

2. CATEGORY ANALYSIS
Food & Dining
- Spent: ₹3,200 (80% of budget)
- Major expenses: Groceries (₹2,000), Restaurants (₹1,200)
- Trend: 15% higher than last month

Transport
- Spent: ₹450 (30% of budget)
- Breakdown: Uber (₹300), Fuel (₹150)
- Trend: 40% lower than last month

3. PAYMENT METHODS
- UPI: 60% of transactions
- Credit Card: 30%
- Cash: 10%

4. INSIGHTS
- Food spending trending higher
- Good savings on transport
- Credit card usage within normal range

5. RECOMMENDATIONS
- Consider meal planning to reduce food costs
- Good job on transport savings
- Keep maintaining expense logs

6. NEXT MONTH'S FOCUS
- Watch food expenses
- Maintain transport savings
- Review subscriptions
```

### Usage Tips
1. Use `!summary` for quick budget checks
2. Use `!report` for detailed analysis
3. Reports are also auto-generated on month-end
4. All amounts are in INR (₹)

### Report Features
- Visual progress bars
- Category-wise breakdown
- Budget adherence tracking
- Spending patterns
- AI-powered insights
- Saving rate analysis
- Month-over-month comparisons
- Custom recommendations

## Technical Setup

### Prerequisites
```bash
npm install discord.js@13 google-spreadsheet@3.3.0 @google/generative-ai dotenv
```

### Environment Variables
Create `.env` file:
```
DISCORD_TOKEN=your_discord_bot_token
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key
GEMINI_API_KEY=your_gemini_api_key
```

### Logging System
Comprehensive logging with emoji indicators:
```
📝 INFO: General information
❌ ERROR: Error messages
✅ SUCCESS: Successful operations
⚠️ WARN: Warnings
```

Example log:
```
2024-01-20T15:30:45.123Z 📝 Received message: !log 500 lunch
2024-01-20T15:30:45.124Z 📝 Processing transaction
2024-01-20T15:30:45.125Z ✅ Transaction logged successfully
```

## Data Structure

### Income Categories
- Salary
- Freelance
- Investments
- Other

### Expense Categories
- Food
- Health/medical
- Home expenses
- Cabs/Petrol
- Personal
- Utilities
- NSCI
- Party & Leisure
- Trip

## Features in Action

### 1. Daily Usage
```
User: !log 500 breakfast at starbucks CC
Bot: [Shows confirmation embed]
User: [Reacts with ✅]
Bot: ✅ Expense logged successfully!

User: how much spent on food today?
Bot: You've spent ₹500 on Food today. 
     This is 12.5% of your monthly food budget (₹4,000).
```

### 2. Monthly Overview
```
User: !report
Bot: 📊 Monthly Report - January 2024

Income: ₹55,000
Expenses: ₹25,000
Savings: ₹30,000 (54.5%)

Category Breakdown:
Food: ₹3,500/₹4,000 (87.5%)
Transport: ₹1,200/₹1,500 (80%)
[...]
```

## Security Features
- Transaction confirmation system
- Monthly data segregation
- Secure API key handling
- Comprehensive error logging

## Error Handling
- Invalid amount format
- Unknown categories
- API failures
- Sheet access issues

# Deployment Guide

## Local Setup
1. Clone repository
2. Copy `config/settings.js` to `config/settings.local.js`
3. Modify budgets and categories in settings.local.js
4. Create .env file with your tokens
5. Run `npm install && npm start`

## GCP Deployment
1. Install Google Cloud SDK
2. Initialize: `gcloud init`
3. Set environment variables:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
4. Deploy:
   ```bash
   gcloud app deploy
   ```

## Monitoring
- View logs: `gcloud app logs tail`
- Check status: `gcloud app describe`
- Stop service: `gcloud app services update default --min-instances=0`
- Start service: `gcloud app services update default --min-instances=1`
