package com.vaulty.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Calendar
import kotlin.coroutines.resume
import kotlin.math.round

enum class NotificationPermissionStatus { GRANTED, DENIED, PROMPT, UNSUPPORTED }

/**
 * Native port of src/lib/notifications.ts.
 *
 * Scheduled alarms are owned by this object: every managed id lives in
 * [MANAGED_MIN_ID]..[MANAGED_MAX_ID] and is cancelled/rebuilt by [scheduleAll].
 * One-off budget/test alerts use stable hashed ids outside that range and are
 * deliberately not cancelled by [cancelAll].
 */
object VaultNotifications {
    const val CHANNEL_ID = "vaulty-alerts"
    const val MANAGED_MIN_ID = 900000
    const val MANAGED_MAX_ID = 999999
    const val DAILY_NOTIFICATION_ID = 900001
    const val BILL_ID_BASE = 910000

    const val ACTION_DAILY = "com.vaulty.app.NOTIFY_DAILY"
    const val ACTION_BILL = "com.vaulty.app.NOTIFY_BILL"
    const val ACTION_ALERT = "com.vaulty.app.NOTIFY_ALERT"

    const val EXTRA_ID = "vaulty.notification.id"
    const val EXTRA_HOUR = "vaulty.notification.hour"
    const val EXTRA_DAY = "vaulty.notification.day"
    const val EXTRA_TITLE = "vaulty.notification.title"
    const val EXTRA_BODY = "vaulty.notification.body"
    const val EXTRA_REPEAT_MONTHLY = "vaulty.notification.repeatMonthly"

    private const val CHANNEL_NAME = "Vaulty alerts"
    private const val CHANNEL_DESCRIPTION = "Budget alerts, bill reminders and your daily check-in"
    private val SMALL_ICON_COLOR = 0xFF059669.toInt()
    private const val MAX_PER_PASS = 3
    private const val MAX_RECURRING = 500
    private const val ONE_OFF_DELAY_MS = 750L

    private const val PREFS_NAME = "vaulty_notifications_v1"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_REMINDER_HOUR = "reminderHour"
    private const val KEY_NOTIFICATION_REQUESTED = "notificationRequested"
    private const val KEY_EXACT_REQUESTED = "exactAlarmRequested"
    private const val KEY_SCHEDULED_IDS = "scheduledIds"
    private const val KEY_ALERT_LOG = "alertLog"
    private const val KEY_ALERT_MONTH = "__month"

    private const val SPEC_KIND = "kind"
    private const val SPEC_ACTION = "action"
    private const val SPEC_TRIGGER = "triggerAt"
    private const val SPEC_HOUR = "hour"
    private const val SPEC_DAY = "day"
    private const val SPEC_TITLE = "title"
    private const val SPEC_BODY = "body"
    private const val SPEC_REPEAT = "repeatMonthly"

    private const val REQUEST_POST_NOTIFICATIONS = 9002

    @Volatile
    private var pendingPermissionResult: ((Boolean) -> Unit)? = null

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
            description = CHANNEL_DESCRIPTION
            enableLights(true)
            lightColor = SMALL_ICON_COLOR
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    /** The native plugin's source of truth was NotificationManagerCompat.areNotificationsEnabled(). */
    internal fun notificationAccessGranted(context: Context): Boolean =
        NotificationManagerCompat.from(context.applicationContext).areNotificationsEnabled()

    /**
     * UX state. NotificationManagerCompat decides granted/denied; a persisted request flag
     * distinguishes "never asked" (PROMPT) from a denial the user must change in Settings.
     */
    fun status(context: Context): NotificationPermissionStatus {
        if (!notificationAccessGranted(context)) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return if (prefs(context).getBoolean(KEY_NOTIFICATION_REQUESTED, false)) {
                    NotificationPermissionStatus.DENIED
                } else {
                    NotificationPermissionStatus.PROMPT
                }
            }
            return NotificationPermissionStatus.DENIED
        }
        return NotificationPermissionStatus.GRANTED
    }

    fun requestNotificationPermission(activity: android.app.Activity, onResult: (Boolean) -> Unit) {
        createChannel(activity)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            pendingPermissionResult = onResult
            prefs(activity).edit().putBoolean(KEY_NOTIFICATION_REQUESTED, true).apply()
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_POST_NOTIFICATIONS,
            )
        } else {
            onResult(notificationAccessGranted(activity))
        }
    }

    suspend fun requestNotificationPermission(activity: android.app.Activity): Boolean =
        suspendCancellableCoroutine<Boolean> { cont ->
            requestNotificationPermission(activity) { granted ->
                if (cont.isActive) cont.resume(granted)
            }
            cont.invokeOnCancellation { pendingPermissionResult = null }
        }

    /** Call from Activity.onRequestPermissionsResult; returns true when Vaulty handled the request. */
    @Suppress("UNUSED_PARAMETER")
    fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != REQUEST_POST_NOTIFICATIONS) return false
        val callback = pendingPermissionResult
        pendingPermissionResult = null
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        callback?.invoke(granted)
        return true
    }

    fun openNotificationSettings(context: Context) {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${context.packageName}"))
        }
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            /* some OEMs do not expose notification settings */
        }
    }

    /** Exact-alarm access is separate from POST_NOTIFICATIONS and is user-revocable on 13+. */
    fun exactAlarmStatus(context: Context): NotificationPermissionStatus {
        if (Build.VERSION.SDK_INT < 31) return NotificationPermissionStatus.GRANTED
        val alarmManager = alarmManager(context) ?: return NotificationPermissionStatus.UNSUPPORTED
        if (alarmManager.canScheduleExactAlarms()) return NotificationPermissionStatus.GRANTED
        return if (Build.VERSION.SDK_INT >= 33 &&
            !prefs(context).getBoolean(KEY_EXACT_REQUESTED, false)
        ) {
            NotificationPermissionStatus.PROMPT
        } else {
            NotificationPermissionStatus.DENIED
        }
    }

    /** Opens the Android 13+ exact-alarm settings screen; re-check [exactAlarmStatus] on return. */
    fun requestExactAlarmAccess(context: Context): Boolean {
        prefs(context).edit().putBoolean(KEY_EXACT_REQUESTED, true).apply()
        if (Build.VERSION.SDK_INT >= 33) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                .setData(Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return try {
                context.startActivity(intent)
                true
            } catch (_: Exception) {
                false
            }
        }
        return exactAlarmStatus(context) == NotificationPermissionStatus.GRANTED
    }

    private fun alarmManager(context: Context): AlarmManager? =
        context.applicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    private fun canScheduleExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < 31 || alarmManager(context)?.canScheduleExactAlarms() == true

    private fun pendingIntentFlags(): Int =
        if (Build.VERSION.SDK_INT >= 31) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

    private fun alarmIntent(context: Context, id: Int, action: String): Intent =
        Intent(context.applicationContext, VaultAlarmReceiver::class.java)
            .setAction(action)
            .setPackage(context.packageName)

    private fun pendingIntentFor(context: Context, id: Int, intent: Intent): PendingIntent =
        PendingIntent.getBroadcast(context.applicationContext, id, intent, pendingIntentFlags())

    private fun setAlarm(context: Context, id: Int, triggerAtMillis: Long, intent: Intent): Boolean {
        val manager = alarmManager(context) ?: return false
        return try {
            val pending = pendingIntentFor(context, id, intent)
            if (canScheduleExact(context)) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
            } else {
                // No exact-alarm access: still deliver, with Android's normal drift.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun specKey(id: Int): String = "spec_$id"

    private fun rememberSpec(context: Context, id: Int, spec: JSONObject) {
        if (id !in MANAGED_MIN_ID..MANAGED_MAX_ID) return
        val preferences = prefs(context)
        val ids = preferences.getStringSet(KEY_SCHEDULED_IDS, HashSet<String>())?.toHashSet() ?: HashSet()
        ids.add(id.toString())
        preferences.edit()
            .putStringSet(KEY_SCHEDULED_IDS, ids)
            .putString(specKey(id), spec.toString())
            .commit()
    }

    private fun readSpec(context: Context, id: Int): JSONObject? = try {
        prefs(context).getString(specKey(id), null)?.let { JSONObject(it) }
    } catch (_: Exception) {
        null
    }

    internal fun forgetSpecForReceiver(context: Context, id: Int) = forgetSpec(context, id)

    private fun forgetSpec(context: Context, id: Int) {
        val preferences = prefs(context)
        val ids = preferences.getStringSet(KEY_SCHEDULED_IDS, HashSet<String>())?.toHashSet() ?: HashSet()
        ids.remove(id.toString())
        preferences.edit()
            .putStringSet(KEY_SCHEDULED_IDS, ids)
            .remove(specKey(id))
            .commit()
    }

    private fun nextDailyTrigger(hour: Int, nowMillis: Long): Long {
        val calendar = Calendar.getInstance().apply {
            timeInMillis = nowMillis
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (calendar.timeInMillis <= nowMillis) calendar.add(Calendar.DAY_OF_MONTH, 1)
        return calendar.timeInMillis
    }

    /** day is clamped to 1..28 by callers, so month rollover cannot overflow. */
    private fun nextMonthlyTrigger(day: Int, nowMillis: Long, forceNextMonth: Boolean): Long {
        val calendar = Calendar.getInstance().apply {
            timeInMillis = nowMillis
            set(Calendar.HOUR_OF_DAY, 9)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            set(Calendar.DAY_OF_MONTH, day)
        }
        if (forceNextMonth || calendar.timeInMillis <= nowMillis) calendar.add(Calendar.MONTH, 1)
        return calendar.timeInMillis
    }

    internal fun rescheduleDaily(context: Context, hour: Int, nowMillis: Long = System.currentTimeMillis()) {
        val safeHour = hour.coerceIn(0, 23)
        val triggerAt = nextDailyTrigger(safeHour, nowMillis)
        val intent = alarmIntent(context, DAILY_NOTIFICATION_ID, ACTION_DAILY)
            .putExtra(EXTRA_ID, DAILY_NOTIFICATION_ID)
            .putExtra(EXTRA_HOUR, safeHour)
        if (setAlarm(context, DAILY_NOTIFICATION_ID, triggerAt, intent)) {
            rememberSpec(
                context,
                DAILY_NOTIFICATION_ID,
                JSONObject()
                    .put(SPEC_KIND, "daily")
                    .put(SPEC_ACTION, ACTION_DAILY)
                    .put(SPEC_HOUR, safeHour)
                    .put(SPEC_TRIGGER, triggerAt),
            )
        }
    }

    internal fun rescheduleBill(
        context: Context,
        id: Int,
        day: Int,
        title: String,
        body: String,
        repeatMonthly: Boolean,
        forceNextMonth: Boolean,
        nowMillis: Long = System.currentTimeMillis(),
    ) {
        if (id !in MANAGED_MIN_ID..MANAGED_MAX_ID) return
        val safeDay = day.coerceIn(1, 28)
        val triggerAt = nextMonthlyTrigger(safeDay, nowMillis, forceNextMonth)
        val intent = alarmIntent(context, id, ACTION_BILL)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_DAY, safeDay)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
            .putExtra(EXTRA_REPEAT_MONTHLY, repeatMonthly)
        if (setAlarm(context, id, triggerAt, intent)) {
            rememberSpec(
                context,
                id,
                JSONObject()
                    .put(SPEC_KIND, "bill")
                    .put(SPEC_ACTION, ACTION_BILL)
                    .put(SPEC_DAY, safeDay)
                    .put(SPEC_TITLE, title)
                    .put(SPEC_BODY, body)
                    .put(SPEC_REPEAT, repeatMonthly)
                    .put(SPEC_TRIGGER, triggerAt),
            )
        }
    }

    private fun scheduleOneOff(
        context: Context,
        id: Int,
        title: String,
        body: String,
        triggerAt: Long,
    ): Boolean {
        val intent = alarmIntent(context, id, ACTION_ALERT)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
        return setAlarm(context, id, triggerAt, intent)
    }

    /** Stable positive id outside the managed 900000..999999 range (FNV-1a, as in notifications.ts). */
    private fun hashId(tag: String): Int {
        var hash = 2166136261L
        for (index in tag.indices) {
            hash = ((hash xor tag[index].code.toLong()) * 16777619L) and 0xFFFFFFFFL
        }
        return (hash % 800000L).toInt() + 100
    }

    private fun sendOneOff(context: Context, tag: String, title: String, body: String): Boolean {
        if (!notificationAccessGranted(context)) return false
        return try {
            scheduleOneOff(
                context,
                hashId(tag),
                title,
                body,
                System.currentTimeMillis() + ONE_OFF_DELAY_MS,
            )
        } catch (_: Exception) {
            false
        }
    }

    fun sendTestNotification(context: Context): Boolean {
        val app = context.applicationContext
        createChannel(app)
        if (!notificationAccessGranted(app)) return false
        return sendOneOff(
            app,
            "test",
            "Vaulty notifications are working",
            "This is a test alert. Budget, bill and daily check-in reminders will arrive like this.",
        )
    }

    /** Cancel every managed alarm/notification; one-off hashed alerts are left alone. */
    fun cancelAll(context: Context) {
        val app = context.applicationContext
        val preferences = prefs(app)
        val manager = alarmManager(app)
        val notifier = NotificationManagerCompat.from(app)
        val ids = preferences.getStringSet(KEY_SCHEDULED_IDS, HashSet<String>()).orEmpty()
        ids.forEach { rawId ->
            val id = rawId.toIntOrNull() ?: return@forEach
            if (id !in MANAGED_MIN_ID..MANAGED_MAX_ID) return@forEach
            val action = readSpec(app, id)?.optString(SPEC_ACTION)?.takeIf { it.isNotBlank() } ?: ACTION_DAILY
            try {
                manager?.cancel(pendingIntentFor(app, id, alarmIntent(app, id, action)))
            } catch (_: Exception) {
                /* already cancelled */
            }
            try {
                notifier.cancel(id)
            } catch (_: Exception) {
                /* nothing posted */
            }
            preferences.edit().remove(specKey(id)).commit()
        }
        preferences.edit().remove(KEY_SCHEDULED_IDS).commit()
    }

    /** Rebuild the native schedule; cancel + schedule keeps the operation idempotent. */
    fun scheduleAll(context: Context, state: VaultState) {
        val app = context.applicationContext
        createChannel(app)
        cancelAll(app)

        if (!state.notificationsEnabled || status(app) != NotificationPermissionStatus.GRANTED) {
            prefs(app).edit().putBoolean(KEY_ENABLED, false).apply()
            return
        }

        val hour = round(state.reminderHour.toDouble()).toInt().coerceIn(0, 23)
        val nowMillis = System.currentTimeMillis()
        val currentMonth = currentMonth()

        prefs(app).edit()
            .putBoolean(KEY_ENABLED, true)
            .putInt(KEY_REMINDER_HOUR, hour)
            .apply()

        rescheduleDaily(app, hour, nowMillis)

        state.recurring.take(MAX_RECURRING).forEachIndexed { index, item ->
            val id = BILL_ID_BASE + index
            val day = round(item.dayOfMonth.toDouble()).toInt().coerceIn(1, 28)
            val isIncome = item.type == TxType.INCOME
            val title = if (isIncome) "Income expected" else "Bill due"
            val verb = if (isIncome) "is expected" else "is due"
            val body = "${item.title} (${formatMoney(item.amount, state.currency)}) $verb. Open Vaulty to log it."
            val isLogged = item.lastLoggedMonth == currentMonth
            // Logged this month: one alert next month. Otherwise: monthly cron forever.
            rescheduleBill(
                context = app,
                id = id,
                day = day,
                title = title,
                body = body,
                repeatMonthly = !isLogged,
                forceNextMonth = isLogged,
                nowMillis = nowMillis,
            )
        }
    }

    internal fun deliveryAllowed(context: Context): Boolean =
        notificationAccessGranted(context) && prefs(context).getBoolean(KEY_ENABLED, false)

    internal fun deliver(context: Context, id: Int, title: String, body: String) {
        try {
            val app = context.applicationContext
            createChannel(app)
            val builder = NotificationCompat.Builder(app, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_vaulty)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
            app.packageManager.getLaunchIntentForPackage(app.packageName)?.let { launch ->
                builder.setContentIntent(
                    PendingIntent.getActivity(app, id, launch, pendingIntentFlags()),
                )
            }
            NotificationManagerCompat.from(app).notify(id, builder.build())
        } catch (_: Exception) {
            /* permission can be revoked between the check and notify() */
        }
    }

    private fun readLog(context: Context, month: String): MutableMap<String, String> {
        val raw = prefs(context).getString(KEY_ALERT_LOG, null) ?: return mutableMapOf(KEY_ALERT_MONTH to month)
        return try {
            val parsed = JSONObject(raw)
            if (parsed.optString(KEY_ALERT_MONTH) != month) {
                mutableMapOf(KEY_ALERT_MONTH to month)
            } else {
                val result = mutableMapOf<String, String>()
                val keys = parsed.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key != KEY_ALERT_MONTH) result[key] = parsed.getString(key)
                }
                result[KEY_ALERT_MONTH] = month
                result
            }
        } catch (_: Exception) {
            mutableMapOf(KEY_ALERT_MONTH to month)
        }
    }

    private fun writeLog(context: Context, log: Map<String, String>) {
        val json = JSONObject()
        log.forEach { (key, value) -> json.put(key, value) }
        prefs(context).edit().putString(KEY_ALERT_LOG, json.toString()).apply()
    }

    /** Native budget pass: daily check-in and bill reminders are handled by alarms instead. */
    suspend fun checkNotifications(context: Context, state: VaultState): Int = withContext(Dispatchers.IO) {
        if (!state.notificationsEnabled || !notificationAccessGranted(context)) return@withContext 0
        val app = context.applicationContext
        createChannel(app)
        val today = todayISO()
        val month = state.activeMonth
        val log = readLog(app, month)
        val stats = monthStats(state, month)
        val results = mutableListOf<Pair<String, Boolean>>()
        var attempts = 0

        state.budgets.forEach { budget ->
            val limit = budget.limit
            if (!limit.isFinite() || limit <= 0.0) return@forEach
            val spent = stats.byCategory[budget.category] ?: 0.0
            val ratio = spent / limit
            val key: String
            val title: String
            when {
                ratio >= 1.0 -> {
                    key = "budget:over:${budget.id}:$month"
                    title = "Budget exceeded"
                }
                ratio >= 0.9 -> {
                    key = "budget:90:${budget.id}:$month"
                    title = "Budget almost used"
                }
                else -> return@forEach
            }
            if (log[key] != null || attempts >= MAX_PER_PASS) return@forEach
            attempts += 1
            val body = "${budget.category}: ${formatMoney(spent, state.currency)} of " +
                "${formatMoney(limit, state.currency)}."
            results += key to sendOneOff(app, key, title, body)
        }

        // Only delivered alerts are remembered, so a failed send is retried next pass.
        results.forEach { (key, ok) -> if (ok) log[key] = today }
        writeLog(app, log)
        results.count { it.second }
    }

    /** Restore repeating alarms after a reboot or package replacement. */
    internal fun rescheduleFromStorage(context: Context) {
        val app = context.applicationContext
        if (!prefs(app).getBoolean(KEY_ENABLED, false)) return
        val ids = prefs(app).getStringSet(KEY_SCHEDULED_IDS, HashSet<String>()).orEmpty()
        ids.mapNotNull { it.toIntOrNull() }
            .filter { it in MANAGED_MIN_ID..MANAGED_MAX_ID }
            .forEach { id ->
                val spec = readSpec(app, id) ?: return@forEach
                when (spec.optString(SPEC_KIND)) {
                    "daily" -> rescheduleDaily(app, spec.optInt(SPEC_HOUR, 20))
                    "bill" -> {
                        val day = spec.optInt(SPEC_DAY, 1).coerceIn(1, 28)
                        val title = spec.optString(SPEC_TITLE)
                        val body = spec.optString(SPEC_BODY)
                        if (spec.optBoolean(SPEC_REPEAT, false)) {
                            rescheduleBill(app, id, day, title, body, true, false)
                        } else {
                            val triggerAt = spec.optLong(SPEC_TRIGGER, 0L)
                            if (triggerAt > System.currentTimeMillis()) {
                                val intent = alarmIntent(app, id, ACTION_BILL)
                                    .putExtra(EXTRA_ID, id)
                                    .putExtra(EXTRA_DAY, day)
                                    .putExtra(EXTRA_TITLE, title)
                                    .putExtra(EXTRA_BODY, body)
                                    .putExtra(EXTRA_REPEAT_MONTHLY, false)
                                if (setAlarm(app, id, triggerAt, intent)) rememberSpec(app, id, spec)
                            } else {
                                forgetSpec(app, id)
                            }
                        }
                    }
                    else -> forgetSpec(app, id)
                }
            }
    }
}

/** Alarm and boot receiver. Custom alarm actions use explicit components, so no intent filters are needed for them. */
class VaultAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED ->
                VaultNotifications.rescheduleFromStorage(context)

            VaultNotifications.ACTION_DAILY -> {
                if (!VaultNotifications.deliveryAllowed(context)) return
                val id = intent.getIntExtra(VaultNotifications.EXTRA_ID, VaultNotifications.DAILY_NOTIFICATION_ID)
                val hour = intent.getIntExtra(VaultNotifications.EXTRA_HOUR, 20).coerceIn(0, 23)
                VaultNotifications.deliver(
                    context,
                    id,
                    "Vaulty daily check-in",
                    "Log today's spending so your budgets stay accurate.",
                )
                VaultNotifications.rescheduleDaily(context, hour)
            }

            VaultNotifications.ACTION_BILL -> {
                if (!VaultNotifications.deliveryAllowed(context)) return
                val id = intent.getIntExtra(VaultNotifications.EXTRA_ID, -1)
                if (id !in VaultNotifications.MANAGED_MIN_ID..VaultNotifications.MANAGED_MAX_ID) return
                val day = intent.getIntExtra(VaultNotifications.EXTRA_DAY, 1).coerceIn(1, 28)
                val title = intent.getStringExtra(VaultNotifications.EXTRA_TITLE) ?: "Bill due"
                val body = intent.getStringExtra(VaultNotifications.EXTRA_BODY).orEmpty()
                val repeat = intent.getBooleanExtra(VaultNotifications.EXTRA_REPEAT_MONTHLY, false)
                VaultNotifications.deliver(context, id, title, body)
                if (repeat) {
                    VaultNotifications.rescheduleBill(
                        context = context,
                        id = id,
                        day = day,
                        title = title,
                        body = body,
                        repeatMonthly = true,
                        forceNextMonth = false,
                    )
                } else {
                    VaultNotifications.forgetSpecForReceiver(context, id)
                }
            }

            VaultNotifications.ACTION_ALERT -> {
                if (!VaultNotifications.notificationAccessGranted(context)) return
                val id = intent.getIntExtra(VaultNotifications.EXTRA_ID, -1)
                val title = intent.getStringExtra(VaultNotifications.EXTRA_TITLE).orEmpty()
                val body = intent.getStringExtra(VaultNotifications.EXTRA_BODY).orEmpty()
                VaultNotifications.deliver(context, id, title, body)
            }
        }
    }
}
