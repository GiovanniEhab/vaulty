package com.vaulty.app

fun emptyState(currency: Currency = Currency.EGP, theme: AppTheme = AppTheme.LIGHT): VaultState = VaultState(
    currency = currency,
    theme = theme,
    activeMonth = currentMonth(),
    isDemoData = false,
    demoBannerDismissed = true,
    voiceReplies = true,
    notificationsEnabled = false,
    reminderHour = 20,
    widgetIds = listOf(WidgetId.NET_WORTH, WidgetId.MONTH, WidgetId.BUDGET, WidgetId.VOICE),
    assistantLanguage = AssistantLanguage.EN,
    autoUpdate = true,
    accounts = listOf(
        Account("acc_main", "Main Bank Account", AccountType.CHECKING, 0.0, "#059669"),
        Account("acc_wallet", "Cash Wallet", AccountType.CASH, 0.0, "#f59e0b"),
    ),
)

fun sampleState(currency: Currency = Currency.EGP, theme: AppTheme = AppTheme.LIGHT): VaultState {
    val thisMonth = currentMonth()
    val lastMonth = shiftMonth(thisMonth, -1)
    val twoAgo = shiftMonth(thisMonth, -2)

    val accounts = listOf(
        Account("acc_bank", "Main Bank Checking", AccountType.CHECKING, 24500.0, "#059669"),
        Account("acc_cash", "Everyday Cash Wallet", AccountType.CASH, 9500.0, "#f59e0b"),
        Account("acc_sav", "High-Yield Savings", AccountType.SAVINGS, 48000.0, "#6366f1"),
        Account("acc_cc", "Rewards Credit Card", AccountType.CREDIT, -4200.0, "#e11d48"),
    )

    fun tx(
        id: String,
        type: TxType,
        amount: Double,
        date: String,
        accountId: String,
        category: String,
        description: String,
        notes: String = "",
        toAccountId: String? = null,
    ) = Transaction(id, type, amount, date, accountId, toAccountId, category, description, notes)

    val transactions = listOf(
        tx("tx_101", TxType.INCOME, 34000.0, dateInMonth(thisMonth, 1), "acc_bank", "Salary", "Monthly Salary Deposit", "Primary employer"),
        tx("tx_102", TxType.EXPENSE, 9500.0, dateInMonth(thisMonth, 2), "acc_bank", "Housing", "Apartment Rent", "This month rent"),
        tx("tx_103", TxType.EXPENSE, 1450.0, dateInMonth(thisMonth, 4), "acc_bank", "Utilities", "Electricity, Gas & Fiber Internet"),
        tx("tx_104", TxType.EXPENSE, 2680.0, dateInMonth(thisMonth, 6), "acc_cc", "Groceries", "Supermarket Weekly Run", "Fresh produce & pantry"),
        tx("tx_105", TxType.INCOME, 6500.0, dateInMonth(thisMonth, 9), "acc_bank", "Freelance", "UI Consulting Milestone", "Client invoice #14"),
        tx("tx_106", TxType.EXPENSE, 920.0, dateInMonth(thisMonth, 11), "acc_cash", "Transport", "Fuel & Ride-hailing"),
        tx("tx_107", TxType.EXPENSE, 1180.0, dateInMonth(thisMonth, 14), "acc_cc", "Dining Out", "Dinner with Friends", "Bistro downtown"),
        tx("tx_108", TxType.TRANSFER, 6000.0, dateInMonth(thisMonth, 15), "acc_bank", "Transfer", "Monthly Savings Allocation", "Auto-transfer", "acc_sav"),
        tx("tx_109", TxType.EXPENSE, 2150.0, dateInMonth(thisMonth, 17), "acc_cc", "Groceries", "Organic Market & Coffee Beans"),
        tx("tx_110", TxType.EXPENSE, 1650.0, dateInMonth(thisMonth, 19), "acc_bank", "Shopping", "Winter Jacket & Essentials"),
        tx("tx_111", TxType.EXPENSE, 640.0, dateInMonth(thisMonth, 21), "acc_cash", "Entertainment", "Cinema & Streaming"),
        tx("tx_112", TxType.EXPENSE, 750.0, dateInMonth(thisMonth, 22), "acc_cc", "Healthcare", "Pharmacy & Dental Checkup"),

        tx("tx_201", TxType.INCOME, 34000.0, dateInMonth(lastMonth, 1), "acc_bank", "Salary", "Monthly Salary Deposit"),
        tx("tx_202", TxType.INCOME, 4200.0, dateInMonth(lastMonth, 16), "acc_bank", "Freelance", "Design Audit"),
        tx("tx_203", TxType.EXPENSE, 9500.0, dateInMonth(lastMonth, 2), "acc_bank", "Housing", "Apartment Rent"),
        tx("tx_204", TxType.EXPENSE, 5200.0, dateInMonth(lastMonth, 12), "acc_cc", "Groceries", "Monthly Groceries"),
        tx("tx_205", TxType.EXPENSE, 3100.0, dateInMonth(lastMonth, 18), "acc_cc", "Dining Out", "Cafes & Restaurants"),
        tx("tx_206", TxType.EXPENSE, 2400.0, dateInMonth(lastMonth, 22), "acc_bank", "Transport", "Fuel & Car Service"),
        tx("tx_207", TxType.EXPENSE, 1550.0, dateInMonth(lastMonth, 25), "acc_bank", "Utilities", "Monthly Bills"),

        tx("tx_301", TxType.INCOME, 32500.0, dateInMonth(twoAgo, 1), "acc_bank", "Salary", "Monthly Salary Deposit"),
        tx("tx_302", TxType.EXPENSE, 9500.0, dateInMonth(twoAgo, 2), "acc_bank", "Housing", "Apartment Rent"),
        tx("tx_303", TxType.EXPENSE, 4900.0, dateInMonth(twoAgo, 14), "acc_cc", "Groceries", "Monthly Groceries"),
        tx("tx_304", TxType.EXPENSE, 4600.0, dateInMonth(twoAgo, 20), "acc_bank", "Shopping", "Home Office Desk Chair"),
        tx("tx_305", TxType.EXPENSE, 2100.0, dateInMonth(twoAgo, 24), "acc_cash", "Dining Out", "Dining & Coffee"),
    )

    val budgets = listOf(
        Budget("bud_1", "Housing", 10000.0),
        Budget("bud_2", "Groceries", 6000.0),
        Budget("bud_3", "Dining Out", 2500.0),
        Budget("bud_4", "Transport", 2000.0),
        Budget("bud_5", "Utilities", 1800.0),
        Budget("bud_6", "Shopping", 2000.0),
        Budget("bud_7", "Entertainment", 1500.0),
    )

    val nextYear = thisMonth.take(4).toIntOrNull()?.plus(1) ?: 2027
    val goals = listOf(
        Goal("goal_1", "Emergency Fund (6 Months)", 150000.0, 86000.0, "$nextYear-06-30", "#10b981"),
        Goal("goal_2", "New MacBook Pro", 65000.0, 42500.0, "$nextYear-03-01", "#6366f1"),
        Goal("goal_3", "Spring Vacation Fund", 35000.0, 18000.0, "$nextYear-04-15", "#f59e0b"),
    )

    val recurring = listOf(
        Recurring("rec_1", "Monthly Salary", TxType.INCOME, 34000.0, 1, "acc_bank", "Salary", thisMonth),
        Recurring("rec_2", "Apartment Rent", TxType.EXPENSE, 9500.0, 2, "acc_bank", "Housing", thisMonth),
        Recurring("rec_3", "Fiber Internet & Mobile", TxType.EXPENSE, 850.0, 10, "acc_bank", "Utilities", ""),
        Recurring("rec_4", "Gym Membership", TxType.EXPENSE, 1100.0, 25, "acc_cc", "Healthcare", ""),
    )

    return VaultState(
        accounts = accounts,
        transactions = transactions,
        budgets = budgets,
        goals = goals,
        recurring = recurring,
        currency = currency,
        theme = theme,
        activeMonth = thisMonth,
        isDemoData = true,
        demoBannerDismissed = false,
        voiceReplies = true,
        notificationsEnabled = false,
        reminderHour = 20,
        widgetIds = WidgetId.entries.toList(),
        assistantLanguage = AssistantLanguage.EN,
        autoUpdate = true,
    )
}
