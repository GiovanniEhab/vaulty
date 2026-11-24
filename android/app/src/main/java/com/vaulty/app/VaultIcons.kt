package com.vaulty.app

import androidx.annotation.DrawableRes
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size

@Composable
fun VaultIcon(
    name: String,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    size: Dp = 16.dp,
) {
    Icon(
        painter = painterResource(iconRes(name)),
        contentDescription = null,
        modifier = modifier.size(size),
        tint = tint,
    )
}

@DrawableRes
fun iconRes(name: String): Int = when (name.trim().lowercase()) {
    "alert-circle" -> R.drawable.ic_lucide_alert_circle
    "arrow-down-left" -> R.drawable.ic_lucide_arrow_down_left
    "arrow-left-right", "transfer" -> R.drawable.ic_lucide_arrow_left_right
    "arrow-up-right" -> R.drawable.ic_lucide_arrow_up_right
    "banknote" -> R.drawable.ic_lucide_banknote
    "bell" -> R.drawable.ic_lucide_bell
    "bell-off" -> R.drawable.ic_lucide_bell_off
    "briefcase" -> R.drawable.ic_lucide_briefcase
    "calendar" -> R.drawable.ic_lucide_calendar
    "car" -> R.drawable.ic_lucide_car
    "check" -> R.drawable.ic_lucide_check
    "chevron-down" -> R.drawable.ic_lucide_chevron_down
    "chevron-left" -> R.drawable.ic_lucide_chevron_left
    "chevron-right" -> R.drawable.ic_lucide_chevron_right
    "cloud" -> R.drawable.ic_lucide_cloud
    "cloud-off" -> R.drawable.ic_lucide_cloud_off
    "credit-card" -> R.drawable.ic_lucide_credit_card
    "database" -> R.drawable.ic_lucide_database
    "download" -> R.drawable.ic_lucide_download
    "film" -> R.drawable.ic_lucide_film
    "gift" -> R.drawable.ic_lucide_gift
    "graduation-cap" -> R.drawable.ic_lucide_graduation_cap
    "heart-pulse" -> R.drawable.ic_lucide_heart_pulse
    "home" -> R.drawable.ic_lucide_home
    "landmark" -> R.drawable.ic_lucide_landmark
    "laptop" -> R.drawable.ic_lucide_laptop
    "layout-grid" -> R.drawable.ic_lucide_layout_grid
    "mic" -> R.drawable.ic_lucide_mic
    "mic-off" -> R.drawable.ic_lucide_mic_off
    "minus-circle" -> R.drawable.ic_lucide_minus_circle
    "moon" -> R.drawable.ic_lucide_moon
    "pencil" -> R.drawable.ic_lucide_pencil
    "pie-chart" -> R.drawable.ic_lucide_pie_chart
    "piggy-bank" -> R.drawable.ic_lucide_piggy_bank
    "plus" -> R.drawable.ic_lucide_plus
    "plus-circle" -> R.drawable.ic_lucide_plus_circle
    "receipt" -> R.drawable.ic_lucide_receipt
    "repeat" -> R.drawable.ic_lucide_repeat
    "search" -> R.drawable.ic_lucide_search
    "send" -> R.drawable.ic_lucide_send
    "shopping-bag" -> R.drawable.ic_lucide_shopping_bag
    "shopping-cart" -> R.drawable.ic_lucide_shopping_cart
    "sliders-horizontal" -> R.drawable.ic_lucide_sliders_horizontal
    "sparkles" -> R.drawable.ic_lucide_sparkles
    "sun" -> R.drawable.ic_lucide_sun
    "tag" -> R.drawable.ic_lucide_tag
    "trash-2" -> R.drawable.ic_lucide_trash_2
    "trending-up" -> R.drawable.ic_lucide_trending_up
    "upload" -> R.drawable.ic_lucide_upload
    "utensils" -> R.drawable.ic_lucide_utensils
    "volume-2" -> R.drawable.ic_lucide_volume_2
    "volume-x" -> R.drawable.ic_lucide_volume_x
    "wallet" -> R.drawable.ic_lucide_wallet
    "x" -> R.drawable.ic_lucide_x
    "zap" -> R.drawable.ic_lucide_zap
    else -> R.drawable.ic_lucide_tag
}
