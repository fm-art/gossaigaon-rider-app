package com.gossaigaon.rider;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationForegroundService extends Service implements LocationListener {

    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    private static final String CHANNEL_ID = "gossaigaon_rider_gps";
    private static final int NOTIF_ID = 777;
    private static final long SYNC_INTERVAL_MS = 5000L;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private double lastLat = 0.0;
    private double lastLng = 0.0;
    private boolean hasLocation = false;
    private boolean isRunning = false;

    private final Runnable syncTask = new Runnable() {
        @Override
        public void run() {
            if (!isRunning) return;
            pushLocationToFirebase();
            handler.postDelayed(this, SYNC_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GossaigaonRider::GpsWakeLock");
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            saveActiveState(false);
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        SharedPreferences prefs = getSharedPreferences("rider_gps_prefs", MODE_PRIVATE);
        if (intent != null && intent.hasExtra("uid")) {
            prefs.edit()
                    .putString("uid", intent.getStringExtra("uid"))
                    .putString("idToken", intent.getStringExtra("idToken"))
                    .putString("refreshToken", intent.getStringExtra("refreshToken"))
                    .putString("apiKey", intent.getStringExtra("apiKey"))
                    .putString("dbUrl", intent.getStringExtra("dbUrl"))
                    .putString("activeOrderIds", intent.getStringExtra("activeOrderIds"))
                    .putBoolean("tracking", true)
                    .apply();
        }

        if (!prefs.getBoolean("tracking", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundNotification();
        startLocationUpdates();

        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(10 * 60 * 60 * 1000L);
        }

        if (!isRunning) {
            isRunning = true;
            handler.removeCallbacks(syncTask);
            handler.post(syncTask);
        }

        return START_STICKY;
    }

    private void saveActiveState(boolean active) {
        getSharedPreferences("rider_gps_prefs", MODE_PRIVATE)
                .edit().putBoolean("tracking", active).apply();
    }

    private void startForegroundNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Rider Live GPS", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Gossaigaon Rider Online")
                .setContentText("Live GPS har 5 second me update ho rahi hai")
                .setSmallIcon(R.drawable.ic_rider)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
                Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (last != null) updateCoordinates(last);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
                if (!hasLocation) {
                    Location net = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                    if (net != null) updateCoordinates(net);
                }
            }
        } catch (SecurityException ignored) {}
    }

    private void updateCoordinates(Location loc) {
        lastLat = Math.round(loc.getLatitude() * 1_000_000.0) / 1_000_000.0;
        lastLng = Math.round(loc.getLongitude() * 1_000_000.0) / 1_000_000.0;
        hasLocation = true;
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        updateCoordinates(location);
    }

    @Override
    public void onProviderEnabled(@NonNull String provider) {}

    @Override
    public void onProviderDisabled(@NonNull String provider) {}

    private void pushLocationToFirebase() {
        if (!hasLocation) return;
        final double lat = lastLat;
        final double lng = lastLng;

        executor.execute(() -> {
            SharedPreferences prefs = getSharedPreferences("rider_gps_prefs", MODE_PRIVATE);
            String uid = prefs.getString("uid", "");
            String idToken = prefs.getString("idToken", "");
            String refreshToken = prefs.getString("refreshToken", "");
            String apiKey = prefs.getString("apiKey", "");
            String dbUrl = prefs.getString("dbUrl", "");
            String orderIdsCsv = prefs.getString("activeOrderIds", "");

            if (uid.isEmpty() || dbUrl.isEmpty() || idToken.isEmpty()) return;

            long now = System.currentTimeMillis();
            try {
                JSONObject riderBody = new JSONObject();
                riderBody.put("lat", lat);
                riderBody.put("lng", lng);
                riderBody.put("online", true);
                riderBody.put("lastSeen", now);
                riderBody.put("lastLocationUpdate", now);

                int code = sendFirebasePatch(dbUrl + "/deliveryPartners/" + uid + ".json?auth=" + idToken, riderBody.toString());
                if (code == 401 && !refreshToken.isEmpty() && !apiKey.isEmpty()) {
                    String newToken = refreshFirebaseIdToken(apiKey, refreshToken, prefs);
                    if (newToken != null) {
                        idToken = newToken;
                        sendFirebasePatch(dbUrl + "/deliveryPartners/" + uid + ".json?auth=" + idToken, riderBody.toString());
                    }
                }

                if (!orderIdsCsv.isEmpty()) {
                    JSONObject orderBody = new JSONObject();
                    orderBody.put("riderLat", lat);
                    orderBody.put("riderLng", lng);
                    orderBody.put("lastLocationUpdate", now);
                    String[] ids = orderIdsCsv.split(",");
                    for (String oid : ids) {
                        String cleanId = oid.trim();
                        if (!cleanId.isEmpty()) {
                            sendFirebasePatch(dbUrl + "/orders/" + cleanId + ".json?auth=" + idToken, orderBody.toString());
                        }
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private int sendFirebasePatch(String targetUrl, String jsonPayload) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(targetUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
            }
            return conn.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String refreshFirebaseIdToken(String apiKey, String refreshToken, SharedPreferences prefs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + apiKey);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setDoOutput(true);
            String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() == 200) {
                BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                JSONObject res = new JSONObject(sb.toString());
                String newIdToken = res.optString("id_token", "");
                String newRefresh = res.optString("refresh_token", refreshToken);
                if (!newIdToken.isEmpty()) {
                    prefs.edit().putString("idToken", newIdToken).putString("refreshToken", newRefresh).apply();
                    return newIdToken;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private void stopSelfCleanly() {
        isRunning = false;
        handler.removeCallbacks(syncTask);
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        handler.removeCallbacks(syncTask);
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        executor.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
