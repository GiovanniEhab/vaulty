package com.vaulty.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

fun colorFromHex(value: String?, fallback: String = "#059669"): Color = try {
    Color(android.graphics.Color.parseColor(value?.takeIf { it.startsWith("#") } ?: fallback))
} catch (_: Exception) {
    Color(android.graphics.Color.parseColor(fallback))
}

@Composable
fun DonutChart(
    entries: List<Pair<String, Double>>,
    colors: List<Color>,
    modifier: Modifier = Modifier,
) {
    val total = entries.sumOf { if (it.second > 0) it.second else 0.0 }
    Canvas(modifier) {
        if (total <= 0.0 || entries.isEmpty()) return@Canvas
        val stroke = minOf(size.width, size.height) * 0.24f
        val radius = (minOf(size.width, size.height) - stroke) / 2f
        var start = -90f
        entries.forEachIndexed { index, entry ->
            val value = if (entry.second > 0) entry.second else 0.0
            val sweep = (value / total * 360f).toFloat()
            if (sweep > 0f) {
                drawArc(
                    color = colors.getOrElse(index) { Color(0xFF64748B) },
                    startAngle = start,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = Offset(size.width / 2f - radius, size.height / 2f - radius),
                    size = Size(radius * 2f, radius * 2f),
                    style = Stroke(width = stroke),
                )
            }
            start += sweep
        }
    }
}

@Composable
fun VerticalBarChart(
    values: List<Double>,
    labels: List<String>,
    colors: List<Color>,
    modifier: Modifier = Modifier,
) {
    val max = values.maxOfOrNull { if (it > 0) it else 0.0 }?.takeIf { it > 0 } ?: 1.0
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().weight(1f)) {
            val grid = 4
            for (i in 0..grid) {
                val y = size.height * i / grid
                drawLine(
                    color = Color(0x2264748B),
                    start = Offset(0f, y),
                    end = Offset(size.width, y),
                    strokeWidth = 1f,
                )
            }
            if (values.isEmpty()) return@Canvas
            val slot = size.width / values.size
            val barWidth = minOf(slot * 0.34f, 34f)
            values.forEachIndexed { index, value ->
                val height = (value / max * size.height * 0.86f).toFloat()
                val x = slot * index + slot / 2f - if (index % 2 == 0) barWidth - 2f else 2f
                drawRect(
                    color = colors.getOrElse(index % colors.size) { Color(0xFF10B981) },
                    topLeft = Offset(x, size.height - height),
                    size = Size(barWidth, height),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            labels.forEach { label ->
                Text(
                    text = label,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
fun PairedBarChart(
    income: List<Double>,
    expense: List<Double>,
    labels: List<String>,
    modifier: Modifier = Modifier,
) {
    val max = (income + expense).maxOfOrNull { if (it > 0) it else 0.0 }?.takeIf { it > 0 } ?: 1.0
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().weight(1f)) {
            for (i in 0..4) {
                val y = size.height * i / 4f
                drawLine(Color(0x2264748B), Offset(0f, y), Offset(size.width, y), 1f)
            }
            val count = maxOf(income.size, expense.size)
            if (count == 0) return@Canvas
            val slot = size.width / count
            val barWidth = minOf(slot * 0.28f, 16f)
            income.forEachIndexed { index, value ->
                val h = (value / max * size.height * 0.84f).toFloat()
                drawRect(
                    Color(0xFF10B981),
                    Offset(slot * index + slot / 2f - barWidth - 2f, size.height - h),
                    Size(barWidth, h),
                )
            }
            expense.forEachIndexed { index, value ->
                val h = (value / max * size.height * 0.84f).toFloat()
                drawRect(
                    Color(0xFFF43F5E),
                    Offset(slot * index + slot / 2f + 2f, size.height - h),
                    Size(barWidth, h),
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            labels.forEach { label ->
                Text(
                    label,
                    Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
fun HorizontalBarChart(
    entries: List<Pair<String, Double>>,
    colors: List<Color>,
    modifier: Modifier = Modifier,
) {
    val max = entries.maxOfOrNull { if (it.second > 0) it.second else 0.0 }?.takeIf { it > 0 } ?: 1.0
    Column(modifier) {
        entries.forEachIndexed { index, entry ->
            Text(entry.first, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(2.dp))
            Canvas(Modifier.fillMaxWidth().height(10.dp)) {
                drawRect(Color(0x1A64748B), Offset.Zero, Size(size.width, size.height))
                val width = (entry.second / max * size.width).toFloat()
                drawRect(
                    colors.getOrElse(index) { Color(0xFF64748B) },
                    Offset.Zero,
                    Size(width, size.height),
                )
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
fun BoxChartLegend(
    items: List<Pair<String, Color>>,
    modifier: Modifier = Modifier,
) {
    Row(modifier) {
        items.forEach { (label, color) ->
            Row(Modifier.padding(end = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Canvas(Modifier.width(8.dp).height(8.dp)) { drawRect(color) }
                Spacer(Modifier.width(4.dp))
                Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
