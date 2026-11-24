package com.vaulty.app

import androidx.compose.runtime.mutableStateOf

data class SyncInfo(
    val mode: String = "local",
    val status: String = "local",
    val uid: String? = null,
    val projectId: String? = null,
    val message: String = "Saved on this device only",
)

class VaultStore(private val repository: VaultRepository) {
    val state = mutableStateOf(emptyState())
    val balances = mutableStateOf<Map<String, Double>>(emptyMap())
    val sync = mutableStateOf(SyncInfo())
    val toast = mutableStateOf<String?>(null)

    suspend fun load() {
        state.value = repository.load()
        recalculate()
    }

    fun consumeToast() {
        toast.value = null
    }

    fun showToast(message: String) {
        toast.value = message
    }

    /** Persist a state produced by the assistant engine, which already contains the mutation. */
    fun replaceState(next: VaultState) {
        state.value = next
        recalculate()
        repository.save(next)
    }

    private fun recalculate() {
        balances.value = computeBalances(state.value)
    }

    private fun update(transform: (VaultState) -> VaultState) {
        val next = transform(state.value)
        state.value = next
        recalculate()
        repository.save(next)
    }

    fun setCurrency(currency: Currency) {
        update { it.copy(currency = currency) }
        showToast("Currency: ${currency.code}")
    }

    fun setTheme(theme: AppTheme) = update { it.copy(theme = theme) }

    fun toggleTheme() = update { it.copy(theme = if (it.theme == AppTheme.DARK) AppTheme.LIGHT else AppTheme.DARK) }

    fun setActiveMonth(month: String) = update { it.copy(activeMonth = month) }

    fun shiftActiveMonth(delta: Int) = update { it.copy(activeMonth = shiftMonth(it.activeMonth, delta)) }

    fun dismissDemoBanner() = update { it.copy(demoBannerDismissed = true) }

    fun updateSettings(
        currency: Currency? = null,
        theme: AppTheme? = null,
        activeMonth: String? = null,
        isDemoData: Boolean? = null,
        demoBannerDismissed: Boolean? = null,
        voiceReplies: Boolean? = null,
        notificationsEnabled: Boolean? = null,
        reminderHour: Int? = null,
        widgetIds: List<WidgetId>? = null,
        assistantLanguage: AssistantLanguage? = null,
        autoUpdate: Boolean? = null,
    ) = update { current ->
        current.copy(
            currency = currency ?: current.currency,
            theme = theme ?: current.theme,
            activeMonth = activeMonth ?: current.activeMonth,
            isDemoData = isDemoData ?: current.isDemoData,
            demoBannerDismissed = demoBannerDismissed ?: current.demoBannerDismissed,
            voiceReplies = voiceReplies ?: current.voiceReplies,
            notificationsEnabled = notificationsEnabled ?: current.notificationsEnabled,
            reminderHour = reminderHour ?: current.reminderHour,
            widgetIds = widgetIds ?: current.widgetIds,
            assistantLanguage = assistantLanguage ?: current.assistantLanguage,
            autoUpdate = autoUpdate ?: current.autoUpdate,
        )
    }

    fun startFresh() {
        update { emptyState(it.currency, it.theme) }
        showToast("Ready for your own numbers!")
    }

    fun restoreSample() {
        update { sampleState(it.currency, it.theme) }
        showToast("Sample data restored")
    }

    fun importState(json: String): Boolean {
        val normalized = repository.parseBackup(json) ?: run {
            showToast("Invalid JSON backup file.")
            return false
        }
        state.value = normalized
        recalculate()
        repository.save(normalized)
        showToast("Backup restored")
        return true
    }

    fun saveTransaction(tx: Transaction) {
        val exists = state.value.transactions.any { it.id == tx.id }
        update { current ->
            current.copy(
                transactions = if (exists) {
                    current.transactions.map { if (it.id == tx.id) tx else it }
                } else {
                    current.transactions + tx
                },
            )
        }
        showToast(if (exists) "Transaction updated" else "Transaction saved")
    }

    fun deleteTransaction(id: String) {
        update { it.copy(transactions = it.transactions.filterNot { tx -> tx.id == id }) }
        showToast("Transaction deleted")
    }

    fun saveAccount(account: Account) {
        val exists = state.value.accounts.any { it.id == account.id }
        update { current ->
            current.copy(
                accounts = if (exists) {
                    current.accounts.map { if (it.id == account.id) account else it }
                } else {
                    current.accounts + account
                },
            )
        }
        showToast(if (exists) "Account updated" else "Account created")
    }

    fun deleteAccount(id: String) {
        update { current ->
            current.copy(
                accounts = current.accounts.filterNot { it.id == id },
                transactions = current.transactions.filterNot { tx -> tx.accountId == id || tx.toAccountId == id },
                recurring = current.recurring.filterNot { it.accountId == id },
            )
        }
        showToast("Account deleted")
    }

    fun saveBudget(budget: Budget) {
        val exists = state.value.budgets.any { it.id == budget.id }
        update { current ->
            current.copy(
                budgets = if (exists) {
                    current.budgets.map { if (it.id == budget.id) budget else it }
                } else {
                    current.budgets + budget
                },
            )
        }
        showToast(if (exists) "Budget updated" else "Budget saved")
    }

    fun deleteBudget(id: String) {
        update { it.copy(budgets = it.budgets.filterNot { it.id == id }) }
        showToast("Budget removed")
    }

    fun saveGoal(goal: Goal) {
        val exists = state.value.goals.any { it.id == goal.id }
        update { current ->
            current.copy(
                goals = if (exists) {
                    current.goals.map { if (it.id == goal.id) goal else it }
                } else {
                    current.goals + goal
                },
            )
        }
        showToast(if (exists) "Goal updated" else "Goal created")
    }

    fun deleteGoal(id: String) {
        update { it.copy(goals = it.goals.filterNot { it.id == id }) }
        showToast("Goal deleted")
    }

    fun contributeToGoal(id: String, delta: Double) {
        val goal = state.value.goals.firstOrNull { it.id == id } ?: return
        val next = goal.copy(current = maxOf(0.0, goal.current + delta))
        update { current -> current.copy(goals = current.goals.map { if (it.id == id) next else it }) }
        showToast("Updated \"${goal.name}\"")
    }

    fun saveRecurring(item: Recurring) {
        update { it.copy(recurring = it.recurring + item) }
        showToast("Recurring item added")
    }

    fun deleteRecurring(id: String) {
        update { it.copy(recurring = it.recurring.filterNot { it.id == id }) }
        showToast("Recurring item removed")
    }

    fun logRecurring(id: String) {
        val item = state.value.recurring.firstOrNull { it.id == id } ?: return
        val tx = Transaction(
            id = makeId("tx"),
            type = item.type,
            amount = item.amount,
            date = dateInMonth(state.value.activeMonth, item.dayOfMonth),
            accountId = item.accountId,
            toAccountId = null,
            category = item.category,
            description = item.title,
            notes = "Logged from recurring schedule",
        )
        val updated = item.copy(lastLoggedMonth = state.value.activeMonth)
        update { current ->
            current.copy(
                transactions = current.transactions + tx,
                recurring = current.recurring.map { if (it.id == id) updated else it },
            )
        }
        showToast("Logged \"${item.title}\"")
    }
}

fun accountName(accounts: List<Account>, id: String?): String =
    id?.let { value -> accounts.firstOrNull { it.id == value }?.name.orEmpty() }.orEmpty()

fun toCsv(headers: List<String>, rows: List<List<Any?>>): String {
    fun escape(value: Any?): String = "\"${(value ?: "").toString().replace("\"", "\"\"")}\""
    return (listOf(headers.map(::escape).joinToString(",")) +
        rows.map { row -> row.map(::escape).joinToString(",") }).joinToString("\n")
}

fun transactionsCsv(state: VaultState, onlyMonth: Boolean = false): String = transactionsCsv(
    state.transactions.filter { !onlyMonth || it.date.startsWith(state.activeMonth) },
    state,
)

fun transactionsCsv(rows: List<Transaction>, state: VaultState): String = toCsv(
    listOf("Date", "Type", "Description", "Category", "Account", "To Account", "Amount", "Currency", "Notes"),
    rows.map { tx ->
        listOf(
            tx.date,
            tx.type.value,
            tx.description,
            tx.category,
            accountName(state.accounts, tx.accountId),
            accountName(state.accounts, tx.toAccountId),
            tx.amount,
            state.currency.code,
            tx.notes,
        )
    },
)
