package com.vaulty.app

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch

data class DataPanelActions(
    val exportJson: () -> Unit,
    val exportCsv: () -> Unit,
    val importJson: () -> Unit,
    val checkUpdate: () -> Unit,
    val installUpdate: () -> Unit,
    val confirm: (String, String, String, () -> Unit) -> Unit,
)

@Composable
fun VaultDataPanel(store: VaultStore, update: UpdateState, actions: DataPanelActions) {
    val context = LocalContext.current
    val activity = AppContextHolder.activity as? ComponentActivity
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    var permission by remember { mutableStateOf(VaultNotifications.status(context)) }
    var exactAlarm by remember { mutableStateOf(VaultNotifications.exactAlarmStatus(context)) }

    fun refreshPermissions() {
        permission = VaultNotifications.status(context)
        exactAlarm = VaultNotifications.exactAlarmStatus(context)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshPermissions()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SectionCard {
            SectionTitle("Cloud Database")
            Text("On this device only", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text(store.sync.value.message, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "Vaulty keeps your ledger local by default. Export a JSON backup to move it between devices.",
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        SectionCard {
            SectionTitle("Backup & Restore")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = actions.exportJson, Modifier.weight(1f)) { Text("Export JSON", fontSize = 11.sp) }
                OutlinedButton(onClick = actions.importJson, Modifier.weight(1f)) { Text("Import JSON", fontSize = 11.sp) }
            }
            OutlinedButton(onClick = actions.exportCsv, Modifier.fillMaxWidth()) {
                Text("Export all transactions (CSV)", fontSize = 11.sp)
            }
        }

        SectionCard {
            SectionTitle("Notifications")
            VaultSwitchRow(
                title = "Enable notifications",
                subtitle = when (permission) {
                    NotificationPermissionStatus.DENIED -> "Blocked — allow Vaulty in Android settings."
                    NotificationPermissionStatus.GRANTED ->
                        if (store.state.value.notificationsEnabled) {
                            "Daily check-in and bill reminders are scheduled on this phone."
                        } else {
                            "Get budget alerts, bill reminders and a daily check-in."
                        }
                    else -> "Get budget alerts, bill reminders and a daily check-in."
                },
                checked = store.state.value.notificationsEnabled,
                onCheckedChange = { enabled ->
                    if (!enabled) {
                        store.updateSettings(notificationsEnabled = false)
                    } else if (activity == null) {
                        store.showToast("Notifications need an Android activity to request permission.")
                    } else {
                        scope.launch {
                            val granted = VaultNotifications.requestNotificationPermission(activity)
                            refreshPermissions()
                            store.updateSettings(notificationsEnabled = granted)
                            if (!granted) {
                                store.showToast(
                                    if (permission == NotificationPermissionStatus.DENIED) {
                                        "Notifications are blocked. Allow Vaulty in Android settings."
                                    } else {
                                        "Notifications were not allowed."
                                    },
                                )
                            }
                        }
                    }
                },
            )
            if (store.state.value.notificationsEnabled && permission == NotificationPermissionStatus.GRANTED) {
                OutlinedButton(
                    onClick = {
                        val ok = VaultNotifications.sendTestNotification(context)
                        store.showToast(
                            if (ok) "Test notification sent — check your notification shade."
                            else "Could not send a notification. Check the permission first.",
                        )
                    },
                    Modifier.fillMaxWidth(),
                ) { Text("Send test notification", fontSize = 11.sp) }
            }
            if (permission == NotificationPermissionStatus.DENIED) {
                TextButton(onClick = { VaultNotifications.openNotificationSettings(context); refreshPermissions() }) {
                    Text("Open Android notification settings", fontSize = 11.sp)
                }
            }
            if (store.state.value.notificationsEnabled &&
                permission == NotificationPermissionStatus.GRANTED &&
                exactAlarm != NotificationPermissionStatus.GRANTED
            ) {
                Column(Modifier.fillMaxWidth().padding(10.dp)) {
                    Text(
                        "Allow exact timing so reminders arrive at the hour you chose. Otherwise Android may deliver them later.",
                        fontSize = 10.sp,
                        color = Color(0xFF92400E),
                    )
                    TextButton(onClick = {
                        VaultNotifications.requestExactAlarmAccess(context)
                        refreshPermissions()
                    }) { Text("Allow exact timing", fontSize = 11.sp) }
                }
            }
            VaultSelect(
                label = "Daily check-in",
                value = store.state.value.reminderHour.toString(),
                options = (0..23).map { hour -> hour.toString() to hourLabel(hour) },
                onSelect = { store.updateSettings(reminderHour = it.toIntOrNull() ?: 20) },
                modifier = Modifier.fillMaxWidth(),
                enabled = store.state.value.notificationsEnabled,
            )
        }

        SectionCard {
            SectionTitle("App Updates")
            Text("Installed: v${update.info?.currentVersion ?: "1.3"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "Vaulty checks for a newer signed APK, verifies its SHA-256 and opens Android's installer — no GitHub browsing.",
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (update.status == UpdateStatus.DOWNLOADING) {
                VaultProgress(update.progress.coerceIn(0f, 1f), Color(0xFF059669))
                Text("Downloading ${(update.progress * 100).toInt()}%", fontSize = 10.sp)
            }
            if (update.message.isNotBlank() && update.status != UpdateStatus.UP_TO_DATE) {
                Text(
                    update.message,
                    fontSize = 11.sp,
                    color = if (update.status == UpdateStatus.ERROR) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface,
                )
            }
            if (update.status == UpdateStatus.AVAILABLE && update.info?.installAllowed == false) {
                Text(
                    "Android requires you to allow Install unknown apps for Vaulty once. Tap Install and Vaulty opens the right settings screen; your data is kept.",
                    fontSize = 10.sp,
                    color = Color(0xFFB45309),
                )
            }
            if (update.status == UpdateStatus.AVAILABLE && !update.info?.notes.isNullOrBlank()) {
                Text(update.info.notes.take(600), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = actions.checkUpdate,
                    Modifier.weight(1f),
                    enabled = update.status != UpdateStatus.CHECKING && update.status != UpdateStatus.DOWNLOADING,
                ) {
                    Text(if (update.status == UpdateStatus.CHECKING) "Checking…" else "Check now", fontSize = 11.sp)
                }
                Button(
                    onClick = actions.installUpdate,
                    Modifier.weight(1f),
                    enabled = update.status == UpdateStatus.AVAILABLE || update.status == UpdateStatus.READY,
                ) {
                    Text(
                        if (update.status == UpdateStatus.DOWNLOADING) "Downloading…"
                        else update.info?.version?.let { "Install v$it" } ?: "Update",
                        fontSize = 11.sp,
                    )
                }
            }
            VaultSwitchRow(
                title = "Auto-update",
                subtitle = "Download new versions at launch and ask Android to install",
                checked = store.state.value.autoUpdate,
                onCheckedChange = { store.updateSettings(autoUpdate = it) },
            )
        }

        SectionCard {
            SectionTitle("Workspace Reset")
            Button(
                onClick = {
                    actions.confirm(
                        "Start Fresh?",
                        "Clear all transactions, budgets and goals and start with a clean Bank Account and Cash Wallet at 0?",
                        "Clear All",
                    ) {
                        store.startFresh()
                    }
                },
                Modifier.fillMaxWidth(),
            ) { Text("Start Fresh (Clear All Data)", fontSize = 11.sp) }
            OutlinedButton(onClick = { store.restoreSample() }, Modifier.fillMaxWidth()) {
                Text("Restore Sample Data", fontSize = 11.sp)
            }
        }
    }
}
