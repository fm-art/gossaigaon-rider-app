package com.example.ui.components

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.domain.RiderDomainLogic
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors

@Composable
fun QrScannerDialogComposable(
    trip: TripGroup,
    onDismiss: () -> Unit,
    onQrDecoded: (String) -> Unit
) {
    val ext = LocalFleetColors.current
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    var scanError by remember { mutableStateOf("") }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    // Zero-permission Android Photo Picker for scanning QR from gallery/screenshot
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            val decoded = decodeQrFromUri(context, uri)
            if (decoded != null) {
                onQrDecoded(decoded)
            } else {
                scanError = "No valid QR code found in the selected photo."
            }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, MaterialTheme.colorScheme.primary, MaterialTheme.shapes.extraLarge)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.QrCodeScanner,
                            contentDescription = "QR Scanner",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Customer Delivery QR",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Trip #${trip.tripId.takeLast(6).uppercase()} • Scam Shield Protected",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(Modifier.height(12.dp))

                if (hasCameraPermission) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(ext.cardSubtle)
                            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        CameraXQrPreview(
                            onDecoded = { raw ->
                                onQrDecoded(raw)
                            }
                        )
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ext.cardElevated.copy(alpha = 0.85f),
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(8.dp)
                        ) {
                            Text(
                                text = "Align customer order QR inside frame",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
                } else {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = ext.cardSubtle,
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, ext.borderSubtle, RoundedCornerShape(16.dp))
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.CameraAlt,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(34.dp)
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Grant Camera Permission for live optical QR scanning, or pick a QR screenshot below.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                            Spacer(Modifier.height(10.dp))
                            Button(
                                onClick = { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) }
                            ) {
                                Text("Enable Camera Scanner")
                            }
                        }
                    }
                }

                if (scanError.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    BannerBox(text = scanError, color = ext.danger, bg = ext.dangerContainer)
                }

                Spacer(Modifier.height(12.dp))

                // Photo Picker Option (Play Policy Compliant)
                OutlinedButton(
                    onClick = {
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp)
                        .testTag("qr_pick_photo_btn")
                ) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Scan QR from Customer Screenshot")
                }
            }
        }
    }
}

@Composable
private fun CameraXQrPreview(onDecoded: (String) -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    var emitted by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { executor.shutdown() }
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                runCatching {
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val reader = MultiFormatReader()
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { imageAnalysis ->
                            imageAnalysis.setAnalyzer(executor) { imageProxy ->
                                if (!emitted) {
                                    runCatching {
                                        val plane = imageProxy.planes.firstOrNull()
                                        if (plane != null) {
                                            val buffer = plane.buffer
                                            val bytes = ByteArray(buffer.remaining())
                                            buffer.get(bytes)
                                            val source = PlanarYUVLuminanceSource(
                                                bytes,
                                                imageProxy.width,
                                                imageProxy.height,
                                                0,
                                                0,
                                                imageProxy.width,
                                                imageProxy.height,
                                                false
                                            )
                                            val bitmap = BinaryBitmap(HybridBinarizer(source))
                                            val result = reader.decodeWithState(bitmap)
                                            if (!result.text.isNullOrBlank()) {
                                                emitted = true
                                                onDecoded(result.text)
                                            }
                                        }
                                    }
                                }
                                imageProxy.close()
                            }
                        }
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis
                    )
                }
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        }
    )
}

private fun decodeQrFromUri(context: Context, uri: Uri): String? {
    return runCatching {
        context.contentResolver.openInputStream(uri)?.use { stream ->
            val bitmap = BitmapFactory.decodeStream(stream) ?: return null
            val width = bitmap.width
            val height = bitmap.height
            val pixels = IntArray(width * height)
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
            val source = RGBLuminanceSource(width, height, pixels)
            val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
            MultiFormatReader().decode(binaryBitmap).text
        }
    }.getOrNull()
}
