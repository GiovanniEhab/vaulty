package com.vaulty.app

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultSheetHost(
    sheet: VaultSheet?,
    store: VaultStore,
    onClose: () -> Unit,
    onOpenSheet: (VaultSheet) -> Unit,
    assistantContent: @Composable (() -> Unit)? = null,
    dataContent: @Composable (() -> Unit)? = null,
) {
    if (sheet == null) return
    ModalBottomSheet(onDismissRequest = onClose) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(sheetTitle(sheet), fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = onClose) { Text("Done") }
            }
            when (sheet) {
                is VaultSheet.Tx -> TransactionSheet(sheet, store, onClose)
                is VaultSheet.Account -> AccountSheet(sheet, store, onClose)
                is VaultSheet.Budget -> BudgetSheet(sheet, store, onClose)
                is VaultSheet.Goal -> GoalSheet(sheet, store, onClose)
                is VaultSheet.Contribute -> ContributeSheet(sheet, store, onClose)
                VaultSheet.Recurring -> RecurringSheet(store, onClose)
                VaultSheet.Widgets -> WidgetsSheet(store)
                VaultSheet.Insights -> InsightsSheet(store)
                VaultSheet.Assistant -> assistantContent?.invoke() ?: CenterMessage("Assistant is unavailable.")
                VaultSheet.Data -> dataContent?.invoke() ?: CenterMessage("Settings are unavailable.")
                is VaultSheet.Confirm -> ConfirmSheet(sheet, onClose)
            }
        }
    }
}

private fun sheetTitle(sheet: VaultSheet): String = when (sheet) {
    is VaultSheet.Tx -> if (sheet.id == null) "Add Transaction" else "Edit Transaction"
    is VaultSheet.Account -> if (sheet.id == null) "New Account" else "Edit Account"
    is VaultSheet.Budget -> if (sheet.id == null) "Set Category Budget" else "Edit Budget"
    is VaultSheet.Goal -> if (sheet.id == null) "New Savings Goal" else "Edit Savings Goal"
    is VaultSheet.Contribute -> "Update Goal"
    VaultSheet.Recurring -> "Add Recurring Item"
    VaultSheet.Widgets -> "Widgets"
    VaultSheet.Insights -> "Insights"
    VaultSheet.Assistant -> "Vaulty Assistant"
    VaultSheet.Data -> "Settings & Data"
    is VaultSheet.Confirm -> sheet.title
}

@Composable
private fun TypeSelector(options: List<TxType>, selected: TxType, onSelect: (TxType) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)).padding(4.dp)) {
        options.forEach { option ->
            Button(
                onClick = { onSelect(option) },
                Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (selected == option) when (option) {
                        TxType.EXPENSE -> Color(0xFFE11D48)
                        TxType.INCOME -> Color(0xFF059669)
                        TxType.TRANSFER -> Color(0xFF6366F1)
                    } else Color.Transparent,
                    contentColor = if (selected == option) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) { Text(option.value.replaceFirstChar { it.uppercase() }, fontSize = 11.sp) }
        }
    }
}

@Composable
private fun TransactionSheet(sheet: VaultSheet.Tx, store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    val existing = sheet.id?.let { id -> state.transactions.firstOrNull { it.id == id } }
    if (state.accounts.isEmpty()) {
        CenterMessage("Create an account first — open the Accounts tab and tap “New Account”.")
        return
    }
    var type by remember { mutableStateOf(existing?.type ?: sheet.defaultType) }
    var amount by remember { mutableStateOf(existing?.amount?.toString() ?: "") }
    var date by remember { mutableStateOf(existing?.date ?: defaultDate(state.activeMonth)) }
    var description by remember { mutableStateOf(existing?.description ?: "") }
    var accountId by remember { mutableStateOf(existing?.accountId ?: state.accounts.first().id) }
    var toAccountId by remember { mutableStateOf(existing?.toAccountId ?: state.accounts.getOrNull(1)?.id ?: state.accounts.first().id) }
    var category by remember { mutableStateOf(existing?.category ?: VaultConstants.EXPENSE_CATEGORIES.first().id) }
    var notes by remember { mutableStateOf(existing?.notes ?: "") }

    val pool = if (type == TxType.INCOME) VaultConstants.INCOME_CATEGORIES else VaultConstants.EXPENSE_CATEGORIES
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TypeSelector(TxType.entries, type) { next ->
            type = next
            if (next != TxType.TRANSFER && pool.none { it.id == category }) {
                category = if (next == TxType.INCOME) VaultConstants.INCOME_CATEGORIES.first().id else VaultConstants.EXPENSE_CATEGORIES.first().id
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VaultField("Amount (${state.currency.code})", amount, { amount = it }, Modifier.weight(1f), numeric = true)
            VaultField("Date", date, { date = it }, Modifier.weight(1f))
        }
        VaultField("Description", description, { description = it }, placeholder = "e.g., Groceries, Coffee, Salary")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VaultSelect(if (type == TxType.TRANSFER) "From" else "Account", accountId, state.accounts.map { it.id to it.name }, { accountId = it }, Modifier.weight(1f))
            if (type == TxType.TRANSFER) {
                VaultSelect("To Account", toAccountId, state.accounts.map { it.id to it.name }, { toAccountId = it }, Modifier.weight(1f))
            } else {
                VaultSelect("Category", category, pool.map { it.id to it.id }, { category = it }, Modifier.weight(1f))
            }
        }
        VaultField("Notes (optional)", notes, { notes = it }, placeholder = "Optional note")
        Button(onClick = {
            val numeric = amount.toDoubleOrNull()
            if (numeric == null || numeric <= 0.0) {
                store.consumeToast()
                showNativeToast("Enter an amount greater than 0.")
                return@Button
            }
            if (type == TxType.TRANSFER && accountId == toAccountId) {
                showNativeToast("Pick two different accounts.")
                return@Button
            }
            val resolved = if (type == TxType.TRANSFER) "Transfer" else category
            store.saveTransaction(
                Transaction(
                    id = existing?.id ?: makeId("tx"),
                    type = type,
                    amount = numeric,
                    date = date.ifBlank { todayISO() },
                    accountId = accountId,
                    toAccountId = if (type == TxType.TRANSFER) toAccountId else null,
                    category = resolved,
                    description = description.trim().ifBlank { resolved },
                    notes = notes.trim(),
                ),
            )
            onClose()
        }, Modifier.fillMaxWidth()) { Text(if (existing == null) "Save Transaction" else "Save Changes") }
    }
}

private fun defaultDate(activeMonth: String): String {
    val today = todayISO()
    return if (today.startsWith(activeMonth)) today else "$activeMonth-01"
}

@Composable
private fun AccountSheet(sheet: VaultSheet.Account, store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    val existing = sheet.id?.let { id -> state.accounts.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var type by remember { mutableStateOf(existing?.type ?: AccountType.CHECKING) }
    var initial by remember { mutableStateOf(existing?.initialBalance?.toString() ?: "0") }
    var color by remember { mutableStateOf(existing?.color ?: VaultConstants.ACCOUNT_COLORS.first()) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        VaultField("Account Name", name, { name = it }, placeholder = "e.g., Bank Checking, Cash Wallet")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VaultSelect("Type", type, AccountType.entries.map { it to it.label }, { type = it }, Modifier.weight(1f))
            VaultField("Opening Balance", initial, { initial = it }, Modifier.weight(1f), numeric = true)
        }
        SectionTitle("Color")
        ColorPicker(VaultConstants.ACCOUNT_COLORS, color, { color = it })
        Button(onClick = {
            if (name.isBlank()) {
                showNativeToast("Give the account a name.")
                return@Button
            }
            store.saveAccount(Account(existing?.id ?: makeId("acc"), name.trim(), type, initial.toDoubleOrNull() ?: 0.0, color))
            onClose()
        }, Modifier.fillMaxWidth()) { Text(if (existing == null) "Create Account" else "Save Account") }
    }
}

@Composable
private fun BudgetSheet(sheet: VaultSheet.Budget, store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    val existing = sheet.id?.let { id -> state.budgets.firstOrNull { it.id == id } }
    val used = state.budgets.filter { it.id != existing?.id }.map { it.category }.toSet()
    val available = VaultConstants.EXPENSE_CATEGORIES.filter { it.id !in used }
    if (existing == null && available.isEmpty()) {
        CenterMessage("Every expense category already has a budget.")
        return
    }
    var category by remember { mutableStateOf(existing?.category ?: available.firstOrNull()?.id ?: VaultConstants.EXPENSE_CATEGORIES.first().id) }
    var limit by remember { mutableStateOf(existing?.limit?.toString() ?: "") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        VaultSelect("Category", category, (if (existing != null) listOf(VaultConstants.categoryMeta(existing.category)) else available).map { it.id to it.id }, { category = it }, enabled = existing == null)
        VaultField("Monthly Limit (${state.currency.code})", limit, { limit = it }, numeric = true)
        Button(onClick = {
            val numeric = limit.toDoubleOrNull()
            if (numeric == null || numeric <= 0.0) {
                showNativeToast("Enter a monthly limit greater than 0.")
                return@Button
            }
            store.saveBudget(Budget(existing?.id ?: makeId("bud"), category, numeric))
            onClose()
        }, Modifier.fillMaxWidth()) { Text(if (existing == null) "Save Budget" else "Update Budget") }
    }
}

@Composable
private fun GoalSheet(sheet: VaultSheet.Goal, store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    val existing = sheet.id?.let { id -> state.goals.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var target by remember { mutableStateOf(existing?.target?.toString() ?: "") }
    var current by remember { mutableStateOf(existing?.current?.toString() ?: "0") }
    var deadline by remember { mutableStateOf(existing?.deadline ?: "") }
    var color by remember { mutableStateOf(existing?.color ?: VaultConstants.GOAL_COLORS.first()) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        VaultField("Goal Name", name, { name = it }, placeholder = "e.g., Emergency Fund")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VaultField("Target (${state.currency.code})", target, { target = it }, Modifier.weight(1f), numeric = true)
            VaultField("Saved So Far", current, { current = it }, Modifier.weight(1f), numeric = true)
        }
        VaultField("Target Date (optional)", deadline, { deadline = it })
        SectionTitle("Color")
        ColorPicker(VaultConstants.GOAL_COLORS, color, { color = it })
        Button(onClick = {
            val numericTarget = target.toDoubleOrNull()
            if (name.isBlank() || numericTarget == null || numericTarget <= 0.0) {
                showNativeToast(if (name.isBlank()) "Name your goal." else "Enter a target amount.")
                return@Button
            }
            store.saveGoal(Goal(existing?.id ?: makeId("goal"), name.trim(), numericTarget, maxOf(0.0, current.toDoubleOrNull() ?: 0.0), deadline, color))
            onClose()
        }, Modifier.fillMaxWidth()) { Text(if (existing == null) "Create Goal" else "Save Goal") }
    }
}

@Composable
private fun ContributeSheet(sheet: VaultSheet.Contribute, store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    val goal = state.goals.firstOrNull { it.id == sheet.id }
    if (goal == null) {
        CenterMessage("This goal no longer exists.")
        return
    }
    var amount by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)).padding(12.dp)) {
            Text(goal.name, modifier = Modifier.weight(1f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("${formatMoney(goal.current, state.currency)} / ${formatMoney(goal.target, state.currency)}", fontSize = 11.sp)
        }
        VaultField("Amount (${state.currency.code})", amount, { amount = it }, numeric = true)
        Text("Use a negative amount to withdraw from this goal.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = {
            val delta = amount.toDoubleOrNull()
            if (delta == null || delta == 0.0) {
                showNativeToast("Enter an amount (negative to withdraw).")
                return@Button
            }
            store.contributeToGoal(goal.id, delta)
            onClose()
        }, Modifier.fillMaxWidth()) { Text("Apply Contribution") }
    }
}

@Composable
private fun RecurringSheet(store: VaultStore, onClose: () -> Unit) {
    val state = store.state.value
    if (state.accounts.isEmpty()) {
        CenterMessage("Create an account first — recurring items are posted to an account.")
        return
    }
    var title by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(TxType.EXPENSE) }
    var amount by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("1") }
    var accountId by remember { mutableStateOf(state.accounts.first().id) }
    var category by remember { mutableStateOf(VaultConstants.EXPENSE_CATEGORIES.first().id) }
    val pool = if (type == TxType.INCOME) VaultConstants.INCOME_CATEGORIES else VaultConstants.EXPENSE_CATEGORIES
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        VaultField("Title", title, { title = it }, placeholder = "e.g., Rent, Internet, Salary")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            VaultSelect("Type", type, listOf(TxType.EXPENSE to "Expense", TxType.INCOME to "Income"), {
                type = it
                category = if (it == TxType.INCOME) VaultConstants.INCOME_CATEGORIES.first().id else VaultConstants.EXPENSE_CATEGORIES.first().id
            }, Modifier.weight(1f))
            VaultField("Amount", amount, { amount = it }, Modifier.weight(1f), numeric = true)
            VaultField("Day", day, { day = it }, Modifier.weight(0.6f), numeric = true)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VaultSelect("Account", accountId, state.accounts.map { it.id to it.name }, { accountId = it }, Modifier.weight(1f))
            VaultSelect("Category", category, pool.map { it.id to it.id }, { category = it }, Modifier.weight(1f))
        }
        Button(onClick = {
            val numeric = amount.toDoubleOrNull()
            if (title.isBlank() || numeric == null || numeric <= 0.0) {
                showNativeToast("Add a title and an amount.")
                return@Button
            }
            store.saveRecurring(
                Recurring(
                    id = makeId("rec"),
                    title = title.trim(),
                    type = type,
                    amount = numeric,
                    dayOfMonth = (day.toIntOrNull() ?: 1).coerceIn(1, 28),
                    accountId = accountId,
                    category = category,
                    lastLoggedMonth = "",
                ),
            )
            onClose()
        }, Modifier.fillMaxWidth()) { Text("Save Recurring") }
    }
}

@Composable
private fun WidgetsSheet(store: VaultStore) {
    val state = store.state.value
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Pick the cards that sit on your home screen. Widgets update as you log money.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        WidgetId.entries.forEach { widget ->
            VaultSwitchRow(
                title = widget.label,
                subtitle = widget.description,
                checked = widget in state.widgetIds,
                onCheckedChange = { checked ->
                    val next = if (checked) (state.widgetIds + widget).distinct() else state.widgetIds - widget
                    store.updateSettings(widgetIds = next)
                },
            )
        }
        if (state.widgetIds.isEmpty()) {
            Text("All widgets are hidden. Turn one on to see it on the home screen.", fontSize = 10.sp, color = Color(0xFFB45309))
        }
    }
}

@Composable
private fun ConfirmSheet(sheet: VaultSheet.Confirm, onClose: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(sheet.message, fontSize = 13.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = onClose, Modifier.weight(1f)) { Text("Cancel") }
            Button(onClick = { sheet.onConfirm(); onClose() }, Modifier.weight(1f)) { Text(sheet.confirmLabel) }
        }
    }
}

@Composable
private fun InsightsSheet(store: VaultStore) {
    val state = store.state.value
    val stats = monthStats(state)
    val previous = monthStats(state, shiftMonth(state.activeMonth, -1))
    val expenses = categoryTotals(state, TxType.EXPENSE)
    val incomes = categoryTotals(state, TxType.INCOME)
    val daily = dailyTotals(state)
    val topExpenses = topDescriptions(state, TxType.EXPENSE)
    val topIncome = topDescriptions(state, TxType.INCOME)
    val flows = accountFlow(state)
    val empty = state.transactions.none { it.date.startsWith(state.activeMonth) }
    val delta = if (previous.expense > 0) ((stats.expense - previous.expense) / previous.expense * 100).toInt() else null

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(formatMonthLabel(state.activeMonth), fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("Charts for every expense and income category", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("◔", fontSize = 20.sp, color = Color(0xFF059669))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InsightTile("Income", formatMoney(stats.income, state.currency), Color(0xFF059669), Modifier.weight(1f))
            InsightTile("Expenses", formatMoney(stats.expense, state.currency), Color(0xFFE11D48), Modifier.weight(1f))
            InsightTile("Net", formatMoney(stats.net, state.currency), if (stats.net >= 0) Color(0xFF059669) else Color(0xFFE11D48), Modifier.weight(1f))
            InsightTile("Saved", "${stats.savingsRate}%", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
        }
        if (delta != null) {
            Text(
                "Spending is ${if (delta > 0) "$delta% higher" else "${-delta}% lower"} than ${formatMonthLabel(shiftMonth(state.activeMonth, -1))}.",
                fontSize = 11.sp,
                color = if (delta > 0) Color(0xFFE11D48) else Color(0xFF059669),
            )
        }
        if (empty) {
            CenterMessage("Nothing logged in ${formatMonthLabel(state.activeMonth)} yet. Add a transaction to see the graphs.")
        } else {
            SectionCard {
                SectionTitle("Expenses by category")
                Text(formatMoney(stats.expense, state.currency), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFFE11D48))
                if (expenses.isEmpty()) CenterMessage("No expenses this month.") else {
                    HorizontalBarChart(
                        expenses.map { it.category to it.total },
                        expenses.map { colorFromHex(VaultConstants.categoryMeta(it.category).color) },
                        Modifier.height((expenses.size * 34).dp.coerceAtLeast(80.dp)),
                    )
                    expenses.forEach {
                        Row(Modifier.fillMaxWidth()) {
                            Text(it.category, modifier = Modifier.weight(1f), fontSize = 10.sp)
                            Text("${formatMoney(it.total, state.currency)} · ${(it.share * 100).toInt()}%", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            SectionCard {
                SectionTitle("Income by source")
                Text(formatMoney(stats.income, state.currency), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669))
                if (incomes.isEmpty()) CenterMessage("No income this month.") else {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        DonutChart(
                            incomes.map { it.category to it.total },
                            incomes.map { colorFromHex(VaultConstants.categoryMeta(it.category, TxType.INCOME).color) },
                            Modifier.width(110.dp).height(110.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            incomes.forEach {
                                Row(Modifier.fillMaxWidth()) {
                                    Text(it.category, modifier = Modifier.weight(1f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${(it.share * 100).toInt()}%", fontSize = 10.sp)
                                }
                            }
                        }
                    }
                }
            }
            SectionCard {
                SectionTitle("Daily flow")
                PairedBarChart(daily.map { it.income }, daily.map { it.expense }, daily.map { it.day.toString() }, Modifier.height(130.dp))
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionCard(Modifier.width(220.dp)) {
                    SectionTitle("Biggest expenses")
                    if (topExpenses.isEmpty()) CenterMessage("No expenses.") else topExpenses.forEach {
                        Row(Modifier.fillMaxWidth()) {
                            Text(it.label, modifier = Modifier.weight(1f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${formatMoney(it.total, state.currency)} ×${it.count}", fontSize = 10.sp)
                        }
                    }
                }
                SectionCard(Modifier.width(220.dp)) {
                    SectionTitle("Biggest income")
                    if (topIncome.isEmpty()) CenterMessage("No income.") else topIncome.forEach {
                        Row(Modifier.fillMaxWidth()) {
                            Text(it.label, modifier = Modifier.weight(1f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(formatMoney(it.total, state.currency), fontSize = 10.sp, color = Color(0xFF059669))
                        }
                    }
                }
            }
            SectionCard {
                SectionTitle("Accounts this month")
                flows.forEach { flow ->
                    val sum = flow.inflow + flow.outflow
                    Row(Modifier.fillMaxWidth()) {
                        Text(flow.account.name, modifier = Modifier.weight(1f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("+${formatMoney(flow.inflow, state.currency)} · −${formatMoney(flow.outflow, state.currency)}", fontSize = 10.sp)
                    }
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(99.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                        Row(Modifier.fillMaxWidth()) {
                            Box(Modifier.weight(if (sum > 0) (flow.inflow / sum).toFloat() else 0f).height(6.dp).background(Color(0xFF10B981)))
                            Box(Modifier.weight(1f).height(6.dp).background(Color(0xFFF43F5E)))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InsightTile(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp)) {
        Text(label.uppercase(), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

fun showNativeToast(message: String) {
    // Bridge for sheet validation errors. The host activity's toast is used for success messages.
    android.widget.Toast.makeText(com.vaulty.app.AppContextHolder.context, message, android.widget.Toast.LENGTH_SHORT).show()
}
