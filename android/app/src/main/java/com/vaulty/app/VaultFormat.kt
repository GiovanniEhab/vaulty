package com.vaulty.app

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

fun currentMonth(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d".format(Locale.US, c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
}

fun todayISO(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d-%02d".format(
        Locale.US,
        c.get(Calendar.YEAR),
        c.get(Calendar.MONTH) + 1,
        c.get(Calendar.DAY_OF_MONTH),
    )
}

fun shiftMonth(ym: String, delta: Int): String {
    val parts = ym.split("-")
    val year = parts.getOrNull(0)?.toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
    val month = parts.getOrNull(1)?.toIntOrNull() ?: 1
    val c = Calendar.getInstance()
    c.clear()
    c.set(year, month - 1 + delta, 1)
    return "%04d-%02d".format(Locale.US, c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
}

fun formatMonthLabel(ym: String): String {
    val parts = ym.split("-")
    val year = parts.getOrNull(0)?.toIntOrNull() ?: 1970
    val month = parts.getOrNull(1)?.toIntOrNull() ?: 1
    val c = Calendar.getInstance()
    c.clear()
    c.set(year, month - 1, 1)
    return SimpleDateFormat("MMM yyyy", Locale.US).format(c.time)
}

fun last6Months(endYm: String): List<String> = (5 downTo 0).map { shiftMonth(endYm, -it) }

fun daysInMonth(ym: String): Int {
    val parts = ym.split("-")
    val year = parts.getOrNull(0)?.toIntOrNull() ?: 1970
    val month = parts.getOrNull(1)?.toIntOrNull() ?: 1
    val c = Calendar.getInstance()
    c.clear()
    c.set(year, month, 0)
    return c.get(Calendar.DAY_OF_MONTH)
}

fun dateInMonth(ym: String, day: Int): String {
    val safe = day.coerceIn(1, daysInMonth(ym))
    return "%s-%02d".format(Locale.US, ym, safe)
}

fun formatMoney(amount: Double, currency: Currency, showSign: Boolean = false): String {
    val symbols = DecimalFormatSymbols(Locale.US)
    val pattern = if (currency.decimals == 0) "#,##0" else "#,##0.00"
    val formatter = DecimalFormat(pattern, symbols)
    val sign = when {
        amount < 0 -> "-"
        showSign && amount > 0 -> "+"
        else -> ""
    }
    return sign + currency.symbol + formatter.format(Math.abs(amount))
}

fun hourLabel(hour: Int): String {
    val safe = hour.coerceIn(0, 23)
    val suffix = if (safe < 12) "AM" else "PM"
    val display = when (safe % 12) {
        0 -> 12
        else -> safe % 12
    }
    return "$display $suffix"
}

fun isoToCalendar(iso: String): Calendar? {
    val parts = iso.split("-")
    if (parts.size != 3) return null
    val year = parts[0].toIntOrNull() ?: return null
    val month = parts[1].toIntOrNull() ?: return null
    val day = parts[2].toIntOrNull() ?: return null
    val c = Calendar.getInstance()
    c.clear()
    c.set(year, month - 1, day)
    return c
}

fun calendarToISO(c: Calendar): String = "%04d-%02d-%02d".format(
    Locale.US,
    c.get(Calendar.YEAR),
    c.get(Calendar.MONTH) + 1,
    c.get(Calendar.DAY_OF_MONTH),
)

fun shiftDayISO(iso: String, days: Int): String {
    val c = isoToCalendar(iso) ?: Calendar.getInstance()
    c.add(Calendar.DAY_OF_MONTH, days)
    return calendarToISO(c)
}

fun dateFromNow(days: Int): String {
    val c = Calendar.getInstance()
    c.add(Calendar.DAY_OF_MONTH, days)
    return calendarToISO(c)
}

fun currentDateAsLong(): Long = Date().time
