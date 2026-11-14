package com.gossaigaon.rider;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LocationForegroundService extends Service implements LocationListener {

    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    private static final String CHANNEL_GPS = "gossaigaon_rider_gps";
    private static final String CHANNEL_ORDER = "gossaigaon_new_order_ring";
    private static final int NOTIF_GPS_ID = 777;
    public static final int NOTIF_ORDER_ID = 888;
    private static final long SYNC_INTERVAL_MS = 5000L;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private double lastLat = 0.0, lastLng = 0.0;
    private double trailLat = 0.0, trailLng = 0.0;
    private boolean hasLocation = false, isRunning = false;
    private boolean isInsistentNotifShowing = false;

    private final List<String> activeOrderIds = new ArrayList<>();
    private final List<Map<String, Object>> recentRoute = new ArrayList<>();

    private DatabaseReference ordersRef;
    private ValueEventListener ordersListener;

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
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundNotification();
        startLocationUpdates();
        attachBackgroundOrderWatcher(user.getUid());

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

    private void startForegroundNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_GPS, "Rider Live GPS", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);

            Uri ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringUri == null) ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            NotificationChannel ordCh = new NotificationChannel(CHANNEL_ORDER, "New Order Ringtone", NotificationManager.IMPORTANCE_HIGH);
            ordCh.enableVibration(true);
            ordCh.setVibrationPattern(new long[]{0, 600, 300, 600});
            ordCh.setSound(ringUri, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            nm.createNotificationChannel(ordCh);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_GPS)
                .setContentTitle("Gossaigaon Rider Online")
                .setContentText("Live GPS har 5 second me update ho rahi hai")
                .setSmallIcon(R.drawable.ic_rider)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_GPS_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_GPS_ID, notif);
            }
        } catch (SecurityException ignored) {
            stopSelf();
        }
    }

    private void attachBackgroundOrderWatcher(String uid) {
        if (ordersListener != null) return;
        ordersRef = FirebaseDatabase.getInstance().getReference("orders");
        ordersListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                activeOrderIds.clear();
                boolean hasUnacceptedOrder = false;

                for (DataSnapshot ds : snapshot.getChildren()) {
                    String dUid = TripHelper.getStr(ds, "deliveryUid", "");
                    String status = TripHelper.getStr(ds, "status", "PLACED");
                    if (uid.equals(dUid) && !"DELIVERED".equals(status) && !"CANCELLED".equals(status)) {
                        String oid = ds.getKey();
                        if (oid != null) activeOrderIds.add(oid);
                        Object acc = ds.child("riderAccepted").getValue();
                        if (!(acc instanceof Boolean && (Boolean) acc)) {
                            hasUnacceptedOrder = true;
                        }
                    }
                }

                if (hasUnacceptedOrder && !MainActivity.isAppInForeground) {
                    if (!isInsistentNotifShowing) {
                        showInsistentOrderNotification();
                    }
                } else {
                    cancelOrderNotification();
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        };
        ordersRef.addValueEventListener(ordersListener);
    }

    private void showInsistentOrderNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        isInsistentNotifShowing = true;

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 1, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Uri ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringUri == null) ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ORDER)
                .setContentTitle("🔔 New Grocery Trip Assigned!")
                .setContentText("Accept karne ke liye tap karein!")
                .setSmallIcon(R.drawable.ic_rider)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setSound(ringUri)
                .setVibrate(new long[]{0, 600, 300, 600})
                .setContentIntent(pi)
                .build();

        // FLAG_INSISTENT keeps ringing continuously until user opens/clears it
        n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(NOTIF_ORDER_ID, n);
    }

    private void cancelOrderNotification() {
        isInsistentNotifShowing = false;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ORDER_ID);
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
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) return;

        long now = System.currentTimeMillis();
        DatabaseReference db = FirebaseDatabase.getInstance().getReference();

        Map<String, Object> riderMap = new HashMap<>();
        riderMap.put("lat", lastLat);
        riderMap.put("lng", lastLng);
        riderMap.put("online", true);
        riderMap.put("lastSeen", now);
        riderMap.put("lastLocationUpdate", now);

        double moved = TripHelper.calculateDistanceKm(trailLat, trailLng, lastLat, lastLng);
        if (trailLat == 0.0 || moved < 0 || moved >= 0.015) {
            Map<String, Object> pt = new HashMap<>();
            pt.put("lat", lastLat);
            pt.put("lng", lastLng);
            pt.put("time", now);
            recentRoute.add(pt);
            if (recentRoute.size() > 20) recentRoute.remove(0);
            riderMap.put("recentRoute", new ArrayList<>(recentRoute));
            trailLat = lastLat;
            trailLng = lastLng;
        }

        db.child("deliveryPartners").child(user.getUid()).updateChildren(riderMap);

        Map<String, Object> orderLoc = new HashMap<>();
        orderLoc.put("riderLat", lastLat);
        orderLoc.put("riderLng", lastLng);
        orderLoc.put("lastLocationUpdate", now);
        for (String oid : new ArrayList<>(activeOrderIds)) {
            db.child("orders").child(oid).updateChildren(orderLoc);
        }
    }

    private void stopSelfCleanly() {
        isRunning = false;
        handler.removeCallbacks(syncTask);
        cancelOrderNotification();
        if (locationManager != null) locationManager.removeUpdates(this);
        if (ordersRef != null && ordersListener != null) {
            ordersRef.removeEventListener(ordersListener);
            ordersListener = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        handler.removeCallbacks(syncTask);
        cancelOrderNotification();
        if (locationManager != null) locationManager.removeUpdates(this);
        if (ordersRef != null && ordersListener != null) {
            ordersRef.removeEventListener(ordersListener);
            ordersListener = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
