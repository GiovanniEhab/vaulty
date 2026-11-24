package com.vaulty.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class ViewActions(
    val openSheet: (VaultSheet) -> Unit,
    val setView: (AppView) -> Unit,
    val goToPlan: (PlanTab) -> Unit,
    val confirm: (String, String, String, () -> Unit) -> Unit,
    val exportCsv: (List<Transaction>) -> Unit,
    val deleteTransaction: (String) -> Unit,
)

@Composable
fun VaultContent(
    store: VaultStore,
    view: AppView,
    planTab: PlanTab,
    actions: ViewActions,
    updateBanner: (@Composable () -> Unit)? = null,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (store.state.value.isDemoData && !store.state.value.demoBannerDismissed) {
            DemoBanner(store, actions)
        }
        if (updateBanner != null) updateBanner()
        when (view) {
            AppView.OVERVIEW -> OverviewView(store, actions)
            AppView.TRANSACTIONS -> ActivityView(store, actions)
            AppView.ACCOUNTS -> AccountsView(store, actions)
            AppView.PLAN -> PlanView(store, planTab, actions)
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun DemoBanner(store: VaultStore, actions: ViewActions) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFECFDF5))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        VaultIcon("sparkles", tint = Color(0xFF059669), size = 14.dp)
        Spacer(Modifier.width(8.dp))
        Text(
            "Demo data loaded. Tap Start Fresh when ready.",
            Modifier.weight(1f),
            fontSize = 11.sp,
            color = Color(0xFF065F46),
        )
        TextButton(onClick = {
            actions.confirm(
                "Start Fresh?",
                "Clear all transactions, budgets and goals and start with a clean Bank Account and Cash Wallet at 0?",
                "Clear All",
            ) { store.startFresh() }
        }) { Text("Start Fresh", fontSize = 11.sp) }
        TextButton(onClick = { store.dismissDemoBanner() }) { VaultIcon("x", size = 14.dp) }
    }
}

@Composable
private fun OverviewView(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val stats = monthStats(state)
    val total = netWorth(state)
    val recent = state.transactions.sortedWith(compareByDescending<Transaction> { it.date }.thenByDescending { it.id }).take(5)

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF059669), Color(0xFF0F766E))))
                .padding(20.dp),
        ) {
            Column {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Total Balance", fontSize = 12.sp, color = Color(0xFFD1FAE5))
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0x33FFFFFF))
                            .padding(horizontal = 10.dp, vertical = 3.dp),
                    ) { Text("${stats.savingsRate}% saved", fontSize = 11.sp, color = Color.White) }
                }
                Text(formatMoney(total, state.currency), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Text("INCOME", fontSize = 10.sp, color = Color(0xFFD1FAE5))
                        Text(formatMoney(stats.income, state.currency), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                    Column(Modifier.weight(1f)) {
                        Text("EXPENSES", fontSize = 10.sp, color = Color(0xFFD1FAE5))
                        Text(formatMoney(stats.expense, state.currency), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuickAction("−", "Expense", Color(0xFFF43F5E)) { actions.openSheet(VaultSheet.Tx(defaultType = TxType.EXPENSE)) }
            QuickAction("+", "Income", Color(0xFF10B981)) { actions.openSheet(VaultSheet.Tx(defaultType = TxType.INCOME)) }
            QuickAction("↔", "Transfer", Color(0xFF6366F1)) { actions.openSheet(VaultSheet.Tx(defaultType = TxType.TRANSFER)) }
            QuickAction("↻", "Bills", Color(0xFFF59E0B)) { actions.goToPlan(PlanTab.RECURRING) }
        }

        WidgetStripView(store, actions)

        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("My Wallets", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { actions.setView(AppView.ACCOUNTS) }) { Text("See all", fontSize = 11.sp) }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                state.accounts.forEach { account ->
                    val balance = store.balances.value[account.id] ?: 0.0
                    Column(
                        Modifier
                            .width(150.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .clickable { actions.openSheet(VaultSheet.Account(account.id)) }
                            .padding(14.dp),
                    ) {
                        Box(
                            Modifier.size(28.dp).clip(RoundedCornerShape(9.dp)).background(colorFromHex(account.color)),
                            contentAlignment = Alignment.Center,
                        ) { VaultIcon("wallet", tint = Color.White, size = 14.dp) }
                        Spacer(Modifier.height(10.dp))
                        Text(account.name, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            formatMoney(balance, state.currency),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (balance < 0) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
                Column(
                    Modifier
                        .width(110.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable { actions.openSheet(VaultSheet.Account()) }
                        .padding(14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("+", fontSize = 22.sp, color = MaterialTheme.colorScheme.primary)
                    Text("Add Card", fontSize = 11.sp)
                }
            }
        }

        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Spending Breakdown", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(formatMonthLabel(state.activeMonth), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(formatMoney(stats.expense, state.currency), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFE11D48))
            }
            val entries = categoryTotals(state, TxType.EXPENSE).map { it.category to it.total }
            if (entries.isEmpty()) {
                CenterMessage("No expenses recorded for ${formatMonthLabel(state.activeMonth)}")
            } else {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    DonutChart(
                        entries,
                        entries.map { colorFromHex(VaultConstants.categoryMeta(it.first).color) },
                        Modifier.width(120.dp).height(120.dp),
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        entries.take(4).forEach { (category, value) ->
                            val pct = if (stats.expense > 0) (value / stats.expense * 100).toInt() else 0
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).clip(RoundedCornerShape(50)).background(colorFromHex(VaultConstants.categoryMeta(category).color)))
                                Spacer(Modifier.width(6.dp))
                                Text(category, modifier = Modifier.weight(1f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("$pct%", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("6-Month Cash Flow", fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = { actions.openSheet(VaultSheet.Insights) }) { Text("Details", fontSize = 11.sp) }
            }
            val months = last6Months(state.activeMonth)
            val income = months.map { monthStats(state, it).income }
            val expense = months.map { monthStats(state, it).expense }
            PairedBarChart(income, expense, months.map { formatMonthLabel(it).split(" ").firstOrNull().orEmpty() }, Modifier.height(150.dp))
        }

        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Budget Pulse", fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = { actions.goToPlan(PlanTab.BUDGETS) }) { Text("Manage", fontSize = 11.sp) }
            }
            val top = state.budgets.map { budget ->
                val spent = stats.byCategory[budget.category] ?: 0.0
                Triple(budget, spent, if (budget.limit > 0) (spent / budget.limit).toFloat() else 0f)
            }.sortedByDescending { it.third }.take(3)
            if (top.isEmpty()) {
                CenterMessage("No budgets set yet.")
            } else {
                top.forEach { (budget, spent, ratio) ->
                    val pct = (ratio * 100).toInt().coerceAtMost(100)
                    val color = if (spent > budget.limit) Color(0xFFF43F5E) else if (pct >= 75) Color(0xFFF59E0B) else Color(0xFF10B981)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(budget.category, modifier = Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Text("${formatMoney(spent, state.currency)} / ${formatMoney(budget.limit, state.currency)}", fontSize = 10.sp)
                    }
                    VaultProgress(pct / 100f, color)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Recent Activity", fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = { actions.setView(AppView.TRANSACTIONS) }) { Text("See all", fontSize = 11.sp) }
            }
            if (recent.isEmpty()) {
                CenterMessage("No transactions yet. Tap + below to add one.")
            } else {
                recent.forEach { TransactionRow(it, state, actions, false) }
            }
        }
    }
}

@Composable
private fun RowScope.QuickAction(glyph: String, label: String, color: Color, onClick: () -> Unit) {
    Column(
        Modifier
            .weight(1f)
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            Text(glyph, color = color, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun WidgetStripView(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val stats = monthStats(state)
    val net = netWorth(state)
    val topBudget = state.budgets.map { it to (stats.byCategory[it.category] ?: 0.0) }.maxByOrNull { if (it.first.limit > 0) it.second / it.first.limit else 0.0 }
    val topGoal = state.goals.maxByOrNull { if (it.target > 0) it.current / it.target else 0.0 }

    Column {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("WIDGETS", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            TextButton(onClick = { actions.openSheet(VaultSheet.Widgets) }) { Text("Edit", fontSize = 11.sp) }
        }
        if (state.widgetIds.isEmpty()) {
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { actions.openSheet(VaultSheet.Widgets) }.padding(16.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Add a widget", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                state.widgetIds.forEach { widget ->
                    val card = when (widget) {
                        WidgetId.MONTH -> WidgetCard("This month", "calendar", Color(0xFFF43F5E), formatMoney(stats.expense, state.currency), "in ${formatMoney(stats.income, state.currency)}", null) { actions.setView(AppView.TRANSACTIONS) }
                        WidgetId.BUDGET -> if (topBudget != null) {
                            val ratio = if (topBudget.first.limit > 0) topBudget.second / topBudget.first.limit else 0.0
                            WidgetCard("Top budget", "pie-chart", colorFromHex(VaultConstants.categoryMeta(topBudget.first.category).color), "${(ratio * 100).toInt().coerceAtMost(999)}% used", "${topBudget.first.category} · ${formatMoney(topBudget.second, state.currency)}", ratio.toFloat().coerceIn(0f, 1f)) { actions.goToPlan(PlanTab.BUDGETS) }
                        } else WidgetCard("Top budget", "pie-chart", Color(0xFFF59E0B), "No budgets", "Tap to set one", null) { actions.goToPlan(PlanTab.BUDGETS) }
                        WidgetId.GOAL -> if (topGoal != null) {
                            val ratio = if (topGoal.target > 0) topGoal.current / topGoal.target else 0.0
                            WidgetCard("Top goal", "wallet", colorFromHex(topGoal.color), "${(ratio * 100).toInt().coerceAtMost(999)}% saved", topGoal.name, ratio.toFloat().coerceIn(0f, 1f)) { actions.goToPlan(PlanTab.GOALS) }
                        } else WidgetCard("Top goal", "wallet", Color(0xFF6366F1), "No goals", "Tap to create one", null) { actions.goToPlan(PlanTab.GOALS) }
                        WidgetId.VOICE -> WidgetCard("Assistant", "mic", Color(0xFF059669), "Ask Vaulty", "Speak a command", null) { actions.openSheet(VaultSheet.Assistant) }
                        WidgetId.NET_WORTH -> WidgetCard("Net worth", "wallet", Color(0xFF059669), formatMoney(net, state.currency), "${state.accounts.size} accounts", null) { actions.setView(AppView.ACCOUNTS) }
                    }
                    WidgetCardView(card)
                }
            }
        }
    }
}

private data class WidgetCard(
    val label: String,
    val icon: String,
    val accent: Color,
    val value: String,
    val sub: String,
    val progress: Float?,
    val onClick: () -> Unit,
)

@Composable
private fun WidgetCardView(card: WidgetCard) {
    Column(
        Modifier
            .width(140.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = card.onClick)
            .padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(card.label.uppercase(), modifier = Modifier.weight(1f), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box(Modifier.size(24.dp).clip(RoundedCornerShape(8.dp)).background(card.accent.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                VaultIcon(card.icon, tint = card.accent, size = 13.dp)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(card.value, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(card.sub, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (card.progress != null) {
            Spacer(Modifier.height(8.dp))
            VaultProgress(card.progress, card.accent)
        }
    }
}

@Composable
fun TransactionRow(tx: Transaction, state: VaultState, actions: ViewActions, allowDelete: Boolean) {
    val meta = VaultConstants.categoryMeta(tx.category, tx.type)
    val color = colorFromHex(meta.color)
    val amountText = when (tx.type) {
        TxType.INCOME -> "+${formatMoney(tx.amount, state.currency)}"
        TxType.EXPENSE -> "−${formatMoney(tx.amount, state.currency)}"
        TxType.TRANSFER -> "↔ ${formatMoney(tx.amount, state.currency)}"
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { actions.openSheet(VaultSheet.Tx(tx.id)) }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            VaultIcon(meta.icon, tint = color, size = 16.dp)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(tx.description.ifBlank { tx.category }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${tx.date} · ${tx.category}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            amountText,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = if (tx.type == TxType.INCOME) Color(0xFF059669) else if (tx.type == TxType.EXPENSE) Color(0xFFE11D48) else Color(0xFF6366F1),
        )
        if (allowDelete) {
            TextButton(onClick = {
                actions.confirm("Delete Transaction?", "Remove this transaction and recalculate your balance?", "Delete") {
                    actions.deleteTransaction(tx.id)
                }
            }) { VaultIcon("x", size = 12.dp) }
        }
    }
}

@Composable
private fun ActivityView(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    var search by remember { mutableStateOf("") }
    var typeFilter by remember { mutableStateOf("all") }
    var accountFilter by remember { mutableStateOf("all") }
    var categoryFilter by remember { mutableStateOf("all") }
    var period by remember { mutableStateOf("activeMonth") }
    var sort by remember { mutableStateOf("date_desc") }

    val query = search.trim().lowercase()
    var filtered = state.transactions.filter { tx ->
        (period != "activeMonth" || tx.date.startsWith(state.activeMonth)) &&
            (typeFilter == "all" || tx.type.value == typeFilter) &&
            (accountFilter == "all" || tx.accountId == accountFilter || tx.toAccountId == accountFilter) &&
            (categoryFilter == "all" || tx.category == categoryFilter) &&
            (query.isBlank() || "${tx.description} ${tx.category} ${tx.notes}".lowercase().contains(query))
    }
    filtered = when (sort) {
        "date_asc" -> filtered.sortedBy { it.date }
        "amount_desc" -> filtered.sortedByDescending { it.amount }
        "amount_asc" -> filtered.sortedBy { it.amount }
        else -> filtered.sortedWith(compareByDescending<Transaction> { it.date }.thenByDescending { it.id })
    }
    val inflow = filtered.filter { it.type == TxType.INCOME }.sumOf { it.amount }
    val outflow = filtered.filter { it.type == TxType.EXPENSE }.sumOf { it.amount }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            placeholder = { Text("Search merchant, category, notes...") },
            leadingIcon = { VaultIcon("search", size = 16.dp) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("all", "expense", "income", "transfer").forEach { option ->
                FilterChip(
                    selected = typeFilter == option,
                    onClick = { typeFilter = option },
                    label = { Text(option.replaceFirstChar { it.uppercase() }, fontSize = 11.sp) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Color(0xFF059669), selectedLabelColor = Color.White),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VaultSelect("Period", period, listOf("activeMonth" to formatMonthLabel(state.activeMonth), "all" to "All Time"), { period = it }, Modifier.weight(1f))
            VaultSelect("Account", accountFilter, listOf("all" to "All Accounts") + state.accounts.map { it.id to it.name }, { accountFilter = it }, Modifier.weight(1f))
            VaultSelect("Category", categoryFilter, listOf("all" to "All Categories") + VaultConstants.allCategories.map { it to it }, { categoryFilter = it }, Modifier.weight(1f))
        }
        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("+${formatMoney(inflow, state.currency)}", color = Color(0xFF059669), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("−${formatMoney(outflow, state.currency)}", color = Color(0xFFE11D48), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                VaultSelect("Sort", sort, listOf("date_desc" to "Newest", "date_asc" to "Oldest", "amount_desc" to "Highest", "amount_asc" to "Lowest"), { sort = it }, Modifier.width(110.dp))
                TextButton(onClick = { actions.openSheet(VaultSheet.Insights) }) { Text("Insights", fontSize = 10.sp) }
                TextButton(onClick = { actions.exportCsv(filtered) }) { Text("CSV", fontSize = 10.sp) }
            }
        }
        SectionCard {
            if (filtered.isEmpty()) {
                CenterMessage("No matching activity\nAdjust filters or tap + to log a transaction.")
            } else {
                filtered.forEach { tx ->
                    TransactionRow(tx, state, actions, true)
                    if (tx.id != filtered.last().id) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)))
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountsView(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val assets = store.balances.value.values.filter { it >= 0 }.sum()
    val liabilities = store.balances.value.values.filter { it < 0 }.sumOf { kotlin.math.abs(it) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionCard(Modifier.weight(1f)) {
                SectionTitle("Assets")
                Text(formatMoney(assets, state.currency), fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669))
            }
            SectionCard(Modifier.weight(1f)) {
                SectionTitle("Liabilities")
                Text(formatMoney(liabilities, state.currency), fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color(0xFFE11D48))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { actions.openSheet(VaultSheet.Tx(defaultType = TxType.TRANSFER)) }, Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    VaultIcon("arrow-left-right", size = 13.dp)
                    Text("Transfer", fontSize = 11.sp)
                }
            }
            Button(onClick = { actions.openSheet(VaultSheet.Account()) }, Modifier.weight(1f)) { Text("+ New Account", fontSize = 11.sp) }
        }
        state.accounts.forEach { account ->
            val balance = store.balances.value[account.id] ?: 0.0
            val entries = state.transactions.count { it.accountId == account.id || it.toAccountId == account.id }
            SectionCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(16.dp)).background(colorFromHex(account.color)), contentAlignment = Alignment.Center) {
                        VaultIcon("wallet", tint = Color.White, size = 20.dp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(account.name, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("${account.type.label} · $entries entries", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(formatMoney(balance, state.currency), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (balance < 0) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface)
                        Row {
                            TextButton(onClick = { actions.openSheet(VaultSheet.Account(account.id)) }) { VaultIcon("pencil", size = 14.dp) }
                            TextButton(onClick = {
                                if (state.accounts.size <= 1) {
                                    actions.confirm("Keep at least one account", "You need one account to log transactions against. Add another account first.", "Got it") {}
                                } else {
                                    actions.confirm("Delete Account?", "Delete \"${account.name}\" and every transaction tied to it? This cannot be undone.", "Delete") { store.deleteAccount(account.id) }
                                }
                            }) { VaultIcon("trash-2", size = 14.dp) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanView(store: VaultStore, planTab: PlanTab, actions: ViewActions) {
    val state = store.state.value
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)).padding(4.dp)) {
            PlanTab.entries.forEach { tab ->
                Button(
                    onClick = { actions.goToPlan(tab) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (planTab == tab) MaterialTheme.colorScheme.surface else Color.Transparent,
                        contentColor = if (planTab == tab) Color(0xFF059669) else MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                ) { Text(tab.label, fontSize = 11.sp) }
            }
        }
        when (planTab) {
            PlanTab.BUDGETS -> BudgetsTab(store, actions)
            PlanTab.GOALS -> GoalsTab(store, actions)
            PlanTab.RECURRING -> RecurringTab(store, actions)
        }
    }
}

@Composable
private fun BudgetsTab(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val stats = monthStats(state)
    val totalLimit = state.budgets.sumOf { it.limit }
    val totalSpent = state.budgets.sumOf { stats.byCategory[it.category] ?: 0.0 }
    val remaining = totalLimit - totalSpent
    val pct = if (totalLimit > 0) (totalSpent / totalLimit * 100).toInt().coerceAtMost(100) else 0
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${formatMonthLabel(state.activeMonth)} Budget", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${formatMoney(totalSpent, state.currency)} / ${formatMoney(totalLimit, state.currency)}", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
                Button(onClick = { actions.openSheet(VaultSheet.Budget()) }) { Text("+ Add", fontSize = 11.sp) }
            }
            VaultProgress(pct / 100f, if (remaining < 0) Color(0xFFF43F5E) else if (pct >= 80) Color(0xFFF59E0B) else Color(0xFF10B981))
            Row(Modifier.fillMaxWidth()) {
                Text("$pct% used", modifier = Modifier.weight(1f), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    if (remaining >= 0) "${formatMoney(remaining, state.currency)} left" else "${formatMoney(-remaining, state.currency)} over",
                    fontSize = 10.sp,
                    color = if (remaining < 0) Color(0xFFE11D48) else Color(0xFF059669),
                )
            }
        }
        if (state.budgets.isEmpty()) CenterMessage("No category budgets yet. Tap Add above to set one.")
        state.budgets.forEach { budget ->
            val spent = stats.byCategory[budget.category] ?: 0.0
            val left = budget.limit - spent
            val ratio = if (budget.limit > 0) (spent / budget.limit).toFloat().coerceIn(0f, 1f) else 0f
            val meta = VaultConstants.categoryMeta(budget.category)
            SectionCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(colorFromHex(meta.color).copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                        VaultIcon(meta.icon, tint = colorFromHex(meta.color), size = 16.dp)
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(budget.category, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("${formatMoney(spent, state.currency)} of ${formatMoney(budget.limit, state.currency)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { actions.openSheet(VaultSheet.Budget(budget.id)) }) { VaultIcon("pencil", size = 14.dp) }
                    TextButton(onClick = {
                        actions.confirm("Remove budget?", "Remove the ${budget.category} budget? Your transactions are not affected.", "Remove") { store.deleteBudget(budget.id) }
                    }) { VaultIcon("trash-2", size = 14.dp) }
                }
                VaultProgress(ratio, if (left < 0) Color(0xFFF43F5E) else if (ratio >= 0.75f) Color(0xFFF59E0B) else Color(0xFF10B981))
                Text(
                    if (left >= 0) "${formatMoney(left, state.currency)} left" else "${formatMoney(-left, state.currency)} over",
                    Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    fontSize = 10.sp,
                    color = if (left < 0) Color(0xFFE11D48) else Color(0xFF059669),
                )
            }
        }
    }
}

@Composable
private fun GoalsTab(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val totalSaved = state.goals.sumOf { it.current }
    val totalTarget = state.goals.sumOf { it.target }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Total Saved", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${formatMoney(totalSaved, state.currency)} / ${formatMoney(totalTarget, state.currency)}", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Button(onClick = { actions.openSheet(VaultSheet.Goal()) }) { Text("+ New Goal", fontSize = 11.sp) }
        }
        if (state.goals.isEmpty()) CenterMessage("No savings goals yet. Tap New Goal to create one.")
        state.goals.forEach { goal ->
            val ratio = if (goal.target > 0) (goal.current / goal.target).toFloat().coerceIn(0f, 1f) else 0f
            val remaining = maxOf(0.0, goal.target - goal.current)
            SectionCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(goal.name, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(if (goal.deadline.isNotBlank()) "Target: ${goal.deadline}" else "No target date", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { actions.openSheet(VaultSheet.Goal(goal.id)) }) { VaultIcon("pencil", size = 14.dp) }
                    TextButton(onClick = { actions.confirm("Delete Goal?", "Remove \"${goal.name}\"? Your accounts and transactions stay untouched.", "Delete") { store.deleteGoal(goal.id) } }) { VaultIcon("trash-2", size = 14.dp) }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Text(formatMoney(goal.current, state.currency), fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("${(ratio * 100).toInt()}%", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = colorFromHex(goal.color))
                }
                VaultProgress(ratio, colorFromHex(goal.color))
                Text(
                    if (remaining == 0.0) "Goal reached!" else "${formatMoney(remaining, state.currency)} remaining of ${formatMoney(goal.target, state.currency)}",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(onClick = { actions.openSheet(VaultSheet.Contribute(goal.id)) }, Modifier.fillMaxWidth()) { Text("+ Add / Update Contribution", fontSize = 11.sp) }
            }
        }
    }
}

@Composable
private fun RecurringTab(store: VaultStore, actions: ViewActions) {
    val state = store.state.value
    val monthlyIn = state.recurring.filter { it.type == TxType.INCOME }.sumOf { it.amount }
    val monthlyOut = state.recurring.filter { it.type == TxType.EXPENSE }.sumOf { it.amount }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Fixed Monthly Net", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(formatMoney(monthlyIn - monthlyOut, state.currency, true), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Button(onClick = { actions.openSheet(VaultSheet.Recurring) }) { Text("+ Add Bill", fontSize = 11.sp) }
        }
        if (state.recurring.isEmpty()) CenterMessage("No recurring items yet.")
        state.recurring.sortedBy { it.dayOfMonth }.forEach { item ->
            val meta = VaultConstants.categoryMeta(item.category, item.type)
            val logged = item.lastLoggedMonth == state.activeMonth
            SectionCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(colorFromHex(meta.color).copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                        VaultIcon(meta.icon, tint = colorFromHex(meta.color), size = 16.dp)
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text("Day ${item.dayOfMonth} · ${if (item.type == TxType.INCOME) "+" else "−"}${formatMoney(item.amount, state.currency)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (logged) {
                        Text("Logged", fontSize = 10.sp, color = Color(0xFF059669))
                    } else {
                        Button(onClick = { store.logRecurring(item.id) }) { Text("Log", fontSize = 10.sp) }
                    }
                    TextButton(onClick = {
                        actions.confirm("Remove recurring item?", "Stop tracking \"${item.title}\"? Transactions already logged stay in your ledger.", "Remove") { store.deleteRecurring(item.id) }
                    }) { VaultIcon("trash-2", size = 14.dp) }
                }
            }
        }
    }
}
