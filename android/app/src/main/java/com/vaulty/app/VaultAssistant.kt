package com.vaulty.app

import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.round

/** Navigation targets produced by assistant commands (mirrors the web app's ViewName / PlanTab). */
enum class AssistantView(val value: String) {
    OVERVIEW("overview"),
    TRANSACTIONS("transactions"),
    ACCOUNTS("accounts"),
    PLAN("plan"),
}

enum class AssistantPlanTab(val value: String) {
    BUDGETS("budgets"),
    GOALS("goals"),
    RECURRING("recurring"),
}

/** Partial settings change produced by an assistant command. Null means "leave unchanged". */
data class SettingsPatch(
    val theme: AppTheme? = null,
    val notificationsEnabled: Boolean? = null,
    val voiceReplies: Boolean? = null,
    val reminderHour: Int? = null,
    val currency: Currency? = null,
    val activeMonth: String? = null,
)

/** Side effects the UI still needs to perform (navigation, sheets, or simply showing the reply). */
sealed interface AssistantAction {
    data class LogTransaction(val transaction: Transaction) : AssistantAction
    data class SaveBudget(val budget: Budget) : AssistantAction
    data class ContributeGoal(val goalId: String, val delta: Double) : AssistantAction
    data class DeleteTransaction(val id: String) : AssistantAction
    data class UpdateSettings(val patch: SettingsPatch) : AssistantAction
    data class Navigate(val view: AssistantView, val planTab: AssistantPlanTab? = null) : AssistantAction
    data object ShowInsights : AssistantAction
    data object Help : AssistantAction
    data object Answer : AssistantAction
}

/**
 * Result of a command. When [state] is non-null it already contains the change, so a Compose
 * repository can persist it directly; [action] describes the side effect (if any) for the UI.
 */
data class AssistantResult(
    val reply: String,
    val state: VaultState? = null,
    val action: AssistantAction? = null,
)

val ASSISTANT_SUGGESTIONS: Map<AssistantLanguage, List<String>> = mapOf(
    AssistantLanguage.EN to listOf(
        "Spent 250 on groceries",
        "Deposit 5000 salary into main bank",
        "How much is left for groceries?",
        "Transfer 1000 from bank to savings",
        "Set groceries budget to 6000",
        "Add 500 to my emergency fund",
        "Show insights",
        "What can you do?",
    ),
    AssistantLanguage.AR to listOf(
        "صرفت ٢٥٠ على البقالة",
        "إيداع ٥٠٠٠ راتب في البنك",
        "فاضل كام في ميزانية البقالة؟",
        "حول ١٠٠٠ من البنك للتوفير",
        "حدد ميزانية البقالة ٦٠٠٠",
        "ضيف ٥٠٠ لهدف الطوارئ",
        "افتح التحليلات",
        "مساعدة",
    ),
)

fun assistantSuggestions(language: AssistantLanguage): List<String> =
    ASSISTANT_SUGGESTIONS[language] ?: ASSISTANT_SUGGESTIONS.getValue(AssistantLanguage.EN)

fun assistantHelp(language: AssistantLanguage = AssistantLanguage.EN): String = if (language == AssistantLanguage.AR) {
    listOf(
        "أقدر أسجل فلوس وأغير Vaulty. جرب:",
        "• \"صرفت ٢٥٠ على البقالة\" — مصروف",
        "• \"إيداع ٥٠٠٠ راتب في البنك\" — دخل",
        "• \"حول ١٠٠٠ من البنك للتوفير\"",
        "• \"حدد ميزانية البقالة ٦٠٠٠\"",
        "• \"ضيف ٥٠٠ لهدف الطوارئ\"",
        "• \"فاضل كام في ميزانية البقالة؟\"",
        "• \"الوضع الليلي\"، \"استخدم الدولار\"، \"الشهر الجاي\"، \"افتح التحليلات\"",
    ).joinToString("\n")
} else {
    listOf(
        "I can log money and change Vaulty. Try:",
        "• \"Spent 250 on groceries\" — adds an expense",
        "• \"Deposit 5000 salary into main bank\" — adds income",
        "• \"Transfer 1000 from bank to savings\"",
        "• \"Set groceries budget to 6000\"",
        "• \"Add 500 to my emergency fund\"",
        "• \"How much is left for groceries?\"",
        "• \"Dark mode\", \"Use dollars\", \"Next month\", \"Open insights\"",
    ).joinToString("\n")
}

/**
 * Native port of planCommand(): turns a spoken/typed sentence into a reply, an already-applied
 * state, and any UI side effect. Arabic letters in the raw input force Arabic replies; otherwise
 * [preferredLanguage] (the stored assistant language) is used.
 */
fun handleAssistantCommand(
    raw: String,
    state: VaultState,
    preferredLanguage: AssistantLanguage = state.assistantLanguage,
): AssistantResult {
    val language = if (raw.any { it.code in 0x0600..0x06FF }) AssistantLanguage.AR else preferredLanguage
    val text = normalize(raw)
    val lex = lexical(raw)

    fun t(english: String, arabic: String): String = if (language == AssistantLanguage.AR) arabic else english
    fun money(value: Double): String = formatMoney(value, state.currency)
    fun settings(patch: SettingsPatch, reply: String): AssistantResult =
        AssistantResult(reply, applySettingsPatch(state, patch), AssistantAction.UpdateSettings(patch))

    val stats = monthStats(state, state.activeMonth)
    val amount = parseAmount(text)
    val monthLabel = if (language == AssistantLanguage.AR) monthLabelAr(state.activeMonth) else formatMonthLabel(state.activeMonth)
    fun catName(id: String): String = if (language == AssistantLanguage.AR) (CATEGORY_LABELS_AR[id] ?: id) else id
    val asksAQuestion = has(text, K.questionWords) || has(text, K.leftWords)

    if (text.isEmpty()) {
        return AssistantResult(
            t(
                "I did not hear anything. Tap the microphone and try again.",
                "مسمعتش حاجة. دوس على المايك وجرب تاني.",
            ),
            action = AssistantAction.Answer,
        )
    }

    if (has(text, K.help)) {
        return AssistantResult(assistantHelp(language), action = AssistantAction.Help)
    }

    if (K.greeting.any { word -> text == word || text.startsWith("$word ") }) {
        val total = netWorth(state)
        return AssistantResult(
            t(
                "Hi. You have ${money(total)} across ${state.accounts.size} accounts. Ask me to log something or say \"help\".",
                "أهلاً. معاك ${money(total)} في ${state.accounts.size} حسابات. اطلب مني أسجل حاجة أو قول \"مساعدة\".",
            ),
            action = AssistantAction.Answer,
        )
    }

    /* ---------- preferences ---------- */
    if (has(text, K.dark)) {
        return settings(SettingsPatch(theme = AppTheme.DARK), t("Dark mode on.", "الوضع الليلي مفعل."))
    }
    if (has(text, K.light)) {
        return settings(SettingsPatch(theme = AppTheme.LIGHT), t("Light mode on.", "الوضع النهاري مفعل."))
    }
    if (has(text, K.themeToggle)) {
        val next = if (state.theme == AppTheme.DARK) AppTheme.LIGHT else AppTheme.DARK
        return settings(
            SettingsPatch(theme = next),
            if (next == AppTheme.DARK) t("Dark mode on.", "الوضع الليلي مفعل.") else t("Light mode on.", "الوضع النهاري مفعل."),
        )
    }
    if (has(text, K.notificationsOn) && !has(text, K.notificationsOff)) {
        return settings(
            SettingsPatch(notificationsEnabled = true),
            t("Notifications on.", "الإشعارات مفعلة."),
        )
    }
    if (has(text, K.notificationsOff)) {
        return settings(
            SettingsPatch(notificationsEnabled = false),
            t("Notifications off.", "الإشعارات متوقفة."),
        )
    }
    if (has(text, K.mute)) {
        return settings(
            SettingsPatch(voiceReplies = false),
            t("Okay, I will stay quiet.", "تمام، مش هتكلم."),
        )
    }
    if (has(text, K.unmute) && amount == null) {
        return settings(
            SettingsPatch(voiceReplies = true),
            t("I will read my answers out loud.", "هقرأ الردود بصوت عالي."),
        )
    }
    val reminderMatch = REMINDER_RE.find(text)
    if (reminderMatch != null) {
        var hour = reminderMatch.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
        val suffix = reminderMatch.groupValues.getOrNull(2).orEmpty()
        if ((suffix == "pm" || suffix == "م") && hour < 12) hour += 12
        if ((suffix == "am" || suffix == "ص") && hour == 12) hour = 0
        hour = hour.coerceIn(0, 23)
        val display = hourLabel(hour).substringBefore(' ')
        val period = if (hour < 12) "AM" else "PM"
        return settings(
            SettingsPatch(notificationsEnabled = true, reminderHour = hour),
            t(
                "I will remind you at $display $period each day while Vaulty is open.",
                "هفكرك الساعة $display ${if (hour < 12) "صباحاً" else "مساءً"} كل يوم طالما Vaulty مفتوح.",
            ),
        )
    }
    if (has(text, K.currency)) {
        val entry = CURRENCY_WORDS.firstOrNull { has(text, it.first) }
        if (entry != null) {
            return settings(
                SettingsPatch(currency = entry.second),
                t(
                    "Currency set to ${entry.second.label}.",
                    "تم تغيير العملة إلى ${CURRENCY_LABELS_AR[entry.second] ?: entry.second.code}.",
                ),
            )
        }
    }

    /* ---------- month navigation ---------- */
    if (has(text, K.nextMonth) && !asksAQuestion) {
        val next = shiftMonth(state.activeMonth, 1)
        return settings(
            SettingsPatch(activeMonth = next),
            t("Showing ${formatMonthLabel(next)}.", "بعرض ${monthLabelAr(next)}."),
        )
    }
    if (has(text, K.lastMonth) && !asksAQuestion) {
        val previous = shiftMonth(state.activeMonth, -1)
        return settings(
            SettingsPatch(activeMonth = previous),
            t("Showing ${formatMonthLabel(previous)}.", "بعرض ${monthLabelAr(previous)}."),
        )
    }
    if (has(text, K.thisMonth) && !asksAQuestion) {
        return settings(
            SettingsPatch(activeMonth = todayISO().take(7)),
            t("Showing this month.", "بعرض الشهر الحالي."),
        )
    }
    val monthIndex = MONTH_NAMES.indexOfFirst { text.contains(it) }
    if (monthIndex >= 0 && has(text, K.open)) {
        val month = "%02d".format(Locale.US, monthIndex + 1)
        val target = "${state.activeMonth.take(4)}-$month"
        return settings(
            SettingsPatch(activeMonth = target),
            t("Showing ${formatMonthLabel(target)}.", "بعرض ${monthLabelAr(target)}."),
        )
    }

    /* ---------- insights ---------- */
    if (has(text, K.insights)) {
        return AssistantResult(t("Opening insights.", "بفتح التحليلات."), action = AssistantAction.ShowInsights)
    }

    /* ---------- navigation ---------- */
    if (has(text, K.open)) {
        if (has(text, K.recurring)) {
            return AssistantResult(
                t("Opening recurring bills.", "بفتح الفواتير المتكررة."),
                action = AssistantAction.Navigate(AssistantView.PLAN, AssistantPlanTab.RECURRING),
            )
        }
        if (has(text, K.goals)) {
            return AssistantResult(
                t("Opening savings goals.", "بفتح أهداف التوفير."),
                action = AssistantAction.Navigate(AssistantView.PLAN, AssistantPlanTab.GOALS),
            )
        }
        if (has(text, K.budgets)) {
            return AssistantResult(
                t("Opening budgets.", "بفتح الميزانيات."),
                action = AssistantAction.Navigate(AssistantView.PLAN, AssistantPlanTab.BUDGETS),
            )
        }
        if (has(text, K.accounts)) {
            return AssistantResult(
                t("Opening accounts.", "بفتح الحسابات."),
                action = AssistantAction.Navigate(AssistantView.ACCOUNTS),
            )
        }
        if (has(text, K.transactions)) {
            return AssistantResult(
                t("Opening activity.", "بفتح الحركات."),
                action = AssistantAction.Navigate(AssistantView.TRANSACTIONS),
            )
        }
        if (has(text, K.home)) {
            return AssistantResult(
                t("Opening home.", "بفتح الرئيسية."),
                action = AssistantAction.Navigate(AssistantView.OVERVIEW),
            )
        }
    }

    /* ---------- questions ---------- */
    if (has(text, K.balance) && amount == null) {
        val total = netWorth(state)
        return AssistantResult(
            t(
                "Your net worth is ${money(total)} across ${state.accounts.size} accounts.",
                "صافي ثروتك ${money(total)} في ${state.accounts.size} حسابات.",
            ),
            action = AssistantAction.Answer,
        )
    }
    if (has(text, K.savingsRate)) {
        // VaultCalc truncates the percentage; the web assistant rounds it (Math.round).
        val rate = if (stats.income > 0) round((stats.net / stats.income) * 100).toInt() else 0
        return AssistantResult(
            t(
                "You saved $rate% of your income in $monthLabel.",
                "وفرت $rate% من دخلك في $monthLabel.",
            ),
            action = AssistantAction.Answer,
        )
    }
    if (has(text, K.leftWords) || (has(text, K.budgets) && has(text, K.questionWords))) {
        val category = findCategory(text, "expense")
        if (category != null) {
            val budget = state.budgets.firstOrNull { it.category == category.id }
            val spent = stats.byCategory[category.id] ?: 0.0
            if (budget == null) {
                return AssistantResult(
                    t(
                        "You have no budget for ${catName(category.id)}. Spent so far: ${money(spent)}.",
                        "مفيش ميزانية لـ ${catName(category.id)}. صرفت لحد دلوقتي ${money(spent)}.",
                    ),
                    action = AssistantAction.Answer,
                )
            }
            val left = budget.limit - spent
            return AssistantResult(
                if (left >= 0) {
                    t(
                        "${money(left)} left for ${catName(category.id)} — ${money(spent)} spent of ${money(budget.limit)}.",
                        "فاضل ${money(left)} لميزانية ${catName(category.id)} — صرفت ${money(spent)} من ${money(budget.limit)}.",
                    )
                } else {
                    t(
                        "You are ${money(abs(left))} over the ${catName(category.id)} budget (${money(spent)} of ${money(budget.limit)}).",
                        "تجاوزت ميزانية ${catName(category.id)} بـ ${money(abs(left))} (صرفت ${money(spent)} من ${money(budget.limit)}).",
                    )
                },
                action = AssistantAction.Answer,
            )
        }
        val totalLimit = state.budgets.sumOf { it.limit }
        val totalSpent = state.budgets.sumOf { stats.byCategory[it.category] ?: 0.0 }
        val left = totalLimit - totalSpent
        return AssistantResult(
            when {
                totalLimit == 0.0 -> t(
                    "You have no budgets yet. Say \"set groceries budget to 6000\".",
                    "مفيش ميزانيات لسه. قول \"حدد ميزانية البقالة ٦٠٠٠\".",
                )
                left >= 0 -> t(
                    "${money(left)} left across your budgets. ${money(totalSpent)} spent of ${money(totalLimit)}.",
                    "فاضل ${money(left)} في كل الميزانيات. صرفت ${money(totalSpent)} من ${money(totalLimit)}.",
                )
                else -> t(
                    "You are ${money(abs(left))} over budget this month.",
                    "تجاوزت الميزانيات بـ ${money(abs(left))} الشهر ده.",
                )
            },
            action = AssistantAction.Answer,
        )
    }
    if (has(text, K.spentWords) && has(text, K.questionWords)) {
        val category = findCategory(text, "expense")
        return AssistantResult(
            if (category != null) {
                val spent = stats.byCategory[category.id] ?: 0.0
                t(
                    "You spent ${money(spent)} on ${catName(category.id)} in $monthLabel.",
                    "صرفت ${money(spent)} على ${catName(category.id)} في $monthLabel.",
                )
            } else {
                t(
                    "You spent ${money(stats.expense)} in $monthLabel and earned ${money(stats.income)}.",
                    "صرفت ${money(stats.expense)} في $monthLabel وكسبت ${money(stats.income)}.",
                )
            },
            action = AssistantAction.Answer,
        )
    }
    if (has(text, K.incomeWords) && has(text, K.questionWords)) {
        return AssistantResult(
            t(
                "Income in $monthLabel is ${money(stats.income)}.",
                "دخلك في $monthLabel هو ${money(stats.income)}.",
            ),
            action = AssistantAction.Answer,
        )
    }

    /* ---------- savings goals ---------- */
    val goal = findGoal(text, state.goals)
    if (goal != null && amount != null && has(text, K.goalVerbs)) {
        val after = maxOf(0.0, goal.current + amount)
        val pct = if (goal.target > 0) minOf(100, round((after / goal.target) * 100).toInt()) else 0
        return AssistantResult(
            t(
                "Added ${money(amount)} to \"${goal.name}\". You are at $pct% of the target.",
                "ضفت ${money(amount)} لهدف \"${goal.name}\". وصلت $pct% من الهدف.",
            ),
            applyGoalContribution(state, goal.id, amount),
            AssistantAction.ContributeGoal(goal.id, amount),
        )
    }

    /* ---------- budgets ---------- */
    if (has(text, K.budgets) && amount != null && has(text, K.setVerbs)) {
        val category = findCategory(text, "expense") ?: VaultConstants.EXPENSE_CATEGORIES.first { it.id == "Other Expense" }
        val existing = state.budgets.firstOrNull { it.category == category.id }
        val budget = Budget(id = existing?.id ?: makeId("bud"), category = category.id, limit = amount)
        return AssistantResult(
            if (existing != null) {
                t(
                    "Updated the ${catName(category.id)} budget to ${money(amount)}.",
                    "تم تحديث ميزانية ${catName(category.id)} إلى ${money(amount)}.",
                )
            } else {
                t(
                    "Set a ${money(amount)} budget for ${catName(category.id)}.",
                    "تم تحديد ميزانية ${money(amount)} لـ ${catName(category.id)}.",
                )
            },
            applyBudget(state, budget),
            AssistantAction.SaveBudget(budget),
        )
    }

    /* ---------- money movement ---------- */
    if (state.accounts.isEmpty()) {
        return AssistantResult(
            t(
                "Create an account first, then I can log money for you.",
                "اعمل حساب الأول وبعدين أقدر أسجل لك.",
            ),
            action = AssistantAction.Answer,
        )
    }

    if (has(text, K.transfer) && amount != null) {
        val toMarker = if (language == AssistantLanguage.AR) AR_TO_MARKER else EN_TO_MARKER
        val fromMarker = if (language == AssistantLanguage.AR) AR_FROM_MARKER else EN_FROM_MARKER
        val toPart = text.split(toMarker).getOrNull(1).orEmpty()
        val fromPart = text.split(fromMarker).getOrNull(1).orEmpty().split(toMarker).getOrNull(0).orEmpty()
        val to = findAccount(toPart, state.accounts) ?: findAccount(text, state.accounts)
        val from = findAccount(fromPart, state.accounts, to?.id)
            ?: state.accounts.firstOrNull { it.id != to?.id }

        if (to != null && from != null && to.id != from.id) {
            val transaction = Transaction(
                id = makeId("tx"),
                type = TxType.TRANSFER,
                amount = amount,
                date = commandDate(text, state.activeMonth),
                accountId = from.id,
                toAccountId = to.id,
                category = "Transfer",
                description = "${if (language == AssistantLanguage.AR) "تحويل إلى" else "Transfer to"} ${to.name}",
                notes = "Logged by assistant",
            )
            return AssistantResult(
                t(
                    "Moved ${money(amount)} from ${from.name} to ${to.name}.",
                    "حولت ${money(amount)} من ${from.name} إلى ${to.name}.",
                ),
                state.copy(transactions = state.transactions + transaction),
                AssistantAction.LogTransaction(transaction),
            )
        }
        return AssistantResult(
            t(
                "Tell me the amount and both accounts, like \"transfer 1000 from bank to savings\".",
                "قولي المبلغ والحسابين، زي \"حول ١٠٠٠ من البنك للتوفير\".",
            ),
            action = AssistantAction.Answer,
        )
    }

    val hasDestination = if (language == AssistantLanguage.AR) {
        has(text, kw("الي", "الى", "في"))
    } else {
        hasWord(text, "to") || hasWord(text, "into") || hasWord(text, "in")
    }
    val hasFor = if (language == AssistantLanguage.AR) {
        has(text, kw("علي", "في"))
    } else {
        hasWord(text, "for") || hasWord(text, "on") || hasWord(text, "at")
    }

    val isIncome = has(text, K.incomeVerbs) || (has(text, K.addVerbs) && hasDestination && !hasFor)
    val isExpense = has(text, K.expenseVerbs) || (has(text, K.addVerbs) && hasFor)

    if (amount != null && (isIncome || isExpense)) {
        val type = if (isIncome && !isExpense) "income" else "expense"
        val category = findCategory(text, type)

        val target = if (type == "income") {
            if (language == AssistantLanguage.AR) {
                text.split(AR_DESTINATION_MARKER).getOrNull(1).orEmpty()
            } else {
                text.split(EN_DESTINATION_MARKER).drop(1).joinToString(" ")
            }
        } else {
            val marker = if (language == AssistantLanguage.AR) AR_FROM_MARKER else EN_FROM_MARKER
            text.split(marker).getOrNull(1).orEmpty()
        }
        val account = findAccount(target, state.accounts) ?: findAccount(text, state.accounts)
        val resolved = account ?: state.accounts[0]

        val categoryId = category?.id ?: (if (type == "income") "Other Income" else "Other Expense")
        val description = if (type == "income") {
            catName(categoryId)
        } else {
            describeFrom(lex, state.accounts, catName(categoryId))
        }
        val transaction = Transaction(
            id = makeId("tx"),
            type = if (type == "income") TxType.INCOME else TxType.EXPENSE,
            amount = amount,
            date = commandDate(text, state.activeMonth),
            accountId = resolved.id,
            toAccountId = null,
            category = categoryId,
            description = description,
            notes = "Logged by assistant",
        )
        return AssistantResult(
            if (type == "income") {
                val suffix = if (category != null) " under ${catName(category.id)}" else ""
                t(
                    "Added ${money(amount)} of income to ${resolved.name}$suffix.",
                    "ضفت دخل ${money(amount)} لحساب ${resolved.name}$suffix.",
                )
            } else {
                val suffix = if (category != null) " under ${catName(category.id)}" else ""
                t(
                    "Logged ${money(amount)} for $description from ${resolved.name}$suffix.",
                    "سجلت مصروف ${money(amount)} لـ $description من ${resolved.name}$suffix.",
                )
            },
            state.copy(transactions = state.transactions + transaction),
            AssistantAction.LogTransaction(transaction),
        )
    }

    /* ---------- undo ---------- */
    if (has(text, K.undo)) {
        // Sort by date then id descending (as in the web app) and take the first row.
        val latest = state.transactions.maxWithOrNull(compareBy<Transaction> { it.date }.thenBy { it.id })
        if (latest == null) {
            return AssistantResult(
                t("There is nothing to undo.", "مفيش حاجة أمسحها."),
                action = AssistantAction.Answer,
            )
        }
        val label = latest.description.ifBlank { latest.category }
        return AssistantResult(
            t(
                "Deleted \"$label\" (${money(latest.amount)}).",
                "مسحت \"$label\" (${money(latest.amount)}).",
            ),
            state.copy(transactions = state.transactions.filterNot { it.id == latest.id }),
            AssistantAction.DeleteTransaction(latest.id),
        )
    }

    return AssistantResult(
        t(
            "I did not catch that. Try \"spent 250 on groceries\", \"deposit 5000 salary into main bank\", or say \"help\".",
            "مفهمتش. جرب \"صرفت ٢٥٠ على البقالة\" أو \"إيداع ٥٠٠٠ راتب في البنك\" أو قول \"مساعدة\".",
        ),
        action = AssistantAction.Answer,
    )
}

/* ------------------------------------------------------------------ */
/* Text normalisation and parsing                                      */
/* ------------------------------------------------------------------ */

private val DIACRITICS_RE = Regex("[\\u064B-\\u065F\\u0670\\u0640]")
private val ARABIC_INDIC_RE = Regex("[\\u0660-\\u0669]")
private val PERSIAN_INDIC_RE = Regex("[\\u06F0-\\u06F9]")
private val HAMZA_RE = Regex("[أإآ]")
private val DISALLOWED_RE = Regex("[^a-z0-9\\u0600-\\u06FF\\s.']")
private val WHITESPACE_RE = Regex("\\s+")
private val AMOUNT_RE = Regex("(\\d[\\d,]*(?:\\.\\d+)?)")
private val AMOUNT_TAIL_RE = Regex("^(k\\b|thousand\\b|الف(?=\\s|$)|الاف(?=\\s|$))")
private val REMINDER_RE = Regex("(?:remind me (?:at|on)|فكرني|نبهني)\\s*(?:الساعه|الساعة|at)?\\s*(\\d{1,2})(?::\\d{2})?\\s*(am|pm|ص|م)?")
private val AR_TO_MARKER = Regex("\\s(?:الي|الى|ل)")
private val EN_TO_MARKER = Regex("\\s(?:to|into)\\s")
private val AR_FROM_MARKER = Regex("\\sمن\\s")
private val EN_FROM_MARKER = Regex("\\sfrom\\s")
private val AR_DESTINATION_MARKER = Regex("\\s(?:في|الي|الى)\\s?")
private val EN_DESTINATION_MARKER = Regex("\\b(?:to|into|in)\\b")

/** Lower-case, strip diacritics, fold Arabic letter variants, convert digits. */
private fun normalize(raw: String): String {
    var text = raw.lowercase(Locale.ROOT)
    text = DIACRITICS_RE.replace(text, "")
    text = ARABIC_INDIC_RE.replace(text) { match -> (match.value[0].code - 0x0660).toString() }
    text = PERSIAN_INDIC_RE.replace(text) { match -> (match.value[0].code - 0x06F0).toString() }
    text = HAMZA_RE.replace(text, "ا").replace('ى', 'ي').replace('ة', 'ه')
    text = DISALLOWED_RE.replace(text, " ")
    return WHITESPACE_RE.replace(text, " ").trim()
}

/** Light normalisation that keeps Arabic spelling intact, for stored text. */
private fun lexical(raw: String): String {
    var text = raw.lowercase(Locale.ROOT)
    text = DIACRITICS_RE.replace(text, "")
    text = ARABIC_INDIC_RE.replace(text) { match -> (match.value[0].code - 0x0660).toString() }
    text = PERSIAN_INDIC_RE.replace(text) { match -> (match.value[0].code - 0x06F0).toString() }
    text = DISALLOWED_RE.replace(text, " ")
    return WHITESPACE_RE.replace(text, " ").trim()
}

private fun kw(vararg words: String): List<String> = words.map(::normalize)

private fun has(text: String, words: List<String>): Boolean = words.any { it.isNotEmpty() && text.contains(it) }

private fun hasWord(text: String, word: String): Boolean {
    if (word.isEmpty()) return false
    return Regex("(^|\\s)" + Regex.escape(word) + "(\\s|$)").containsMatchIn(text)
}

private val AR_NUMBER_WORDS: List<Pair<String, Double>> = listOf(
    normalize("ألفين") to 2000.0,
    normalize("ميتين") to 200.0,
    normalize("خمسمية") to 500.0,
    normalize("مية") to 100.0,
    normalize("ألف") to 1000.0,
)

private fun parseAmount(text: String): Double? {
    val match = AMOUNT_RE.find(text)
    if (match != null) {
        val value = match.value.replace(",", "").toDoubleOrNull() ?: return null
        if (!value.isFinite()) return null
        val tail = if (match.range.last + 1 < text.length) {
            text.substring(match.range.last + 1).trimStart()
        } else {
            ""
        }
        if (AMOUNT_TAIL_RE.containsMatchIn(tail)) return value * 1000.0
        return value
    }
    for (entry in AR_NUMBER_WORDS) {
        if (hasWord(text, entry.first)) return entry.second
    }
    return null
}

/* ------------------------------------------------------------------ */
/* Keyword dictionaries                                                */
/* ------------------------------------------------------------------ */

private object K {
    val help = kw("help", "what can you do", "commands", "مساعدة", "مساعده", "ماذا تفعل", "ايش تعمل", "الأوامر")
    val greeting = kw("hi", "hey", "hello", "yo", "اهلا", "سلام", "السلام عليكم", "هاي")
    val dark = kw("dark mode", "dark theme", "night mode", "الوضع الليلي", "الوضع الداكن", "ليلي", "دارك")
    val light = kw("light mode", "light theme", "day mode", "الوضع النهاري", "نهاري", "لايت")
    val themeToggle = kw("toggle theme", "switch theme", "بدل الوضع", "غير الوضع")
    val notificationsOn = kw(
        "turn on notifications", "enable notifications", "notifications on",
        "فعل الاشعارات", "شغل الاشعارات", "اشعارات",
    )
    val notificationsOff = kw("turn off notifications", "disable notifications", "اقفل الاشعارات", "اطفي الاشعارات", "بلاش اشعارات")
    val mute = kw("stop talking", "mute voice", "be quiet", "اسكت", "بلاش كلام", "مش تتكلم")
    val unmute = kw("speak replies", "read it out", "unmute voice", "اتكلم", "قول بصوت", "اقرا الرد")
    val remind = kw("remind me", "فكرني", "نبهني", "ذكرني")
    val currency = kw("currency", "use", "switch", "العملة", "عملة", "حول العملة", "استخدم", "خلي")
    val nextMonth = kw("next month", "الشهر الجاي", "الشهر القادم", "الشهر الجى")
    val lastMonth = kw("last month", "previous month", "الشهر اللي فات", "الشهر الماضي", "الشهر السابق")
    val thisMonth = kw("this month", "current month", "هذا الشهر", "الشهر ده", "الشهر الحالي")
    val open = kw("open", "show", "go to", "take me to", "افتح", "اعرض", "روح", "وديني")
    val accounts = kw("accounts", "wallets", "balances", "الحسابات", "المحافظ", "الارصدة")
    val transactions = kw("activity", "transactions", "history", "الحركات", "المعاملات", "العمليات", "السجل")
    val home = kw("home", "dashboard", "overview", "الرئيسية", "اللوحة")
    val budgets = kw("budgets", "budget", "الميزانيات", "الميزانية", "ميزانية")
    val goals = kw("goals", "savings goal", "الاهداف", "هدف", "اهداف")
    val recurring = kw("bills", "recurring", "subscriptions", "الفواتير", "المتكررة", "الاشتراكات")
    val insights = kw(
        "insights", "analytics", "charts", "reports", "diagrams",
        "التحليلات", "التقارير", "الرسوم", "الاحصائيات", "الرسوم البيانية",
    )
    val balance = kw(
        "balance", "net worth", "how much money", "total money", "how much do i have",
        "رصيد", "الرصيد", "صافي", "فلوسي", "معايا",
    )
    val savingsRate = kw("savings rate", "how much am i saving", "نسبة التوفير", "بوفر كام")
    val spentWords = kw("spend", "spent", "spending", "expenses", "صرفت", "صرف", "مصروف", "انفقت", "المصروف")
    val incomeWords = kw("income", "earn", "earned", "دخل", "كسبت", "الدخل")
    val leftWords = kw("left", "remaining", "فاضل", "باقي", "متبقي")
    val questionWords = kw("how much", "what", "did", "total", "كم", "بكام", "ايه", "كام")
    val transfer = kw("transfer", "move", "حول", "تحويل", "انقل")
    val incomeVerbs = kw(
        "deposit", "income", "salary", "received", "receive", "earned", "got paid", "paycheck",
        "ايداع", "اودع", "اودعت", "راتب", "قبضت", "استلمت", "وصلني", "دخل",
    )
    val expenseVerbs = kw(
        "spent", "spend", "paid", "pay", "bought", "buy", "expense", "cost",
        "صرفت", "صرف", "دفعت", "دفع", "اشتريت", "اشتري", "مصروف", "كلفني",
    )
    val addVerbs = kw("add", "put", "log", "ضيف", "اضف", "سجل")
    val goalVerbs = kw("add", "put", "save", "contribute", "ضيف", "اضف", "حوش", "ادخر", "ساهم")
    val setVerbs = kw("set", "change", "update", "make", "create", "raise", "lower", "حدد", "عدل", "غير", "اعمل", "خلي")
    val yesterday = kw("yesterday", "امبارح", "امس")
    val lastWeek = kw("last week", "الاسبوع اللي فات", "الاسبوع الماضي")
    val undo = kw("undo", "delete last", "remove last", "تراجع", "امسح اخر", "الغاء")
    val forWords = kw("for", "on", "at", "علي", "على", "في")
    val fromWords = kw("from", "من")
}

private val ACCOUNT_HINTS: List<Pair<List<String>, List<String>>> = listOf(
    kw("توفير", "سيفينج", "savings") to listOf("savings"),
    kw("كاش", "نقدي", "محفظة", "cash") to listOf("cash"),
    kw("كريدت", "بطاقة", "فيزا", "credit") to listOf("credit"),
    kw("بنك", "جاري", "checking") to listOf("checking"),
)

private val GENERIC_ACCOUNT_WORDS: Set<String> = setOf(
    "account", "bank", "wallet", "card", "my", "main", "everyday", "rewards",
    "الحساب", "حساب", "محفظه", "المحفظه", "بنك", "البنك", "بطاقه", "كارت",
).map(::normalize).toSet()

private val CATEGORY_ALIASES: Map<String, List<String>> = mapOf(
    "Groceries" to listOf("grocer", "supermarket", "food shop", "بقال", "سوبر ماركت", "خضار", "فاكه", "سوق"),
    "Dining Out" to listOf("dining", "restaurant", "cafe", "coffee", "lunch", "dinner", "takeout", "مطعم", "مطاعم", "قهوه", "كافيه", "غدا", "عشا", "فطار", "اكل"),
    "Transport" to listOf("transport", "fuel", "petrol", "gas", "uber", "taxi", "ride", "commute", "مواصلات", "بنزين", "تاكسي", "اوبر", "عربيه", "صيانه"),
    "Housing" to listOf("housing", "rent", "mortgage", "ايجار", "سكن", "شققه", "شقه"),
    "Utilities" to listOf("utilities", "electric", "water", "internet", "phone bill", "bills", "فواتير", "كهربا", "مياه", "نت", "انترنت", "تليفون"),
    "Healthcare" to listOf("healthcare", "health", "pharmacy", "doctor", "dentist", "gym", "صحه", "دوا", "دكتور", "اسنان", "جيم"),
    "Shopping" to listOf("shopping", "clothes", "jacket", "shoes", "amazon", "تسوق", "هدوم", "ملابس", "جزمه", "شراء"),
    "Entertainment" to listOf("entertainment", "movie", "cinema", "streaming", "netflix", "game", "ترفيه", "سينما", "فيلم", "نتفليكس", "العاب"),
    "Education" to listOf("education", "course", "book", "school", "tuition", "تعليم", "كورس", "كتاب", "مدرسه", "جامعه"),
    "Salary" to listOf("salary", "paycheck", "wage", "payroll", "راتب", "مرتب"),
    "Freelance" to listOf("freelance", "client", "consult", "فريلانس", "عمل حر", "عميل"),
    "Investments" to listOf("investment", "dividend", "stock", "استثمار", "اسهم"),
    "Gift / Bonus" to listOf("gift", "bonus", "present", "هديه", "مكافاه", "بونص"),
).mapValues { (_, aliases) -> aliases.map(::normalize) }

private val CURRENCY_WORDS: List<Pair<List<String>, Currency>> = listOf(
    kw("egyptian pound", "egypt pound", "egp", "جنيه", "جنية") to Currency.EGP,
    kw("saudi riyal", "riyal", "sar", "ريال") to Currency.SAR,
    kw("dollar", "usd", "buck", "دولار") to Currency.USD,
    kw("euro", "eur", "يورو") to Currency.EUR,
    kw("dirham", "aed", "درهم") to Currency.AED,
    kw("pound", "sterling", "gbp", "باوند", "استرليني") to Currency.GBP,
)

private val MONTH_NAMES = listOf(
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)

private val AR_MONTHS = listOf(
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
)

private val CATEGORY_LABELS_AR: Map<String, String> = mapOf(
    "Housing" to "السكن",
    "Groceries" to "البقالة",
    "Dining Out" to "المطاعم",
    "Transport" to "المواصلات",
    "Utilities" to "الفواتير",
    "Healthcare" to "الصحة",
    "Shopping" to "التسوق",
    "Entertainment" to "الترفيه",
    "Education" to "التعليم",
    "Other Expense" to "مصروفات أخرى",
    "Salary" to "الراتب",
    "Freelance" to "الفريلانس",
    "Investments" to "الاستثمار",
    "Gift / Bonus" to "الهدايا والمكافآت",
    "Other Income" to "دخل آخر",
    "Transfer" to "التحويل",
)

private val CURRENCY_LABELS_AR: Map<Currency, String> = mapOf(
    Currency.EGP to "الجنيه المصري",
    Currency.USD to "الدولار",
    Currency.EUR to "اليورو",
    Currency.GBP to "الجنيه الإسترليني",
    Currency.SAR to "الريال السعودي",
    Currency.AED to "الدرهم",
)

/* ------------------------------------------------------------------ */
/* Entity matching                                                     */
/* ------------------------------------------------------------------ */

private fun findAccount(text: String, accounts: List<Account>, excludeId: String? = null): Account? {
    if (text.isBlank() || accounts.isEmpty()) return null
    val pool = accounts.filter { it.id != excludeId }
    val direct = pool.firstOrNull { text.contains(normalize(it.name)) }
    if (direct != null) return direct

    var found: Account? = null
    var bestScore = 0
    pool.forEach { account ->
        val tokens = normalize(account.name).split(' ').filter { it.length >= 3 && !GENERIC_ACCOUNT_WORDS.contains(it) }
        val score = tokens.count { text.contains(it) }
        if (score > bestScore) {
            bestScore = score
            found = account
        }
    }
    if (found != null) return found

    val hint = ACCOUNT_HINTS.firstOrNull { has(text, it.first) }
    if (hint != null) {
        val match = pool.firstOrNull { hint.second.contains(it.type.value) }
        if (match != null) return match
    }
    return null
}

private fun findCategory(text: String, type: String): CategoryMeta? {
    val pool = if (type == "income") VaultConstants.INCOME_CATEGORIES else VaultConstants.EXPENSE_CATEGORIES
    val direct = pool.firstOrNull { text.contains(normalize(it.id)) }
    if (direct != null) return direct
    for (category in pool) {
        val aliases = CATEGORY_ALIASES[category.id].orEmpty()
        if (aliases.any { text.contains(it) }) return category
    }
    return null
}

private val GOAL_IGNORED_TOKENS: Set<String> = listOf("fund", "months", "goal", "savings", "هدف", "صندوق", "الهدف").map(::normalize).toSet()

private fun findGoal(text: String, goals: List<Goal>): Goal? {
    val direct = goals.firstOrNull { text.contains(normalize(it.name)) }
    if (direct != null) return direct

    var found: Goal? = null
    var bestScore = 0
    goals.forEach { goal ->
        val tokens = normalize(goal.name).split(' ').filter { it.length >= 3 && !GOAL_IGNORED_TOKENS.contains(it) }
        val score = tokens.count { text.contains(it) }
        if (score > bestScore) {
            bestScore = score
            found = goal
        }
    }
    if (found != null) return found

    val hints: List<Pair<List<String>, String>> = listOf(
        kw("طوارئ", "emergency") to "emergency",
        kw("سفر", "اجازة", "vacation") to "vacation",
        kw("لابتوب", "ماك", "macbook") to "macbook",
    )
    for (hint in hints) {
        if (!has(text, hint.first)) continue
        val goal = goals.firstOrNull { normalize(it.name).contains(hint.second) }
        if (goal != null) return goal
    }
    return null
}

private val DESC_MATCH_RE = Regex("(?:\\bon\\b|\\bfor\\b|\\bat\\b|علي|على|في)\\s+([a-z0-9\\u0600-\\u06FF][a-z0-9\\u0600-\\u06FF .'-]{1,40})")
private val DESC_TIME_RE = Regex("\\b(today|yesterday|please|thanks)\\b")
private val DESC_AR_TIME_RE = Regex("النهارده|امبارح|لو سمحت")
private val DESC_TAIL_RE = Regex("\\b(from|in|into|to)\\b.*$")
private val DESC_AR_TAIL_RE = Regex("\\s(?:من|الي).*$")
private val DESC_SUFFIX_RE = Regex("\\s(?:ب|ل|ك)(?=\\s|$)")
private val DESC_NUMBER_RE = Regex("\\b\\d[\\d,]*(?:\\.\\d+)?\\b")
private val DESC_VERB_RE = Regex("\\b(spent|spend|paid|pay|bought|buy|add|added|log|logged|cost|costs|please|today|yesterday|the|a|an|on|for|at|from|to|in|into|my)\\b")
private val DESC_AR_VERB_RE = Regex("(^|\\s)(صرفت|صرف|دفعت|دفع|اشتريت|اشتري|ضيف|اضف|سجل|مصروف|النهارده|امبارح|علي|على)(?=\\s|$)")
private val DESC_AR_ACCOUNT_RE = Regex("\\s(?:من|في)\\s(?:البنك|بنك|الحساب|حساب|المحفظة|محفظة|الكاش|كاش)(?=\\s|$)")
private val ONLY_PUNCTUATION_RE = Regex("^[\\d,.\\s]+$")

private fun replaceFirstLiteral(text: String, old: String, new: String): String {
    if (old.isEmpty()) return new + text
    val index = text.indexOf(old)
    return if (index < 0) text else text.substring(0, index) + new + text.substring(index + old.length)
}

private fun titleCase(value: String): String = value
    .split(' ')
    .filter { it.isNotEmpty() }
    .joinToString(" ") { it[0].uppercaseChar().toString() + it.substring(1) }

private fun describeFrom(text: String, accounts: List<Account>, fallback: String): String {
    var working = text
    accounts.forEach { account ->
        working = replaceFirstLiteral(working, normalize(account.name), " ")
    }

    for (match in DESC_MATCH_RE.findAll(working)) {
        var cleaned = match.groupValues.getOrNull(1).orEmpty()
        cleaned = DESC_TIME_RE.replace(cleaned, "")
        cleaned = DESC_AR_TIME_RE.replace(cleaned, "")
        cleaned = DESC_TAIL_RE.replace(cleaned, "")
        cleaned = DESC_AR_TAIL_RE.replace(cleaned, "")
        cleaned = DESC_SUFFIX_RE.replace(cleaned, " ").trim()
        if (cleaned.isEmpty() || ONLY_PUNCTUATION_RE.containsMatchIn(cleaned)) continue
        return titleCase(cleaned)
    }

    val leftover = DESC_NUMBER_RE.replace(working, " ")
        .let { DESC_VERB_RE.replace(it, " ") }
        .let { DESC_AR_VERB_RE.replace(it, " ") }
        .let { DESC_AR_ACCOUNT_RE.replace(it, " ") }
        .let { DESC_SUFFIX_RE.replace(it, " ") }
        .let { WHITESPACE_RE.replace(it, " ").trim() }
    return if (leftover.isNotEmpty()) titleCase(leftover) else fallback
}

private fun commandDate(text: String, activeMonth: String): String {
    val date = Calendar.getInstance()
    if (has(text, K.yesterday)) {
        date.add(Calendar.DAY_OF_MONTH, -1)
    } else if (has(text, K.lastWeek)) {
        date.add(Calendar.DAY_OF_MONTH, -7)
    }
    val iso = "%04d-%02d-%02d".format(
        Locale.US,
        date.get(Calendar.YEAR),
        date.get(Calendar.MONTH) + 1,
        date.get(Calendar.DAY_OF_MONTH),
    )
    return if (iso.startsWith(activeMonth)) iso else dateInMonth(activeMonth, 1)
}

private fun monthLabelAr(ym: String): String {
    val parts = ym.split('-')
    val year = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val month = (parts.getOrNull(1)?.toIntOrNull() ?: 1).coerceIn(1, 12)
    return "${AR_MONTHS[month - 1]} $year"
}

/* ------------------------------------------------------------------ */
/* Applying results                                                    */
/* ------------------------------------------------------------------ */

private fun applySettingsPatch(state: VaultState, patch: SettingsPatch): VaultState = state.copy(
    theme = patch.theme ?: state.theme,
    notificationsEnabled = patch.notificationsEnabled ?: state.notificationsEnabled,
    voiceReplies = patch.voiceReplies ?: state.voiceReplies,
    reminderHour = patch.reminderHour ?: state.reminderHour,
    currency = patch.currency ?: state.currency,
    activeMonth = patch.activeMonth ?: state.activeMonth,
)

private fun applyBudget(state: VaultState, budget: Budget): VaultState {
    val budgets = state.budgets.toMutableList()
    val index = budgets.indexOfFirst { it.id == budget.id || it.category == budget.category }
    if (index >= 0) budgets[index] = budget else budgets.add(budget)
    return state.copy(budgets = budgets)
}

private fun applyGoalContribution(state: VaultState, goalId: String, delta: Double): VaultState = state.copy(
    goals = state.goals.map { goal ->
        if (goal.id == goalId) goal.copy(current = maxOf(0.0, goal.current + delta)) else goal
    },
)
