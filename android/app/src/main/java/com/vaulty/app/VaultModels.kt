package com.vaulty.app

import kotlin.random.Random

enum class TxType(val value: String) {
    INCOME("income"),
    EXPENSE("expense"),
    TRANSFER("transfer");

    companion object {
        fun from(value: String?): TxType = entries.firstOrNull { it.value == value } ?: EXPENSE
    }
}

enum class AccountType(val value: String, val label: String) {
    CHECKING("checking", "Bank / Checking"),
    CASH("cash", "Cash Wallet"),
    SAVINGS("savings", "Savings Account"),
    CREDIT("credit", "Credit Card");

    companion object {
        fun from(value: String?): AccountType = entries.firstOrNull { it.value == value } ?: CHECKING
    }
}

enum class Currency(val code: String, val symbol: String, val decimals: Int, val label: String) {
    EGP("EGP", "E£", 0, "Egyptian Pound"),
    USD("USD", "$", 2, "US Dollar"),
    EUR("EUR", "€", 2, "Euro"),
    GBP("GBP", "£", 2, "British Pound"),
    SAR("SAR", "SAR ", 2, "Saudi Riyal"),
    AED("AED", "AED ", 2, "UAE Dirham");

    companion object {
        fun from(value: String?): Currency = entries.firstOrNull { it.code == value } ?: EGP
    }
}

enum class AppTheme(val value: String) {
    LIGHT("light"),
    DARK("dark");

    companion object {
        fun from(value: String?): AppTheme = if (value == "dark") DARK else LIGHT
    }
}

enum class WidgetId(val value: String, val label: String, val description: String) {
    NET_WORTH("netWorth", "Net worth", "Total balance across every account"),
    MONTH("month", "This month", "Spent and earned this month"),
    BUDGET("budget", "Top budget", "The budget closest to its limit"),
    GOAL("goal", "Top goal", "Progress on your largest savings goal"),
    VOICE("voice", "Ask Vaulty", "One tap to speak a command");

    companion object {
        fun from(value: String?): WidgetId? = entries.firstOrNull { it.value == value }
    }
}

enum class AssistantLanguage(val value: String) {
    EN("en"),
    AR("ar");

    companion object {
        fun from(value: String?): AssistantLanguage = if (value == "ar") AR else EN
    }
}

data class Account(
    val id: String = "",
    val name: String = "",
    val type: AccountType = AccountType.CHECKING,
    val initialBalance: Double = 0.0,
    val color: String = "#059669",
)

data class Transaction(
    val id: String = "",
    val type: TxType = TxType.EXPENSE,
    val amount: Double = 0.0,
    val date: String = "",
    val accountId: String = "",
    val toAccountId: String? = null,
    val category: String = "",
    val description: String = "",
    val notes: String = "",
)

data class Budget(
    val id: String = "",
    val category: String = "",
    val limit: Double = 0.0,
)

data class Goal(
    val id: String = "",
    val name: String = "",
    val target: Double = 0.0,
    val current: Double = 0.0,
    val deadline: String = "",
    val color: String = "#10b981",
)

data class Recurring(
    val id: String = "",
    val title: String = "",
    val type: TxType = TxType.EXPENSE,
    val amount: Double = 0.0,
    val dayOfMonth: Int = 1,
    val accountId: String = "",
    val category: String = "",
    val lastLoggedMonth: String = "",
)

data class VaultState(
    val accounts: List<Account> = emptyList(),
    val transactions: List<Transaction> = emptyList(),
    val budgets: List<Budget> = emptyList(),
    val goals: List<Goal> = emptyList(),
    val recurring: List<Recurring> = emptyList(),
    val currency: Currency = Currency.EGP,
    val theme: AppTheme = AppTheme.LIGHT,
    val activeMonth: String = currentMonth(),
    val isDemoData: Boolean = false,
    val demoBannerDismissed: Boolean = true,
    val voiceReplies: Boolean = true,
    val notificationsEnabled: Boolean = false,
    val reminderHour: Int = 20,
    val widgetIds: List<WidgetId> = listOf(
        WidgetId.NET_WORTH,
        WidgetId.MONTH,
        WidgetId.BUDGET,
        WidgetId.VOICE,
    ),
    val assistantLanguage: AssistantLanguage = AssistantLanguage.EN,
    val autoUpdate: Boolean = true,
)

data class CategoryMeta(val id: String, val color: String, val icon: String = "")

object VaultConstants {
    val CURRENCIES: List<Currency> = Currency.entries

    val EXPENSE_CATEGORIES = listOf(
        CategoryMeta("Housing", "#6366f1", "home"),
        CategoryMeta("Groceries", "#10b981", "shopping-cart"),
        CategoryMeta("Dining Out", "#f59e0b", "utensils"),
        CategoryMeta("Transport", "#3b82f6", "car"),
        CategoryMeta("Utilities", "#06b6d4", "zap"),
        CategoryMeta("Healthcare", "#ef4444", "heart-pulse"),
        CategoryMeta("Shopping", "#ec4899", "shopping-bag"),
        CategoryMeta("Entertainment", "#8b5cf6", "film"),
        CategoryMeta("Education", "#14b8a6", "graduation-cap"),
        CategoryMeta("Other Expense", "#64748b", "tag"),
    )

    val INCOME_CATEGORIES = listOf(
        CategoryMeta("Salary", "#10b981", "briefcase"),
        CategoryMeta("Freelance", "#0ea5e9", "laptop"),
        CategoryMeta("Investments", "#8b5cf6", "trending-up"),
        CategoryMeta("Gift / Bonus", "#f59e0b", "gift"),
        CategoryMeta("Other Income", "#64748b", "plus-circle"),
    )

    val TRANSFER_META = CategoryMeta("Transfer", "#6366f1", "arrow-left-right")

    val allCategories: List<String> = (EXPENSE_CATEGORIES + INCOME_CATEGORIES).map { it.id }.distinct().sorted()

    val ACCOUNT_TYPES = AccountType.entries.toList()

    val ACCOUNT_COLORS = listOf("#059669", "#6366f1", "#f59e0b", "#e11d48", "#0ea5e9", "#8b5cf6")
    val GOAL_COLORS = listOf("#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9")

    fun categoryMeta(category: String, type: TxType = TxType.EXPENSE): CategoryMeta {
        if (type == TxType.TRANSFER || category == "Transfer") return TRANSFER_META
        val pool = if (type == TxType.INCOME) INCOME_CATEGORIES else EXPENSE_CATEGORIES
        return pool.firstOrNull { it.id == category }
            ?: EXPENSE_CATEGORIES.firstOrNull { it.id == category }
            ?: INCOME_CATEGORIES.firstOrNull { it.id == category }
            ?: CategoryMeta(category.ifBlank { "Other" }, "#64748b", "tag")
    }
}

private val idAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"

fun makeId(prefix: String): String {
    val suffix = (0 until 7).joinToString("") { idAlphabet[Random.nextInt(idAlphabet.length)].toString() }
    return "${prefix}_${suffix}${System.currentTimeMillis().toString(36).takeLast(4)}"
}
