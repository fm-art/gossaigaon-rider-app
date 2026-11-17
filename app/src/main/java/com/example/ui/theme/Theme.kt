package com.example.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R

val DarkBackgroundColor = Color(0xFF090D16)
val LightBackgroundColor = Color(0xFFF1F5F9)

@Immutable
data class FleetExtendedColors(
    val isDark: Boolean,
    val cardElevated: Color,
    val cardSubtle: Color,
    val borderSubtle: Color,
    val borderStrong: Color,
    val textMuted: Color,
    val success: Color,
    val successContainer: Color,
    val warning: Color,
    val warningContainer: Color,
    val danger: Color,
    val dangerContainer: Color,
    val info: Color,
    val infoContainer: Color,
    val heroGradient: Brush,
    val accentGradient: Brush
)

val LocalFleetColors = staticCompositionLocalOf {
    FleetExtendedColors(
        isDark = true,
        cardElevated = Color(0xFF131B2E),
        cardSubtle = Color(0xFF0E1525),
        borderSubtle = Color(0xFF1E293B),
        borderStrong = Color(0xFF334155),
        textMuted = Color(0xFF94A3B8),
        success = Color(0xFF10B981),
        successContainer = Color(0x2610B981),
        warning = Color(0xFFF59E0B),
        warningContainer = Color(0x26F59E0B),
        danger = Color(0xFFEF4444),
        dangerContainer = Color(0x26EF4444),
        info = Color(0xFF06B6D4),
        infoContainer = Color(0x2606B6D4),
        heroGradient = Brush.linearGradient(
            listOf(Color(0xFF1E293B), Color(0xFF0F172A))
        ),
        accentGradient = Brush.horizontalGradient(
            listOf(Color(0xFFF59E0B), Color(0xFFEA580C))
        )
    )
}

val PlusJakartaSans = FontFamily(
    Font(R.font.plus_jakarta_sans, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans, FontWeight.SemiBold),
    Font(R.font.plus_jakarta_sans, FontWeight.Bold),
    Font(R.font.plus_jakarta_sans, FontWeight.ExtraBold)
)

val JetBrainsMono = FontFamily(
    Font(R.font.jetbrains_mono, FontWeight.Normal),
    Font(R.font.jetbrains_mono, FontWeight.Medium),
    Font(R.font.jetbrains_mono, FontWeight.Bold)
)

val FleetTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.5).sp
    ),
    headlineLarge = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.3).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp
    ),
    titleLarge = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Bold,
        fontSize = 17.sp,
        lineHeight = 23.sp
    ),
    titleMedium = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        lineHeight = 20.sp
    ),
    titleSmall = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp
    ),
    bodySmall = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelLarge = TextStyle(
        fontFamily = PlusJakartaSans,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.3.sp
    ),
    labelMedium = TextStyle(
        fontFamily = JetBrainsMono,
        fontWeight = FontWeight.Bold,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp
    ),
    labelSmall = TextStyle(
        fontFamily = JetBrainsMono,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.5.sp
    )
)

val FleetShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

private val FleetDarkColorScheme = darkColorScheme(
    primary = Color(0xFFF59E0B),
    onPrimary = Color(0xFF090D16),
    primaryContainer = Color(0xFF3B2506),
    onPrimaryContainer = Color(0xFFFDE68A),
    secondary = Color(0xFF06B6D4),
    onSecondary = Color(0xFF042F2E),
    secondaryContainer = Color(0xFF083344),
    onSecondaryContainer = Color(0xFFA5F3FC),
    tertiary = Color(0xFF10B981),
    onTertiary = Color(0xFF052E16),
    background = DarkBackgroundColor,
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFFCBD5E1),
    error = Color(0xFFEF4444),
    onError = Color.White
)

private val FleetLightColorScheme = lightColorScheme(
    primary = Color(0xFFEA580C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFEDD5),
    onPrimaryContainer = Color(0xFF7C2D12),
    secondary = Color(0xFF0284C7),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE0F2FE),
    onSecondaryContainer = Color(0xFF0C4A6E),
    tertiary = Color(0xFF059669),
    onTertiary = Color.White,
    background = LightBackgroundColor,
    onBackground = Color(0xFF0F172A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFE2E8F0),
    onSurfaceVariant = Color(0xFF334155),
    error = Color(0xFFDC2626),
    onError = Color.White
)

@Composable
fun GossaigaonFleetTheme(
    isDarkMode: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (isDarkMode) FleetDarkColorScheme else FleetLightColorScheme

    val extended = if (isDarkMode) {
        FleetExtendedColors(
            isDark = true,
            cardElevated = Color(0xFF151E32),
            cardSubtle = Color(0xFF0D1322),
            borderSubtle = Color(0xFF23304A),
            borderStrong = Color(0xFF3B4F78),
            textMuted = Color(0xFF94A3B8),
            success = Color(0xFF10B981),
            successContainer = Color(0x2810B981),
            warning = Color(0xFFF59E0B),
            warningContainer = Color(0x28F59E0B),
            danger = Color(0xFFEF4444),
            dangerContainer = Color(0x28EF4444),
            info = Color(0xFF06B6D4),
            infoContainer = Color(0x2806B6D4),
            heroGradient = Brush.linearGradient(
                listOf(Color(0xFF1E293B), Color(0xFF0F172A), Color(0xFF1C1917))
            ),
            accentGradient = Brush.horizontalGradient(
                listOf(Color(0xFFF59E0B), Color(0xFFEA580C))
            )
        )
    } else {
        FleetExtendedColors(
            isDark = false,
            cardElevated = Color(0xFFFFFFFF),
            cardSubtle = Color(0xFFF8FAFC),
            borderSubtle = Color(0xFFCBD5E1),
            borderStrong = Color(0xFF64748B),
            textMuted = Color(0xFF475569),
            success = Color(0xFF059669),
            successContainer = Color(0xFFD1FAE5),
            warning = Color(0xFFD97706),
            warningContainer = Color(0xFFFEF3C7),
            danger = Color(0xFFDC2626),
            dangerContainer = Color(0xFFFEE2E2),
            info = Color(0xFF0284C7),
            infoContainer = Color(0xFFE0F2FE),
            heroGradient = Brush.linearGradient(
                listOf(Color(0xFFFFEDD5), Color(0xFFE0F2FE))
            ),
            accentGradient = Brush.horizontalGradient(
                listOf(Color(0xFFEA580C), Color(0xFFD97706))
            )
        )
    }

    CompositionLocalProvider(LocalFleetColors provides extended) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = FleetTypography,
            shapes = FleetShapes,
            content = content
        )
    }
}
