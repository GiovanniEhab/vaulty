package com.vaulty.app

import org.json.JSONArray
import org.json.JSONObject

private fun optString(obj: JSONObject, key: String, fallback: String = ""): String =
    if (obj.isNull(key)) fallback else obj.optString(key, fallback)

private fun optDouble(obj: JSONObject, key: String, fallback: Double = 0.0): Double =
    obj.optDouble(key, fallback).let { if (it.isNaN() || it.isInfinite()) fallback else it }

private fun optInt(obj: JSONObject, key: String, fallback: Int = 0): Int = obj.optInt(key, fallback)

private fun optBool(obj: JSONObject, key: String, fallback: Boolean = false): Boolean =
    if (obj.isNull(key)) fallback else obj.optBoolean(key, fallback)

private fun JSONObject.stringArray(key: String): List<String> {
    val array = optJSONArray(key) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optString(it, null) }
}

private fun parseAccount(obj: JSONObject): Account = Account(
    id = optString(obj, "id"),
    name = optString(obj, "name"),
    type = AccountType.from(optString(obj, "type")),
    initialBalance = optDouble(obj, "initialBalance"),
    color = optString(obj, "color", "#059669"),
)

private fun parseTransaction(obj: JSONObject): Transaction = Transaction(
    id = optString(obj, "id"),
    type = TxType.from(optString(obj, "type")),
    amount = optDouble(obj, "amount"),
    date = optString(obj, "date"),
    accountId = optString(obj, "accountId"),
    toAccountId = if (obj.isNull("toAccountId")) null else optString(obj, "toAccountId").ifBlank { null },
    category = optString(obj, "category"),
    description = optString(obj, "description"),
    notes = optString(obj, "notes"),
)

private fun parseBudget(obj: JSONObject): Budget = Budget(
    id = optString(obj, "id"),
    category = optString(obj, "category"),
    limit = optDouble(obj, "limit"),
)

private fun parseGoal(obj: JSONObject): Goal = Goal(
    id = optString(obj, "id"),
    name = optString(obj, "name"),
    target = optDouble(obj, "target"),
    current = optDouble(obj, "current"),
    deadline = optString(obj, "deadline"),
    color = optString(obj, "color", "#10b981"),
)

private fun parseRecurring(obj: JSONObject): Recurring = Recurring(
    id = optString(obj, "id"),
    title = optString(obj, "title"),
    type = if (optString(obj, "type") == "income") TxType.INCOME else TxType.EXPENSE,
    amount = optDouble(obj, "amount"),
    dayOfMonth = optInt(obj, "dayOfMonth", 1).coerceIn(1, 28),
    accountId = optString(obj, "accountId"),
    category = optString(obj, "category"),
    lastLoggedMonth = optString(obj, "lastLoggedMonth"),
)

/** Narrow imported JSON/Firestore data into a usable state, matching normalizeState() in the web app. */
fun normalizeState(obj: JSONObject, fallback: VaultState): VaultState? {
    val accounts = obj.optJSONArray("accounts") ?: return null
    val transactions = obj.optJSONArray("transactions") ?: return null
    val budgets = obj.optJSONArray("budgets") ?: JSONArray()
    val goals = obj.optJSONArray("goals") ?: JSONArray()
    val recurring = obj.optJSONArray("recurring") ?: JSONArray()

    fun <T> list(array: JSONArray, parser: (JSONObject) -> T): List<T> =
        (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(parser) }

    val widgetStrings = obj.stringArray("widgetIds")
    val widgets = if (widgetStrings.isNotEmpty()) {
        widgetStrings.mapNotNull(WidgetId::from)
    } else {
        fallback.widgetIds
    }

    return VaultState(
        accounts = list(accounts, ::parseAccount),
        transactions = list(transactions, ::parseTransaction),
        budgets = list(budgets, ::parseBudget),
        goals = list(goals, ::parseGoal),
        recurring = list(recurring, ::parseRecurring),
        currency = Currency.from(if (obj.isNull("currency")) null else optString(obj, "currency")),
        theme = AppTheme.from(optString(obj, "theme")),
        activeMonth = optString(obj, "activeMonth", fallback.activeMonth).ifBlank { fallback.activeMonth },
        isDemoData = optBool(obj, "isDemoData"),
        demoBannerDismissed = optBool(obj, "demoBannerDismissed"),
        voiceReplies = if (obj.has("voiceReplies")) optBool(obj, "voiceReplies", true) else true,
        notificationsEnabled = optBool(obj, "notificationsEnabled"),
        reminderHour = if (obj.has("reminderHour")) optInt(obj, "reminderHour", 20) else 20,
        widgetIds = widgets,
        assistantLanguage = AssistantLanguage.from(if (obj.isNull("assistantLanguage")) null else optString(obj, "assistantLanguage")),
        autoUpdate = if (obj.has("autoUpdate")) optBool(obj, "autoUpdate", true) else true,
    )
}

fun parseVaultState(json: String?, fallback: VaultState): VaultState? {
    if (json.isNullOrBlank()) return null
    return try {
        normalizeState(JSONObject(json), fallback)
    } catch (_: Exception) {
        null
    }
}

private fun accountJson(a: Account) = JSONObject().apply {
    put("id", a.id)
    put("name", a.name)
    put("type", a.type.value)
    put("initialBalance", a.initialBalance)
    put("color", a.color)
}

private fun transactionJson(t: Transaction) = JSONObject().apply {
    put("id", t.id)
    put("type", t.type.value)
    put("amount", t.amount)
    put("date", t.date)
    put("accountId", t.accountId)
    put("toAccountId", if (t.toAccountId == null) JSONObject.NULL else t.toAccountId)
    put("category", t.category)
    put("description", t.description)
    put("notes", t.notes)
}

private fun budgetJson(b: Budget) = JSONObject().apply {
    put("id", b.id)
    put("category", b.category)
    put("limit", b.limit)
}

private fun goalJson(g: Goal) = JSONObject().apply {
    put("id", g.id)
    put("name", g.name)
    put("target", g.target)
    put("current", g.current)
    put("deadline", g.deadline)
    put("color", g.color)
}

private fun recurringJson(r: Recurring) = JSONObject().apply {
    put("id", r.id)
    put("title", r.title)
    put("type", r.type.value)
    put("amount", r.amount)
    put("dayOfMonth", r.dayOfMonth)
    put("accountId", r.accountId)
    put("category", r.category)
    put("lastLoggedMonth", r.lastLoggedMonth)
}

private fun <T> jsonArray(items: List<T>, writer: (T) -> JSONObject): JSONArray {
    val array = JSONArray()
    items.forEach { array.put(writer(it)) }
    return array
}

fun VaultState.toJsonObject(): JSONObject = JSONObject().apply {
    put("accounts", jsonArray(accounts, ::accountJson))
    put("transactions", jsonArray(transactions, ::transactionJson))
    put("budgets", jsonArray(budgets, ::budgetJson))
    put("goals", jsonArray(goals, ::goalJson))
    put("recurring", jsonArray(recurring, ::recurringJson))
    put("currency", currency.code)
    put("theme", theme.value)
    put("activeMonth", activeMonth)
    put("isDemoData", isDemoData)
    put("demoBannerDismissed", demoBannerDismissed)
    put("voiceReplies", voiceReplies)
    put("notificationsEnabled", notificationsEnabled)
    put("reminderHour", reminderHour)
    put("widgetIds", JSONArray(widgetIds.map { it.value }))
    put("assistantLanguage", assistantLanguage.value)
    put("autoUpdate", autoUpdate)
}

fun VaultState.toJsonString(): String = toJsonObject().toString()
