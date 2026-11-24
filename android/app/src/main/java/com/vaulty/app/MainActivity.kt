package com.vaulty.app

import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Native Vaulty entry point. The UI is Jetpack Compose; the WebView is never used for screens.
 */
class MainActivity : ComponentActivity() {
    private lateinit var repository: VaultRepository
    private lateinit var store: VaultStore
    private lateinit var updateController: VaultUpdateController

    private val viewState = mutableStateOf(AppView.OVERVIEW)
    private val planState = mutableStateOf(PlanTab.BUDGETS)
    private val sheetState = mutableStateOf<VaultSheet?>(null)

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var onSpeechResult: ((String) -> Unit)? = null
    private var pendingExport = ""
    private var pendingExportMessage = ""

    private val exportLauncher: ActivityResultLauncher<String> =
        registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
            if (uri == null) return@registerForActivityResult
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    contentResolver.openOutputStream(uri)?.use { stream ->
                        stream.write(pendingExport.toByteArray(Charsets.UTF_8))
                    }
                    withContext(Dispatchers.Main) { store.showToast(pendingExportMessage) }
                } catch (_: Exception) {
                    withContext(Dispatchers.Main) { store.showToast("Could not save the file.") }
                }
            }
        }

    private val importLauncher: ActivityResultLauncher<Array<String>> =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) return@registerForActivityResult
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val json = contentResolver.openInputStream(uri)?.use { stream ->
                        String(stream.readBytes(), Charsets.UTF_8)
                    }.orEmpty()
                    val imported = withContext(Dispatchers.Main) { store.importState(json) }
                    if (imported) withContext(Dispatchers.Main) { sheetState.value = null }
                } catch (_: Exception) {
                    withContext(Dispatchers.Main) { store.showToast("Invalid JSON backup file.") }
                }
            }
        }

    private val speechLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val transcript = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                .orEmpty()
            val callback = onSpeechResult
            onSpeechResult = null
            if (transcript.isNotBlank()) callback?.invoke(transcript)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppContextHolder.context = applicationContext
        AppContextHolder.activity = this
        repository = VaultRepository(this)
        store = VaultStore(repository)
        updateController = VaultUpdateController(this, repository, store)
        VaultNotifications.createChannel(this)
        tts = TextToSpeech(this) { status -> ttsReady = status == TextToSpeech.SUCCESS }

        setContent { VaultyScreen() }

        lifecycleScope.launch {
            store.load()
            VaultNotifications.scheduleAll(this@MainActivity, store.state.value)
            updateController.autoCheck()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::store.isInitialized) {
            lifecycleScope.launch { VaultNotifications.checkNotifications(this@MainActivity, store.state.value) }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        if (!VaultNotifications.onRequestPermissionsResult(requestCode, permissions, grantResults)) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        tts = null
        AppContextHolder.activity = null
        super.onDestroy()
    }

    fun requestVoiceInput(onResult: (String) -> Unit) {
        onSpeechResult = onResult
        val locale = if (store.state.value.assistantLanguage == AssistantLanguage.AR) "ar-EG" else "en-US"
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Tell Vaulty what to do")
        try {
            speechLauncher.launch(intent)
        } catch (_: Exception) {
            onSpeechResult = null
            store.showToast("Voice input is unavailable. Type your command instead.")
        }
    }

    private fun speak(text: String, language: AssistantLanguage) {
        if (!store.state.value.voiceReplies || !ttsReady) return
        tts?.setLanguage(if (language == AssistantLanguage.AR) Locale("ar") else Locale.US)
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vaulty-${System.currentTimeMillis()}")
    }

    private fun runAssistant(command: String, onReply: (String) -> Unit) {
        lifecycleScope.launch {
            val result = handleAssistantCommand(command, store.state.value)
            var reply = result.reply
            val patch = (result.action as? AssistantAction.UpdateSettings)?.patch
            var notificationsDenied = false

            if (patch?.notificationsEnabled == true &&
                VaultNotifications.status(this@MainActivity) != NotificationPermissionStatus.GRANTED
            ) {
                val granted = VaultNotifications.requestNotificationPermission(this@MainActivity)
                if (!granted) {
                    notificationsDenied = true
                    reply = "Notifications are blocked. Allow them for Vaulty in Android settings, then ask again."
                }
            }

            result.state?.let { store.replaceState(it) }
            if (notificationsDenied) store.updateSettings(notificationsEnabled = false)

            when (val action = result.action) {
                is AssistantAction.Navigate -> {
                    viewState.value = when (action.view) {
                        AssistantView.OVERVIEW -> AppView.OVERVIEW
                        AssistantView.TRANSACTIONS -> AppView.TRANSACTIONS
                        AssistantView.ACCOUNTS -> AppView.ACCOUNTS
                        AssistantView.PLAN -> AppView.PLAN
                    }
                    planState.value = when (action.planTab) {
                        AssistantPlanTab.BUDGETS -> PlanTab.BUDGETS
                        AssistantPlanTab.GOALS -> PlanTab.GOALS
                        AssistantPlanTab.RECURRING -> PlanTab.RECURRING
                        null -> planState.value
                    }
                }
                AssistantAction.ShowInsights -> sheetState.value = VaultSheet.Insights
                is AssistantAction.LogTransaction -> store.showToast("Transaction logged")
                is AssistantAction.SaveBudget -> store.showToast("Budget saved")
                is AssistantAction.ContributeGoal -> store.showToast("Goal updated")
                is AssistantAction.DeleteTransaction -> store.showToast("Transaction deleted")
                else -> Unit
            }

            onReply(reply)
            val shouldSpeak = patch?.voiceReplies ?: store.state.value.voiceReplies
            if (shouldSpeak) {
                val language = if (reply.any { it.code in 0x0600..0x06FF }) AssistantLanguage.AR else store.state.value.assistantLanguage
                speak(reply, language)
            }
        }
    }

    @Composable
    private fun VaultyScreen() {
        val state by store.state
        val update by updateController.state.collectAsStateWithLifecycle()
        val toast by store.toast
        val context = LocalContext.current
        val scope = rememberCoroutineScope()
        var currencyExpanded by remember { mutableStateOf(false) }

        val colors = if (state.theme == AppTheme.DARK) {
            darkColorScheme(
                primary = Color(0xFF34D399),
                onPrimary = Color(0xFF052E2B),
                secondary = Color(0xFF5EEAD4),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF059669),
                onPrimary = Color.White,
                secondary = Color(0xFF0F766E),
            )
        }

        val scheduleKey = listOf(
            state.notificationsEnabled,
            state.reminderHour,
            state.currency,
            state.recurring.map { "${it.id}:${it.dayOfMonth}:${it.lastLoggedMonth}" }.joinToString(),
        ).joinToString("|")
        LaunchedEffect(scheduleKey) {
            VaultNotifications.scheduleAll(context, store.state.value)
        }
        LaunchedEffect(state.notificationsEnabled, state.activeMonth, state.transactions, state.budgets) {
            VaultNotifications.checkNotifications(context, store.state.value)
        }
        LaunchedEffect(toast) {
            if (!toast.isNullOrBlank()) {
                showNativeToast(toast.orEmpty())
                store.consumeToast()
            }
        }

        MaterialTheme(colorScheme = colors) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxSize()) {
                    VaultHeader(
                        store = store,
                        view = viewState.value,
                        planTab = planState.value,
                        currencyExpanded = currencyExpanded,
                        onCurrencyExpanded = { currencyExpanded = it },
                        onOpenSheet = { sheetState.value = it },
                    )

                    Box(Modifier.fillMaxWidth().weight(1f)) {
                        VaultContent(
                            store = store,
                            view = viewState.value,
                            planTab = planState.value,
                            actions = ViewActions(
                                openSheet = { sheetState.value = it },
                                setView = { viewState.value = it },
                                goToPlan = { planState.value = it; viewState.value = AppView.PLAN },
                                confirm = { title, message, label, onConfirm ->
                                    sheetState.value = VaultSheet.Confirm(title, message, label, onConfirm)
                                },
                                exportCsv = { rows ->
                                    pendingExport = transactionsCsv(rows, store.state.value)
                                    pendingExportMessage = "CSV exported"
                                    exportLauncher.launch("vaulty-transactions-${store.state.value.activeMonth}.csv")
                                },
                                deleteTransaction = { store.deleteTransaction(it) },
                            ),
                            updateBanner = {
                                UpdateBanner(
                                    update = update,
                                    onInstall = { scope.launch { updateController.downloadAndInstall() } },
                                )
                            },
                        )
                    }

                    VaultBottomNav(
                        view = viewState.value,
                        onView = { viewState.value = it },
                        onAdd = {
                            if (store.state.value.accounts.isEmpty()) {
                                store.showToast("Create an account first.")
                                sheetState.value = VaultSheet.Account()
                            } else {
                                sheetState.value = VaultSheet.Tx(defaultType = TxType.EXPENSE)
                            }
                        },
                    )
                }
            }

            VaultSheetHost(
                sheet = sheetState.value,
                store = store,
                onClose = { sheetState.value = null },
                onOpenSheet = { sheetState.value = it },
                assistantContent = { VaultAssistantPanel(store, ::runAssistant) },
                dataContent = {
                    VaultDataPanel(
                        store = store,
                        update = update,
                        actions = DataPanelActions(
                            exportJson = {
                                pendingExport = store.state.value.toJsonString()
                                pendingExportMessage = "JSON backup downloaded"
                                exportLauncher.launch("vaulty-backup-${store.state.value.activeMonth}.json")
                            },
                            exportCsv = {
                                pendingExport = transactionsCsv(store.state.value)
                                pendingExportMessage = "CSV exported"
                                exportLauncher.launch("vaulty-transactions-${store.state.value.activeMonth}.csv")
                            },
                            importJson = { importLauncher.launch(arrayOf("application/json", "text/plain", "*/*")) },
                            checkUpdate = { scope.launch { updateController.checkNow() } },
                            installUpdate = { scope.launch { updateController.downloadAndInstall() } },
                            confirm = { title, message, label, onConfirm ->
                                sheetState.value = VaultSheet.Confirm(title, message, label, onConfirm)
                            },
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun VaultHeader(
    store: VaultStore,
    view: AppView,
    planTab: PlanTab,
    currencyExpanded: Boolean,
    onCurrencyExpanded: (Boolean) -> Unit,
    onOpenSheet: (VaultSheet) -> Unit,
) {
    val state by store.state
    val title = when (view) {
        AppView.OVERVIEW -> "Vaulty"
        AppView.TRANSACTIONS -> "Activity"
        AppView.ACCOUNTS -> "Accounts"
        AppView.PLAN -> when (planTab) {
            PlanTab.BUDGETS -> "Budgets"
            PlanTab.GOALS -> "Savings Goals"
            PlanTab.RECURRING -> "Recurring"
        }
    }
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 12.dp, vertical = 10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(Color(0xFF10B981), Color(0xFF0F766E)))),
                contentAlignment = Alignment.Center,
            ) { VaultIcon("wallet", tint = Color.White, size = 18.dp) }
            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("Net worth: ${formatMoney(netWorth(state), state.currency)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButtonBox(icon = "mic", tint = Color(0xFF059669)) {
                onOpenSheet(VaultSheet.Assistant)
            }
            Box {
                TextButton(onClick = { onCurrencyExpanded(true) }) { Text(state.currency.code, fontSize = 11.sp) }
                DropdownMenu(expanded = currencyExpanded, onDismissRequest = { onCurrencyExpanded(false) }) {
                    Currency.entries.forEach { currency ->
                        DropdownMenuItem(
                            text = { Text("${currency.code} · ${currency.label}") },
                            onClick = { store.setCurrency(currency); onCurrencyExpanded(false) },
                        )
                    }
                }
            }
            IconButtonBox(icon = if (state.theme == AppTheme.DARK) "sun" else "moon") {
                store.toggleTheme()
            }
            IconButtonBox(icon = "sliders-horizontal") {
                onOpenSheet(VaultSheet.Data)
            }
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = { store.shiftActiveMonth(-1) }) { VaultIcon("chevron-left", size = 16.dp) }
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                VaultIcon("calendar", size = 14.dp)
                Spacer(Modifier.width(6.dp))
                Text(formatMonthLabel(state.activeMonth), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = { store.shiftActiveMonth(1) }) { VaultIcon("chevron-right", size = 16.dp) }
        }
    }
}

@Composable
private fun IconButtonBox(icon: String, tint: Color = MaterialTheme.colorScheme.onSurfaceVariant, onClick: () -> Unit) {
    Box(
        Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { VaultIcon(icon, tint = tint, size = 16.dp) }
}

@Composable
private fun UpdateBanner(update: UpdateState, onInstall: () -> Unit) {
    if (update.status != UpdateStatus.AVAILABLE &&
        update.status != UpdateStatus.DOWNLOADING &&
        update.status != UpdateStatus.READY
    ) return
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            when (update.status) {
                UpdateStatus.DOWNLOADING -> "Downloading Vaulty ${update.info?.version.orEmpty()} — ${(update.progress * 100).toInt()}%"
                UpdateStatus.READY -> "Vaulty ${update.info?.version.orEmpty()} is ready to install"
                else -> "Vaulty ${update.info?.version.orEmpty()} is available"
            },
            Modifier.weight(1f),
            fontSize = 11.sp,
        )
        TextButton(onClick = onInstall, enabled = update.status != UpdateStatus.DOWNLOADING) {
            Text(if (update.status == UpdateStatus.DOWNLOADING) "…" else "Install", fontSize = 11.sp)
        }
    }
}

@Composable
private fun VaultBottomNav(view: AppView, onView: (AppView) -> Unit, onAdd: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavButton(AppView.OVERVIEW, view, onView)
        NavButton(AppView.TRANSACTIONS, view, onView)
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
            FloatingActionButton(
                onClick = onAdd,
                Modifier.offset(y = (-12).dp),
                containerColor = Color(0xFF059669),
                contentColor = Color.White,
            ) { Text("+", fontSize = 24.sp) }
        }
        NavButton(AppView.ACCOUNTS, view, onView)
        NavButton(AppView.PLAN, view, onView)
    }
}

@Composable
private fun RowScope.NavButton(target: AppView, current: AppView, onClick: (AppView) -> Unit) {
    val active = target == current
    val color = if (active) Color(0xFF059669) else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { onClick(target) }.padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        VaultIcon(
            when (target) {
                AppView.OVERVIEW -> "home"
                AppView.TRANSACTIONS -> "receipt"
                AppView.ACCOUNTS -> "landmark"
                AppView.PLAN -> "pie-chart"
            },
            tint = color,
            size = 18.dp,
        )
        Text(target.label, color = color, fontSize = 10.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
    }
}
