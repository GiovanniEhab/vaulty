package com.vaulty.app

data class MonthStats(
    val income: Double = 0.0,
    val expense: Double = 0.0,
    val net: Double = 0.0,
    val savingsRate: Int = 0,
    val byCategory: Map<String, Double> = emptyMap(),
)

data class DailyTotal(val day: Int, val income: Double = 0.0, val expense: Double = 0.0)

data class CategoryTotal(val category: String, val total: Double, val share: Double)

data class DescriptionTotal(val label: String, val total: Double, val count: Int)

data class AccountFlow(
    val account: Account,
    val inflow: Double,
    val outflow: Double,
    val net: Double,
)

private fun amountOf(value: Double): Double = if (value.isFinite()) value else 0.0

fun computeBalances(state: VaultState): Map<String, Double> {
    val balances = LinkedHashMap<String, Double>()
    state.accounts.forEach { balances[it.id] = amountOf(it.initialBalance) }
    state.transactions.forEach { tx ->
        val amount = amountOf(tx.amount)
        when (tx.type) {
            TxType.INCOME -> balances[tx.accountId]?.let { balances[tx.accountId] = it + amount }
            TxType.EXPENSE -> balances[tx.accountId]?.let { balances[tx.accountId] = it - amount }
            TxType.TRANSFER -> {
                balances[tx.accountId]?.let { balances[tx.accountId] = it - amount }
                tx.toAccountId?.let { to -> balances[to]?.let { balances[to] = it + amount } }
            }
        }
    }
    return balances
}

fun netWorth(state: VaultState): Double = computeBalances(state).values.sum()

fun monthStats(state: VaultState, ym: String = state.activeMonth): MonthStats {
    var income = 0.0
    var expense = 0.0
    val byCategory = LinkedHashMap<String, Double>()
    state.transactions.forEach { tx ->
        if (tx.date.isEmpty() || !tx.date.startsWith(ym)) return@forEach
        val amount = amountOf(tx.amount)
        when (tx.type) {
            TxType.INCOME -> income += amount
            TxType.EXPENSE -> {
                expense += amount
                byCategory[tx.category] = (byCategory[tx.category] ?: 0.0) + amount
            }
            TxType.TRANSFER -> Unit
        }
    }
    val net = income - expense
    val rate = if (income > 0) ((net / income) * 100).toInt() else 0
    return MonthStats(income, expense, net, rate, byCategory)
}

fun totalInCategories(stats: MonthStats, categories: List<String>): Double =
    categories.sumOf { stats.byCategory[it] ?: 0.0 }

fun dailyTotals(state: VaultState, ym: String = state.activeMonth): List<DailyTotal> {
    val rows = (1..daysInMonth(ym)).associateWith { DailyTotal(it) }.toMutableMap()
    state.transactions.forEach { tx ->
        if (tx.date.isEmpty() || !tx.date.startsWith(ym)) return@forEach
        val day = tx.date.takeLast(2).toIntOrNull() ?: return@forEach
        val row = rows[day] ?: return@forEach
        val amount = amountOf(tx.amount)
        rows[day] = when (tx.type) {
            TxType.INCOME -> row.copy(income = row.income + amount)
            TxType.EXPENSE -> row.copy(expense = row.expense + amount)
            TxType.TRANSFER -> row
        }
    }
    return rows.values.sortedBy { it.day }
}

fun categoryTotals(
    state: VaultState,
    type: TxType,
    ym: String = state.activeMonth,
): List<CategoryTotal> {
    val byCategory = LinkedHashMap<String, Double>()
    var sum = 0.0
    state.transactions.forEach { tx ->
        if (tx.date.isEmpty() || !tx.date.startsWith(ym) || tx.type != type) return@forEach
        val amount = amountOf(tx.amount)
        byCategory[tx.category] = (byCategory[tx.category] ?: 0.0) + amount
        sum += amount
    }
    return byCategory
        .map { (category, total) -> CategoryTotal(category, total, if (sum > 0) total / sum else 0.0) }
        .sortedByDescending { it.total }
}

fun topDescriptions(
    state: VaultState,
    type: TxType,
    ym: String = state.activeMonth,
    limit: Int = 5,
): List<DescriptionTotal> {
    val map = LinkedHashMap<String, Pair<Double, Int>>()
    state.transactions.forEach { tx ->
        if (tx.date.isEmpty() || !tx.date.startsWith(ym) || tx.type != type) return@forEach
        val label = tx.description.ifBlank { tx.category }.ifBlank { "Other" }.trim()
        val (total, count) = map[label] ?: (0.0 to 0)
        map[label] = (total + amountOf(tx.amount)) to (count + 1)
    }
    return map
        .map { (label, value) -> DescriptionTotal(label, value.first, value.second) }
        .sortedByDescending { it.total }
        .take(limit)
}

fun accountFlow(state: VaultState, ym: String = state.activeMonth): List<AccountFlow> =
    state.accounts.map { account ->
        var inflow = 0.0
        var outflow = 0.0
        state.transactions.forEach { tx ->
            if (tx.date.isEmpty() || !tx.date.startsWith(ym)) return@forEach
            val amount = amountOf(tx.amount)
            when (tx.type) {
                TxType.INCOME -> if (tx.accountId == account.id) inflow += amount
                TxType.EXPENSE -> if (tx.accountId == account.id) outflow += amount
                TxType.TRANSFER -> {
                    if (tx.accountId == account.id) outflow += amount
                    if (tx.toAccountId == account.id) inflow += amount
                }
            }
        }
        AccountFlow(account, inflow, outflow, inflow - outflow)
    }

fun assetsAndLiabilities(state: VaultState): Pair<Double, Double> {
    val balances = computeBalances(state)
    val assets = balances.values.filter { it > 0 }.sum()
    val liabilities = balances.values.filter { it < 0 }.sumOf { Math.abs(it) }
    return assets to liabilities
}
