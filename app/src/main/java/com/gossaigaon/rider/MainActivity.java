package com.gossaigaon.rider;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_BASE_PERMS = 101;
    private static final int REQ_BG_LOC = 102;

    private WebView webView;
    private String pendingUid, pendingToken, pendingRefresh, pendingApiKey, pendingDbUrl, pendingOrderIds;
    private boolean hasPendingStart = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false;
                }
                if (url.startsWith("tel:")) {
                    startActivity(new Intent(Intent.ACTION_DIAL, uri));
                    return true;
                }
                if (url.startsWith("https://wa.me/") || url.contains("google.com/maps") || url.startsWith("upi://") || url.startsWith("mailto:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.addJavascriptInterface(new RiderJsBridge(), "AndroidBridge");
        webView.loadUrl("https://appassets.androidplatform.net/assets/deliver.html");

        requestInitialPermissions();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    private void requestInitialPermissions() {
        List<String> perms = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!perms.isEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), REQ_BASE_PERMS);
        } else {
            promptBackgroundLocationIfNeeded();
        }
    }

    private void promptBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(this)
                    .setTitle("Background GPS Required")
                    .setMessage("Screen off ya app minimize hone par bhi har 5 second me live location bhejne ke liye Location permission ko 'Allow all the time' par set karein.")
                    .setPositiveButton("Allow", (d, w) -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.fromParts("package", getPackageName(), null));
                            startActivity(intent);
                        } else {
                            ActivityCompat.requestPermissions(this,
                                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BG_LOC);
                        }
                    })
                    .setNegativeButton("Later", null)
                    .show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_BASE_PERMS) {
            boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (fineGranted) {
                if (hasPendingStart) {
                    hasPendingStart = false;
                    launchTrackingService(pendingUid, pendingToken, pendingRefresh, pendingApiKey, pendingDbUrl, pendingOrderIds);
                }
                promptBackgroundLocationIfNeeded();
            }
        }
    }

    private void launchTrackingService(String uid, String idToken, String refreshToken, String apiKey, String dbUrl, String activeOrderIdsCsv) {
        boolean hasLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (!hasLoc) {
            pendingUid = uid;
            pendingToken = idToken;
            pendingRefresh = refreshToken;
            pendingApiKey = apiKey;
            pendingDbUrl = dbUrl;
            pendingOrderIds = activeOrderIdsCsv;
            hasPendingStart = true;
            requestInitialPermissions();
            return;
        }

        Intent intent = new Intent(this, LocationForegroundService.class);
        intent.setAction(LocationForegroundService.ACTION_START);
        intent.putExtra("uid", uid);
        intent.putExtra("idToken", idToken);
        intent.putExtra("refreshToken", refreshToken);
        intent.putExtra("apiKey", apiKey);
        intent.putExtra("dbUrl", dbUrl);
        intent.putExtra("activeOrderIds", activeOrderIdsCsv);
        ContextCompat.startForegroundService(this, intent);
    }

    public class RiderJsBridge {
        @JavascriptInterface
        public void startTracking(String uid, String idToken, String refreshToken, String apiKey, String dbUrl, String activeOrderIdsCsv) {
            runOnUiThread(() -> launchTrackingService(uid, idToken, refreshToken, apiKey, dbUrl, activeOrderIdsCsv));
        }

        @JavascriptInterface
        public void stopTracking() {
            runOnUiThread(() -> {
                hasPendingStart = false;
                Intent intent = new Intent(MainActivity.this, LocationForegroundService.class);
                intent.setAction(LocationForegroundService.ACTION_STOP);
                startService(intent);
            });
        }
    }
}
