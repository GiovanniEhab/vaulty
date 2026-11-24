package com.vaulty.app

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class ChatMessage(val id: String, val role: String, val text: String)

@Composable
fun VaultAssistantPanel(
    store: VaultStore,
    onCommand: (String, (String) -> Unit) -> Unit,
) {
    val activity = AppContextHolder.activity as? MainActivity
    val language = store.state.value.assistantLanguage
    val arabic = language == AssistantLanguage.AR
    val hello = if (arabic) {
        "أهلاً. قولي أسجل إيه أو أغيّر إيه — مثلاً \"صرفت ٢٥٠ على البقالة\"."
    } else {
        "Hi. Tell me what to add, move or change — for example \"spent 250 on groceries\"."
    }
    var messages by remember { mutableStateOf(listOf(ChatMessage("hello", "assistant", hello))) }
    var draft by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val transcriptScroll = rememberScrollState()

    fun push(role: String, text: String) {
        messages = messages + ChatMessage("$role-${System.currentTimeMillis()}-${Math.random()}", role, text)
    }

    fun submit(input: String) {
        val command = input.trim()
        if (command.isBlank()) return
        push("user", command)
        onCommand(command) { reply -> push("assistant", reply) }
    }

    LaunchedEffect(messages.size) {
        if (transcriptScroll.maxValue > 0) transcriptScroll.animateScrollTo(transcriptScroll.maxValue)
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (arabic) "اتكلم أو اكتب بالعربي أو الإنجليزي" else "Speak or type in English or Arabic",
                Modifier.weight(1f),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)).padding(3.dp)) {
                Button(
                    onClick = { store.updateSettings(assistantLanguage = AssistantLanguage.EN) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (language == AssistantLanguage.EN) Color(0xFF059669) else Color.Transparent,
                        contentColor = if (language == AssistantLanguage.EN) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                ) { Text("English", fontSize = 10.sp) }
                Button(
                    onClick = { store.updateSettings(assistantLanguage = AssistantLanguage.AR) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (language == AssistantLanguage.AR) Color(0xFF059669) else Color.Transparent,
                        contentColor = if (language == AssistantLanguage.AR) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                ) { Text("العربية", fontSize = 10.sp) }
            }
        }

        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 280.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
                .verticalScroll(transcriptScroll)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            messages.forEach { message ->
                val isUser = message.role == "user"
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (isUser) Color(0xFF059669) else MaterialTheme.colorScheme.surface)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Text(
                            message.text,
                            fontSize = 12.sp,
                            color = if (isUser) Color.White else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Button(
                onClick = {
                    if (activity == null) {
                        error = "Voice input needs an Android activity. Type your command instead."
                    } else {
                        error = null
                        activity.requestVoiceInput { transcript -> submit(transcript) }
                    }
                },
                Modifier.size(58.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
            ) { Text(iconGlyph("mic"), fontSize = 22.sp) }
            Text("Tap and speak", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (error != null) {
            Text(error.orEmpty(), fontSize = 10.sp, color = Color(0xFFB45309))
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = {
                    Text(if (arabic) "اكتب أمر، مثال: \"صرفت ٤٠ على القهوة\"" else "Type a command, e.g. \"spent 40 on coffee\"")
                },
                modifier = Modifier.weight(1f),
                singleLine = true,
            )
            Button(onClick = { val value = draft; draft = ""; submit(value) }, Modifier.padding(start = 8.dp)) {
                Text("➤")
            }
        }

        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            assistantSuggestions(language).take(5).forEach { suggestion ->
                Button(onClick = { submit(suggestion) }) { Text(suggestion, fontSize = 10.sp) }
            }
        }

        VaultSwitchRow(
            title = if (arabic) "قول الردود بصوت" else "Speak replies",
            subtitle = if (arabic) "يقرأ الإجابات بصوت عالي" else "Read answers out loud",
            checked = store.state.value.voiceReplies,
            onCheckedChange = { store.updateSettings(voiceReplies = it) },
        )

        TextButton(onClick = { submit(if (arabic) "مساعدة" else "help") }) {
            Text(if (arabic) "أقول إيه؟" else "What can I say?", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
