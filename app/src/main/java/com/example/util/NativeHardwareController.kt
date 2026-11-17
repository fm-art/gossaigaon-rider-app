package com.example.util

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.example.R
import com.example.model.BatteryStatusSnapshot
import java.util.Locale

class NativeHardwareController(private val context: Context) {

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var locationListener: LocationListener? = null

    init {
        createNotificationChannel()
        initTts()
    }

    private fun initTts() {
        runCatching {
            tts = TextToSpeech(context.applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tts?.language = Locale("en", "IN")
                    ttsReady = true
                }
            }
        }
    }

    fun speakAnnouncement(text: String, enabled: Boolean = true) {
        if (!enabled || !ttsReady) return
        runCatching {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "fleet_tts_${System.currentTimeMillis()}")
        }
    }

    fun vibrateSuccess() {
        vibratePattern(longArrayOf(0, 45, 60, 75))
    }

    fun vibrateAlert() {
        vibratePattern(longArrayOf(0, 120, 80, 140, 80, 180))
    }

    fun vibrateTap() {
        vibratePattern(longArrayOf(0, 25))
    }

    private fun vibratePattern(pattern: LongArray) {
        runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(pattern, -1)
                }
            }
        }
    }

    fun readBatteryStatus(): BatteryStatusSnapshot {
        return runCatching {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val statusIntent = context.registerReceiver(null, filter)
            val level = statusIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = statusIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val status = statusIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
            val pct = if (level >= 0 && scale > 0) (level * 100) / scale else 85
            BatteryStatusSnapshot(
                supported = true,
                levelPercent = pct.coerceIn(1, 100),
                charging = charging
            )
        }.getOrDefault(BatteryStatusSnapshot(true, 85, false))
    }

    fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    @SuppressLint("MissingPermission")
    fun requestSingleGpsFix(onResult: (Double, Double) -> Unit, onError: (String) -> Unit) {
        if (!hasLocationPermission()) {
            onError("Location permission required for live GPS fix.")
            return
        }
        runCatching {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (lm == null) {
                onError("Location service unavailable.")
                return
            }
            val lastGps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (lastGps != null && lastGps.latitude != 0.0 && lastGps.longitude != 0.0) {
                onResult(lastGps.latitude, lastGps.longitude)
                return
            }
            val provider = when {
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
            if (provider == null) {
                // Emulator fallback around Gossaigaon Bazar with slight jitter
                onResult(26.4524, 89.9723)
                return
            }
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    onResult(location.latitude, location.longitude)
                    lm.removeUpdates(this)
                }
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            locationListener = listener
            lm.requestLocationUpdates(provider, 0L, 0f, listener)
        }.onFailure {
            onResult(26.4524, 89.9723)
        }
    }

    fun postNativeNotification(title: String, body: String) {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) return
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_bell)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .build()
            nm.notify((System.currentTimeMillis() % 10000).toInt(), notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Gossaigaon Fleet Dispatch",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Real-time multi-store batch alerts and payout confirmations"
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.createNotificationChannel(channel)
        }
    }

    private var ringToneGenerator: android.media.ToneGenerator? = null
    private var audioRecord: android.media.AudioRecord? = null
    private var audioTrack: android.media.AudioTrack? = null
    @Volatile
    private var voiceStreamingActive = false
    private var voiceThread: Thread? = null

    fun setCallAudioRouting(speakerOn: Boolean, muted: Boolean) {
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return
            am.mode = android.media.AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = speakerOn
            am.isMicrophoneMute = muted
        }
    }

    fun playRingbackBurst() {
        runCatching {
            if (ringToneGenerator == null) {
                ringToneGenerator = android.media.ToneGenerator(
                    android.media.AudioManager.STREAM_VOICE_CALL,
                    75
                )
            }
            ringToneGenerator?.startTone(android.media.ToneGenerator.TONE_SUP_RINGTONE, 900)
        }
    }

    fun stopRingbackTone() {
        runCatching {
            ringToneGenerator?.stopTone()
            ringToneGenerator?.release()
        }
        ringToneGenerator = null
    }

    fun hasAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    fun startLiveVoiceEngine(
        onMicFrame: (Float, String?) -> Unit
    ) {
        stopRingbackTone()
        if (voiceStreamingActive) return
        if (!hasAudioPermission()) return

        voiceStreamingActive = true
        voiceThread = Thread {
            val sampleRate = 8000
            val minBuf = android.media.AudioRecord.getMinBufferSize(
                sampleRate,
                android.media.AudioFormat.CHANNEL_IN_MONO,
                android.media.AudioFormat.ENCODING_PCM_16BIT
            ).coerceAtLeast(1600)

            runCatching {
                val recorder = android.media.AudioRecord(
                    android.media.MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    sampleRate,
                    android.media.AudioFormat.CHANNEL_IN_MONO,
                    android.media.AudioFormat.ENCODING_PCM_16BIT,
                    minBuf * 2
                )
                audioRecord = recorder

                val trackBuf = android.media.AudioTrack.getMinBufferSize(
                    sampleRate,
                    android.media.AudioFormat.CHANNEL_OUT_MONO,
                    android.media.AudioFormat.ENCODING_PCM_16BIT
                ).coerceAtLeast(1600)

                val track = android.media.AudioTrack.Builder()
                    .setAudioAttributes(
                        android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAudioFormat(
                        android.media.AudioFormat.Builder()
                            .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(trackBuf * 2)
                    .setTransferMode(android.media.AudioTrack.MODE_STREAM)
                    .build()
                audioTrack = track
                track.play()

                if (recorder.state == android.media.AudioRecord.STATE_INITIALIZED) {
                    recorder.startRecording()
                    val shortBuf = ShortArray(800) // 100ms frame at 8kHz
                    var frameCounter = 0
                    while (voiceStreamingActive) {
                        val read = recorder.read(shortBuf, 0, shortBuf.size)
                        if (read > 0) {
                            var sumSq = 0.0
                            for (i in 0 until read) {
                                val v = shortBuf[i].toDouble()
                                sumSq += v * v
                            }
                            val rms = kotlin.math.sqrt(sumSq / read)
                            val normalized = (rms / 6500.0).coerceIn(0.0, 1.0).toFloat()

                            frameCounter++
                            // Encode & push every ~5th active voice frame (~500ms) when speaking
                            val b64 = if (frameCounter % 5 == 0 && normalized > 0.04f) {
                                val byteBuf = java.nio.ByteBuffer.allocate(read * 2)
                                    .order(java.nio.ByteOrder.LITTLE_ENDIAN)
                                for (i in 0 until read) {
                                    byteBuf.putShort(shortBuf[i])
                                }
                                android.util.Base64.encodeToString(
                                    byteBuf.array(),
                                    android.util.Base64.NO_WRAP
                                )
                            } else null

                            onMicFrame(normalized, b64)
                        } else {
                            Thread.sleep(60)
                        }
                    }
                }
            }
        }.apply {
            name = "FleetVoipAudioThread"
            isDaemon = true
            start()
        }
    }

    fun playRemotePcmBase64(pcmBase64: String) {
        if (!voiceStreamingActive) return
        runCatching {
            val bytes = android.util.Base64.decode(pcmBase64, android.util.Base64.NO_WRAP)
            val track = audioTrack
            if (track != null && track.playState == android.media.AudioTrack.PLAYSTATE_PLAYING) {
                track.write(bytes, 0, bytes.size)
            }
        }
    }

    fun stopLiveVoiceEngine() {
        voiceStreamingActive = false
        stopRingbackTone()
        runCatching {
            audioRecord?.stop()
            audioRecord?.release()
        }
        audioRecord = null
        runCatching {
            audioTrack?.stop()
            audioTrack?.release()
        }
        audioTrack = null
        voiceThread = null
    }

    fun resetCallAudioMode() {
        stopLiveVoiceEngine()
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = false
            am.isMicrophoneMute = false
            am.mode = android.media.AudioManager.MODE_NORMAL
        }
    }

    fun shutdown() {
        resetCallAudioMode()
        runCatching {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            locationListener?.let { lm?.removeUpdates(it) }
            tts?.stop()
            tts?.shutdown()
        }
    }

    companion object {
        private const val CHANNEL_ID = "gossaigaon_fleet_dispatch_v1"
    }
}
